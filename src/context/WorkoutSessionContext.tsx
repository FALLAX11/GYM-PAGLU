import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { triggerHaptic } from '../lib/capacitor';
import {
  computeSessionPRSummary,
  evaluateSetPR,
  persistSessionPRSummary,
} from '../lib/prDetection';
import {
  loadRestAudioEnabled,
  saveRestAudioEnabled,
  triggerRestAlertFeedback,
} from '../lib/soundAlerts';
import { getLocalDateString } from '../lib/units';
import {
  adjustRestTimerByDelta,
  clearPersistedWorkoutSession,
  computeRestRemainingSeconds,
  computeSessionElapsedSeconds,
  loadPersistedWorkoutSession,
  makeSessionUuid,
  pauseSessionTimer,
  persistWorkoutSession,
  reconcileRestTimerOnTick,
  resumeSessionTimer,
  type ActiveWorkoutSessionState,
} from '../lib/workoutTimer';
import {
  fetchAllTimeExercisePRs,
  saveWorkoutSession,
  type ActiveExerciseDraft,
} from '../services/workoutService';
import type {
  ExerciseItem,
  ExercisePRBaseline,
  PreviousExercisePerformance,
  SetType,
  WorkoutPlanExercise,
  WorkoutSessionRecord,
} from '../types/database';

export interface StartWorkoutOptions {
  planId?: string | null;
  workoutName?: string;
  presetExercises?: WorkoutPlanExercise[];
}

export interface AddExerciseConfig {
  setsCount: number;
  reps: number;
  weightKg: number;
  restSeconds: number;
  notes: string;
}

interface WorkoutSessionContextValue {
  session: ActiveWorkoutSessionState | null;
  isActive: boolean;
  isSessionPaused: boolean;
  pendingRecovery: boolean;
  elapsedSeconds: number;
  restRemainingSeconds: number;
  restAudioEnabled: boolean;
  prBaselines: Record<string, ExercisePRBaseline>;
  saving: boolean;
  saveError: string;
  clearSaveError: () => void;
  startNewWorkout: (options?: StartWorkoutOptions) => void;
  acknowledgeRecovery: () => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  toggleWorkoutPause: () => void;
  discardWorkout: () => void;
  setWorkoutName: (name: string) => void;
  setWorkoutDate: (date: string) => void;
  setSessionNotes: (notes: string) => void;
  setCurrentPosition: (exIndex: number, setIndex: number) => void;
  addExerciseToSession: (
    ex: ExerciseItem,
    prevPerf?: PreviousExercisePerformance | null,
    config?: Partial<AddExerciseConfig>
  ) => void;
  removeExercise: (exIndex: number) => void;
  updateExerciseNotes: (exIndex: number, notes: string) => void;
  updateExerciseRestSeconds: (exIndex: number, restSeconds: number) => void;
  setExerciseSuperset: (exIndex: number, groupLetter: string | null) => void;
  prependWarmupSets: (
    exIndex: number,
    warmupSets: Array<{ weight_kg: number; reps: number }>
  ) => void;
  addSet: (exIndex: number) => void;
  removeSet: (exIndex: number, setIndex: number) => void;
  updateSetField: (
    exIndex: number,
    setIndex: number,
    patch: Partial<{
      weight_kg: number;
      reps: number;
      is_completed: boolean;
      set_type: SetType;
      rpe: number | null;
    }>
  ) => void;
  toggleSetComplete: (exIndex: number, setIndex: number) => void;
  startRestTimer: (seconds: number) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  pauseRestTimer: () => void;
  resumeRestTimer: () => void;
  toggleRestTimer: () => void;
  resetRestTimer: () => void;
  toggleRestAudio: () => void;
  finishAndSaveWorkout: () => Promise<WorkoutSessionRecord>;
}

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(null);

export function WorkoutSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, settings } = useAuth();
  const { showToast } = useToast();

  const [session, setSession] = useState<ActiveWorkoutSessionState | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [restAudioEnabled, setRestAudioEnabled] = useState(true);
  const [prBaselines, setPrBaselines] = useState<Record<string, ExercisePRBaseline>>({});

  const hydratedUserIdRef = useRef<string | null>(null);
  const firedRestEndRef = useRef<number | null>(null);
  const inFlightSaveRef = useRef<Promise<WorkoutSessionRecord> | null>(null);
  const defaultRestSeconds = settings.default_rest_seconds || 90;

  useEffect(() => {
    if (!user) {
      hydratedUserIdRef.current = null;
      setSession(null);
      setPendingRecovery(false);
      setSaveError('');
      setPrBaselines({});
      setRestAudioEnabled(true);
      return;
    }

    setRestAudioEnabled(loadRestAudioEnabled(user.id));

    if (hydratedUserIdRef.current === user.id) return;
    hydratedUserIdRef.current = user.id;

    let restored = loadPersistedWorkoutSession(user.id);

    if (!restored && typeof window !== 'undefined') {
      try {
        const legacyRaw = window.localStorage.getItem('gympaglu_active_workout_draft_v1');
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw) as {
            userId?: string;
            clientRequestId?: string;
            planId?: string | null;
            workoutName?: string;
            workoutDate?: string;
            startedAt?: string;
            sessionNotes?: string;
            exercises?: ActiveExerciseDraft[];
          };
          if (legacy.userId === user.id && legacy.clientRequestId && legacy.startedAt) {
            const parsedStart = new Date(legacy.startedAt).getTime();
            restored = {
              userId: user.id,
              sessionId: legacy.clientRequestId,
              planId: legacy.planId ?? null,
              workoutName: legacy.workoutName || 'Strength Session',
              workoutDate: legacy.workoutDate || getLocalDateString(),
              startedAtMs: Number.isFinite(parsedStart) ? parsedStart : Date.now(),
              sessionStatus: 'running',
              pausedAtMs: null,
              totalPausedMs: 0,
              sessionNotes: legacy.sessionNotes ?? '',
              exercises: Array.isArray(legacy.exercises) ? legacy.exercises : [],
              currentExerciseIndex: 0,
              currentSetIndex: 0,
              restDurationSeconds: defaultRestSeconds,
              restStatus: 'idle',
              restEndAtMs: null,
              restPausedRemainingSeconds: 0,
              updatedAtMs: Date.now(),
            };
            persistWorkoutSession(restored);
          }
          window.localStorage.removeItem('gympaglu_active_workout_draft_v1');
        }
      } catch {
        // Ignore corrupt legacy draft
      }
    }

    if (restored) {
      const reconciled = reconcileRestTimerOnTick(restored, Date.now());
      setSession(reconciled.nextSession);
      setNowMs(Date.now());
      setPendingRecovery(true);
    }

    void fetchAllTimeExercisePRs(user.id, restored?.sessionId)
      .then(setPrBaselines)
      .catch(() => {});
  }, [defaultRestSeconds, user]);

  useEffect(() => {
    if (!session) return;
    persistWorkoutSession(session);
  }, [session]);

  const syncNow = useCallback(() => {
    const current = Date.now();
    setNowMs(current);
    setSession((prev) => {
      if (!prev) return prev;
      const { nextSession, justFinished } = reconcileRestTimerOnTick(prev, current);
      if (justFinished && prev.restEndAtMs && firedRestEndRef.current !== prev.restEndAtMs) {
        firedRestEndRef.current = prev.restEndAtMs;
        triggerRestAlertFeedback(restAudioEnabled);
        showToast('Rest timer finished — next set ready.', 'info');
      }
      return nextSession;
    });
  }, [restAudioEnabled, showToast]);

  useEffect(() => {
    if (!session) return;
    syncNow();

    const intervalId = window.setInterval(syncNow, 500);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncNow();
      }
    };
    const onFocus = () => syncNow();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    let capHandlePromise: Promise<{ remove: () => Promise<void> }> | null = null;
    if (Capacitor.isNativePlatform()) {
      capHandlePromise = CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          syncNow();
        }
      });
    }

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      if (capHandlePromise) {
        void capHandlePromise.then((h) => h.remove());
      }
    };
  }, [Boolean(session), syncNow]);

  const updateSession = useCallback(
    (updater: (prev: ActiveWorkoutSessionState) => ActiveWorkoutSessionState) => {
      setSession((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        return { ...next, updatedAtMs: Date.now() };
      });
    },
    []
  );

  const startNewWorkout = useCallback(
    (options?: StartWorkoutOptions) => {
      if (!user) return;
      const now = Date.now();
      const presetExercises: ActiveExerciseDraft[] = (options?.presetExercises ?? []).map(
        (pe) => ({
          tempId: makeSessionUuid(),
          exercise_id: pe.exercise_id,
          custom_exercise_id: pe.custom_exercise_id,
          exercise_name: pe.exercise_name,
          exercise_category: pe.exercise_category,
          rest_seconds: pe.rest_seconds || defaultRestSeconds,
          exercise_notes: '',
          superset_group: null,
          sets: Array.from({ length: pe.target_sets || 3 }, (_, idx) => ({
            set_number: idx + 1,
            weight_kg: 0,
            reps: 8,
            is_completed: false,
            rest_seconds: pe.rest_seconds || defaultRestSeconds,
            set_type: 'normal',
            rpe: null,
          })),
        })
      );

      const newSessionId = makeSessionUuid();
      const created: ActiveWorkoutSessionState = {
        userId: user.id,
        sessionId: newSessionId,
        planId: options?.planId ?? null,
        workoutName: options?.workoutName?.trim() || 'Strength Session',
        workoutDate: getLocalDateString(),
        startedAtMs: now,
        sessionStatus: 'running',
        pausedAtMs: null,
        totalPausedMs: 0,
        sessionNotes: '',
        exercises: presetExercises,
        currentExerciseIndex: 0,
        currentSetIndex: 0,
        restDurationSeconds: defaultRestSeconds,
        restStatus: 'idle',
        restEndAtMs: null,
        restPausedRemainingSeconds: 0,
        updatedAtMs: now,
      };

      firedRestEndRef.current = null;
      setSaveError('');
      setPendingRecovery(false);
      setNowMs(now);
      setSession(created);
      persistWorkoutSession(created);

      void fetchAllTimeExercisePRs(user.id, newSessionId)
        .then(setPrBaselines)
        .catch(() => {});
    },
    [defaultRestSeconds, user]
  );

  const acknowledgeRecovery = useCallback(() => {
    setPendingRecovery(false);
    syncNow();
  }, [syncNow]);

  const pauseWorkout = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    updateSession((prev) => pauseSessionTimer(prev, now));
  }, [updateSession]);

  const resumeWorkout = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    updateSession((prev) => resumeSessionTimer(prev, now));
  }, [updateSession]);

  const toggleWorkoutPause = useCallback(() => {
    if (!session) return;
    if (session.sessionStatus === 'paused') {
      resumeWorkout();
      showToast('Workout session resumed.', 'info');
    } else {
      pauseWorkout();
      showToast('Workout session paused.', 'info');
    }
  }, [pauseWorkout, resumeWorkout, session, showToast]);

  const discardWorkout = useCallback(() => {
    if (user) {
      clearPersistedWorkoutSession(user.id);
    }
    firedRestEndRef.current = null;
    setSaveError('');
    setPendingRecovery(false);
    setSession(null);
  }, [user]);

  const setWorkoutName = useCallback(
    (name: string) => updateSession((prev) => ({ ...prev, workoutName: name })),
    [updateSession]
  );

  const setWorkoutDate = useCallback(
    (date: string) => updateSession((prev) => ({ ...prev, workoutDate: date })),
    [updateSession]
  );

  const setSessionNotes = useCallback(
    (notes: string) => updateSession((prev) => ({ ...prev, sessionNotes: notes })),
    [updateSession]
  );

  const setCurrentPosition = useCallback(
    (exIndex: number, setIndex: number) =>
      updateSession((prev) => ({
        ...prev,
        currentExerciseIndex: Math.max(0, exIndex),
        currentSetIndex: Math.max(0, setIndex),
      })),
    [updateSession]
  );

  const addExerciseToSession = useCallback(
    (
      ex: ExerciseItem,
      prevPerf?: PreviousExercisePerformance | null,
      config?: Partial<AddExerciseConfig>
    ) => {
      updateSession((prev) => {
        const restSeconds = Math.max(
          10,
          Math.round(config?.restSeconds ?? defaultRestSeconds)
        );
        const setsCount = Math.max(
          1,
          Math.min(20, Math.round(config?.setsCount ?? (prevPerf?.sets.length || 3)))
        );
        const notes = config?.notes?.trim() ?? '';

        const defaultSets =
          config && config.setsCount !== undefined
            ? Array.from({ length: setsCount }, (_, idx) => ({
                set_number: idx + 1,
                weight_kg: Number(config.weightKg ?? prevPerf?.sets[idx]?.weight_kg ?? 0) || 0,
                reps: Math.max(
                  1,
                  Math.round(Number(config.reps ?? prevPerf?.sets[idx]?.reps ?? 10))
                ),
                is_completed: false,
                rest_seconds: restSeconds,
                set_type: 'normal' as SetType,
                rpe: null,
              }))
            : prevPerf && prevPerf.sets.length > 0
              ? prevPerf.sets.map((s, idx) => ({
                  set_number: idx + 1,
                  weight_kg: s.weight_kg,
                  reps: s.reps,
                  is_completed: false,
                  rest_seconds: restSeconds,
                  set_type: s.set_type ?? ('normal' as SetType),
                  rpe: s.rpe ?? null,
                }))
              : [
                  {
                    set_number: 1,
                    weight_kg: 20,
                    reps: 10,
                    is_completed: false,
                    rest_seconds: restSeconds,
                    set_type: 'normal' as SetType,
                    rpe: null,
                  },
                ];

        const nextExercises: ActiveExerciseDraft[] = [
          ...prev.exercises,
          {
            tempId: makeSessionUuid(),
            exercise_id: ex.is_custom ? null : ex.id,
            custom_exercise_id: ex.is_custom ? ex.id : null,
            exercise_name: ex.name,
            exercise_category: ex.category,
            rest_seconds: restSeconds,
            exercise_notes: notes,
            superset_group: null,
            sets: defaultSets,
          },
        ];

        return {
          ...prev,
          exercises: nextExercises,
          currentExerciseIndex: nextExercises.length - 1,
          currentSetIndex: 0,
        };
      });
    },
    [defaultRestSeconds, updateSession]
  );

  const removeExercise = useCallback(
    (exIndex: number) => {
      updateSession((prev) => {
        const nextExercises = prev.exercises.filter((_, i) => i !== exIndex);
        return {
          ...prev,
          exercises: nextExercises,
          currentExerciseIndex: Math.max(
            0,
            Math.min(prev.currentExerciseIndex, nextExercises.length - 1)
          ),
          currentSetIndex: 0,
        };
      });
    },
    [updateSession]
  );

  const updateExerciseNotes = useCallback(
    (exIndex: number, notes: string) => {
      updateSession((prev) => ({
        ...prev,
        exercises: prev.exercises.map((item, idx) =>
          idx === exIndex ? { ...item, exercise_notes: notes } : item
        ),
      }));
    },
    [updateSession]
  );

  const updateExerciseRestSeconds = useCallback(
    (exIndex: number, restSeconds: number) => {
      const clean = Math.max(10, Math.min(600, Math.round(restSeconds)));
      updateSession((prev) => ({
        ...prev,
        exercises: prev.exercises.map((item, idx) =>
          idx === exIndex
            ? {
                ...item,
                rest_seconds: clean,
                sets: item.sets.map((s) => ({ ...s, rest_seconds: clean })),
              }
            : item
        ),
      }));
    },
    [updateSession]
  );

  const setExerciseSuperset = useCallback(
    (exIndex: number, groupLetter: string | null) => {
      updateSession((prev) => ({
        ...prev,
        exercises: prev.exercises.map((item, idx) =>
          idx === exIndex ? { ...item, superset_group: groupLetter } : item
        ),
      }));
    },
    [updateSession]
  );

  const prependWarmupSets = useCallback(
    (exIndex: number, warmupSets: Array<{ weight_kg: number; reps: number }>) => {
      if (warmupSets.length === 0) return;
      updateSession((prev) => ({
        ...prev,
        exercises: prev.exercises.map((ex, i) => {
          if (i !== exIndex) return ex;
          const inserted = warmupSets.map((w, idx) => ({
            set_number: idx + 1,
            weight_kg: Math.max(0, Math.round(w.weight_kg * 100) / 100),
            reps: Math.max(1, Math.round(w.reps)),
            is_completed: false,
            rest_seconds: Math.min(60, ex.rest_seconds || 60),
            set_type: 'warmup' as SetType,
            rpe: null,
          }));
          const combined = [...inserted, ...ex.sets].map((s, idx) => ({
            ...s,
            set_number: idx + 1,
          }));
          return { ...ex, sets: combined };
        }),
      }));
    },
    [updateSession]
  );

  const addSet = useCallback(
    (exIndex: number) => {
      updateSession((prev) => ({
        ...prev,
        currentExerciseIndex: exIndex,
        exercises: prev.exercises.map((ex, i) => {
          if (i !== exIndex) return ex;
          const last = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            sets: [
              ...ex.sets,
              {
                set_number: ex.sets.length + 1,
                weight_kg: last?.weight_kg ?? 0,
                reps: last?.reps ?? 10,
                is_completed: false,
                rest_seconds: ex.rest_seconds,
                set_type: last?.set_type === 'warmup' ? 'normal' : last?.set_type ?? 'normal',
                rpe: null,
              },
            ],
          };
        }),
      }));
    },
    [updateSession]
  );

  const removeSet = useCallback(
    (exIndex: number, setIndex: number) => {
      updateSession((prev) => ({
        ...prev,
        exercises: prev.exercises.map((ex, i) => {
          if (i !== exIndex) return ex;
          const filtered = ex.sets
            .filter((_, j) => j !== setIndex)
            .map((s, idx) => ({ ...s, set_number: idx + 1 }));
          return { ...ex, sets: filtered };
        }),
      }));
    },
    [updateSession]
  );

  const updateSetField = useCallback(
    (
      exIndex: number,
      setIndex: number,
      patch: Partial<{
        weight_kg: number;
        reps: number;
        is_completed: boolean;
        set_type: SetType;
        rpe: number | null;
      }>
    ) => {
      updateSession((prev) => ({
        ...prev,
        currentExerciseIndex: exIndex,
        currentSetIndex: setIndex,
        exercises: prev.exercises.map((ex, i) => {
          if (i !== exIndex) return ex;
          const nextSets = ex.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s));
          return { ...ex, sets: nextSets };
        }),
      }));
    },
    [updateSession]
  );

  const startRestTimer = useCallback(
    (seconds: number) => {
      const cleanSeconds = Math.max(5, Math.round(seconds));
      const now = Date.now();
      firedRestEndRef.current = null;
      setNowMs(now);
      updateSession((prev) => ({
        ...prev,
        restDurationSeconds: cleanSeconds,
        restStatus: 'running',
        restEndAtMs: now + cleanSeconds * 1000,
        restPausedRemainingSeconds: 0,
      }));
    },
    [updateSession]
  );

  const adjustRestTimer = useCallback(
    (deltaSeconds: number) => {
      const now = Date.now();
      firedRestEndRef.current = null;
      setNowMs(now);
      updateSession((prev) => adjustRestTimerByDelta(prev, deltaSeconds, now));
    },
    [updateSession]
  );

  const pauseRestTimer = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    updateSession((prev) => {
      const remaining = computeRestRemainingSeconds(prev, now);
      return {
        ...prev,
        restStatus: remaining > 0 ? 'paused' : 'idle',
        restEndAtMs: null,
        restPausedRemainingSeconds: remaining,
      };
    });
  }, [updateSession]);

  const resumeRestTimer = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    updateSession((prev) => {
      if (prev.restPausedRemainingSeconds <= 0) return prev;
      firedRestEndRef.current = null;
      return {
        ...prev,
        restStatus: 'running',
        restEndAtMs: now + prev.restPausedRemainingSeconds * 1000,
        restPausedRemainingSeconds: 0,
      };
    });
  }, [updateSession]);

  const toggleRestTimer = useCallback(() => {
    if (!session) return;
    if (session.restStatus === 'running') {
      pauseRestTimer();
    } else if (session.restStatus === 'paused' && session.restPausedRemainingSeconds > 0) {
      resumeRestTimer();
    } else {
      startRestTimer(session.restDurationSeconds || defaultRestSeconds);
    }
  }, [defaultRestSeconds, pauseRestTimer, resumeRestTimer, session, startRestTimer]);

  const resetRestTimer = useCallback(() => {
    firedRestEndRef.current = null;
    updateSession((prev) => ({
      ...prev,
      restStatus: 'idle',
      restEndAtMs: null,
      restPausedRemainingSeconds: 0,
    }));
  }, [updateSession]);

  const toggleRestAudio = useCallback(() => {
    setRestAudioEnabled((prev) => {
      const next = !prev;
      if (user) saveRestAudioEnabled(user.id, next);
      return next;
    });
  }, [user]);

  const toggleSetComplete = useCallback(
    (exIndex: number, setIndex: number) => {
      if (!session) return;
      const targetEx = session.exercises[exIndex];
      const targetSet = targetEx?.sets[setIndex];
      if (!targetSet) return;
      const nextDone = !targetSet.is_completed;
      const nextNow = Date.now();

      // Check if completing this set breaks an all-time PR
      let prResult = null;
      if (nextDone) {
        const priorSets = targetEx.sets.filter((_, idx) => idx !== setIndex);
        prResult = evaluateSetPR({
          weightKg: targetSet.weight_kg,
          reps: targetSet.reps,
          setType: targetSet.set_type ?? 'normal',
          baseline: prBaselines[targetEx.exercise_name],
          priorWorkingSetsInSession: priorSets,
        });
      }

      // Superset smart rest: if linked to a superset group and another exercise in the same group
      // further down in the workout hasn't completed this round yet, skip auto-starting rest until round finishes.
      let shouldStartRest = nextDone;
      if (nextDone && targetEx.superset_group) {
        const hasPendingSiblingAfter = session.exercises.some(
          (other, idx) =>
            idx > exIndex &&
            other.superset_group === targetEx.superset_group &&
            Boolean(other.sets[setIndex] && !other.sets[setIndex].is_completed)
        );
        if (hasPendingSiblingAfter) {
          shouldStartRest = false;
        }
      }

      updateSession((prev) => {
        const nextExercises = prev.exercises.map((ex, i) => {
          if (i !== exIndex) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, j) =>
              j === setIndex ? { ...s, is_completed: nextDone } : s
            ),
          };
        });

        if (shouldStartRest) {
          const restSecs =
            targetEx.rest_seconds || prev.restDurationSeconds || defaultRestSeconds;
          firedRestEndRef.current = null;
          return {
            ...prev,
            exercises: nextExercises,
            currentExerciseIndex: exIndex,
            currentSetIndex: setIndex,
            restDurationSeconds: restSecs,
            restStatus: 'running',
            restEndAtMs: nextNow + restSecs * 1000,
            restPausedRemainingSeconds: 0,
          };
        }

        return {
          ...prev,
          exercises: nextExercises,
          currentExerciseIndex: exIndex,
          currentSetIndex: setIndex,
        };
      });

      if (nextDone) {
        setNowMs(nextNow);
        if (prResult?.anyPR) {
          void triggerHaptic('heavy');
          showToast(
            `New PR on ${targetEx.exercise_name}: ${prResult.labels.join(' + ')}!`,
            'success'
          );
        } else {
          void triggerHaptic('medium');
        }
      }
    },
    [defaultRestSeconds, prBaselines, session, showToast, updateSession]
  );

  const finishAndSaveWorkout = useCallback(async (): Promise<WorkoutSessionRecord> => {
    if (inFlightSaveRef.current) {
      return inFlightSaveRef.current;
    }

    if (!user || !session) {
      throw new Error('No active workout session to save.');
    }
    setSaveError('');

    if (session.exercises.length === 0) {
      const msg = 'Add at least one exercise before saving your workout.';
      setSaveError(msg);
      throw new Error(msg);
    }

    const completedCount = session.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.is_completed).length,
      0
    );
    if (completedCount === 0) {
      const msg = 'Mark at least one set as completed before saving.';
      setSaveError(msg);
      throw new Error(msg);
    }

    const runSave = (async () => {
      setSaving(true);
      try {
        const endMs = Date.now();
        const prHighlights = computeSessionPRSummary(session.exercises, prBaselines);

        const saved = await saveWorkoutSession(user.id, {
          client_request_id: session.sessionId,
          plan_id: session.planId,
          workout_name: session.workoutName,
          workout_date: session.workoutDate,
          started_at: new Date(session.startedAtMs).toISOString(),
          ended_at: new Date(endMs).toISOString(),
          duration_seconds: computeSessionElapsedSeconds(session, endMs),
          session_notes: session.sessionNotes,
          exercises: session.exercises,
        });

        if (prHighlights.length > 0) {
          persistSessionPRSummary(user.id, {
            sessionId: saved.id,
            clientRequestId: saved.client_request_id,
            workoutName: saved.workout_name,
            workoutDate: saved.workout_date,
            achievedAt: new Date().toISOString(),
            highlights: prHighlights,
          });
        }

        clearPersistedWorkoutSession(user.id);
        firedRestEndRef.current = null;
        setPendingRecovery(false);
        setSession(null);
        void triggerHaptic('heavy');
        showToast(
          prHighlights.length > 0
            ? `Workout saved with ${prHighlights.length} PR${prHighlights.length > 1 ? 's' : ''}!`
            : 'Workout saved.',
          'success'
        );

        void fetchAllTimeExercisePRs(user.id)
          .then(setPrBaselines)
          .catch(() => {});

        return saved;
      } catch (err) {
        const msg = `Save failed: ${(err as Error).message}. Your sets and timer remain safely preserved — tap Save again to retry.`;
        setSaveError(msg);
        throw new Error(msg);
      } finally {
        inFlightSaveRef.current = null;
        setSaving(false);
      }
    })();

    inFlightSaveRef.current = runSave;
    return runSave;
  }, [prBaselines, session, showToast, user]);

  const elapsedSeconds = useMemo(
    () => (session ? computeSessionElapsedSeconds(session, nowMs) : 0),
    [nowMs, session]
  );

  const restRemainingSeconds = useMemo(
    () => (session ? computeRestRemainingSeconds(session, nowMs) : 0),
    [nowMs, session]
  );

  return (
    <WorkoutSessionContext.Provider
      value={{
        session,
        isActive: session !== null,
        isSessionPaused: session?.sessionStatus === 'paused',
        pendingRecovery,
        elapsedSeconds,
        restRemainingSeconds,
        restAudioEnabled,
        prBaselines,
        saving,
        saveError,
        clearSaveError: () => setSaveError(''),
        startNewWorkout,
        acknowledgeRecovery,
        pauseWorkout,
        resumeWorkout,
        toggleWorkoutPause,
        discardWorkout,
        setWorkoutName,
        setWorkoutDate,
        setSessionNotes,
        setCurrentPosition,
        addExerciseToSession,
        removeExercise,
        updateExerciseNotes,
        updateExerciseRestSeconds,
        setExerciseSuperset,
        prependWarmupSets,
        addSet,
        removeSet,
        updateSetField,
        toggleSetComplete,
        startRestTimer,
        adjustRestTimer,
        pauseRestTimer,
        resumeRestTimer,
        toggleRestTimer,
        resetRestTimer,
        toggleRestAudio,
        finishAndSaveWorkout,
      }}
    >
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSession(): WorkoutSessionContextValue {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx) throw new Error('useWorkoutSession must be used inside WorkoutSessionProvider');
  return ctx;
}
