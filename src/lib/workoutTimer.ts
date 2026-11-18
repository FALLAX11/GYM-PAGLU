import type { ActiveExerciseDraft } from '../services/workoutService';

export type RestTimerStatus = 'idle' | 'running' | 'paused';
export type WorkoutSessionStatus = 'running' | 'paused';

export interface ActiveWorkoutSessionState {
  userId: string;
  sessionId: string;
  planId: string | null;
  workoutName: string;
  workoutDate: string;
  startedAtMs: number;
  sessionStatus: WorkoutSessionStatus;
  pausedAtMs: number | null;
  totalPausedMs: number;
  sessionNotes: string;
  exercises: ActiveExerciseDraft[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  restDurationSeconds: number;
  restStatus: RestTimerStatus;
  restEndAtMs: number | null;
  restPausedRemainingSeconds: number;
  updatedAtMs: number;
}

export function getWorkoutDraftStorageKey(userId: string): string {
  return `gympaglu_active_workout_v2_${userId}`;
}

export function computeElapsedSeconds(
  startedAtMs: number,
  nowMs: number = Date.now(),
  totalPausedMs: number = 0
): number {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - startedAtMs - totalPausedMs) / 1000));
}

export function computeSessionElapsedSeconds(
  session: Pick<
    ActiveWorkoutSessionState,
    'startedAtMs' | 'sessionStatus' | 'pausedAtMs' | 'totalPausedMs'
  >,
  nowMs: number = Date.now()
): number {
  const effectiveNowMs =
    session.sessionStatus === 'paused' && session.pausedAtMs !== null
      ? session.pausedAtMs
      : nowMs;
  return computeElapsedSeconds(
    session.startedAtMs,
    effectiveNowMs,
    session.totalPausedMs || 0
  );
}

export function pauseSessionTimer(
  session: ActiveWorkoutSessionState,
  nowMs: number = Date.now()
): ActiveWorkoutSessionState {
  if (session.sessionStatus === 'paused') return session;
  return {
    ...session,
    sessionStatus: 'paused',
    pausedAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function resumeSessionTimer(
  session: ActiveWorkoutSessionState,
  nowMs: number = Date.now()
): ActiveWorkoutSessionState {
  if (session.sessionStatus !== 'paused') return session;
  const pausedDelta =
    session.pausedAtMs !== null ? Math.max(0, nowMs - session.pausedAtMs) : 0;
  return {
    ...session,
    sessionStatus: 'running',
    pausedAtMs: null,
    totalPausedMs: (session.totalPausedMs || 0) + pausedDelta,
    updatedAtMs: nowMs,
  };
}

export function computeRestRemainingSeconds(
  session: Pick<
    ActiveWorkoutSessionState,
    'restStatus' | 'restEndAtMs' | 'restPausedRemainingSeconds'
  >,
  nowMs: number = Date.now()
): number {
  if (session.restStatus === 'running' && session.restEndAtMs !== null) {
    return Math.max(0, Math.ceil((session.restEndAtMs - nowMs) / 1000));
  }
  if (session.restStatus === 'paused') {
    return Math.max(0, Math.ceil(session.restPausedRemainingSeconds));
  }
  return 0;
}

export function reconcileRestTimerOnTick(
  session: ActiveWorkoutSessionState,
  nowMs: number = Date.now()
): { nextSession: ActiveWorkoutSessionState; justFinished: boolean } {
  if (session.restStatus !== 'running' || session.restEndAtMs === null) {
    return { nextSession: session, justFinished: false };
  }
  if (nowMs >= session.restEndAtMs) {
    return {
      nextSession: {
        ...session,
        restStatus: 'idle',
        restEndAtMs: null,
        restPausedRemainingSeconds: 0,
        updatedAtMs: nowMs,
      },
      justFinished: true,
    };
  }
  return { nextSession: session, justFinished: false };
}

export function adjustRestTimerByDelta(
  session: ActiveWorkoutSessionState,
  deltaSeconds: number,
  nowMs: number = Date.now()
): ActiveWorkoutSessionState {
  if (session.restStatus === 'running' && session.restEndAtMs !== null) {
    const currentRemainingMs = Math.max(0, session.restEndAtMs - nowMs);
    const nextRemainingMs = currentRemainingMs + deltaSeconds * 1000;
    if (nextRemainingMs <= 0) {
      return {
        ...session,
        restStatus: 'idle',
        restEndAtMs: null,
        restPausedRemainingSeconds: 0,
        updatedAtMs: nowMs,
      };
    }
    const nextSecs = Math.ceil(nextRemainingMs / 1000);
    return {
      ...session,
      restDurationSeconds: Math.max(session.restDurationSeconds, nextSecs),
      restEndAtMs: nowMs + nextRemainingMs,
      updatedAtMs: nowMs,
    };
  }

  if (session.restStatus === 'paused') {
    const nextRemaining = Math.max(0, Math.round(session.restPausedRemainingSeconds + deltaSeconds));
    if (nextRemaining <= 0) {
      return {
        ...session,
        restStatus: 'idle',
        restEndAtMs: null,
        restPausedRemainingSeconds: 0,
        updatedAtMs: nowMs,
      };
    }
    return {
      ...session,
      restDurationSeconds: Math.max(session.restDurationSeconds, nextRemaining),
      restPausedRemainingSeconds: nextRemaining,
      updatedAtMs: nowMs,
    };
  }

  // Idle state: positive delta starts a quick rest timer
  if (deltaSeconds > 0) {
    const startSecs = Math.max(5, Math.round(deltaSeconds));
    return {
      ...session,
      restDurationSeconds: startSecs,
      restStatus: 'running',
      restEndAtMs: nowMs + startSecs * 1000,
      restPausedRemainingSeconds: 0,
      updatedAtMs: nowMs,
    };
  }

  return session;
}

export function makeSessionUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function loadPersistedWorkoutSession(
  userId: string
): ActiveWorkoutSessionState | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const key = getWorkoutDraftStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveWorkoutSessionState>;
    if (
      parsed.userId !== userId ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.startedAtMs !== 'number' ||
      !Array.isArray(parsed.exercises)
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      sessionId: parsed.sessionId,
      planId: parsed.planId ?? null,
      workoutName: parsed.workoutName || 'Strength Session',
      workoutDate: parsed.workoutDate || new Date(parsed.startedAtMs).toISOString().slice(0, 10),
      startedAtMs: parsed.startedAtMs,
      sessionStatus: parsed.sessionStatus === 'paused' ? 'paused' : 'running',
      pausedAtMs: typeof parsed.pausedAtMs === 'number' ? parsed.pausedAtMs : null,
      totalPausedMs: typeof parsed.totalPausedMs === 'number' ? parsed.totalPausedMs : 0,
      sessionNotes: parsed.sessionNotes ?? '',
      exercises: parsed.exercises,
      currentExerciseIndex: typeof parsed.currentExerciseIndex === 'number' ? parsed.currentExerciseIndex : 0,
      currentSetIndex: typeof parsed.currentSetIndex === 'number' ? parsed.currentSetIndex : 0,
      restDurationSeconds: typeof parsed.restDurationSeconds === 'number' ? parsed.restDurationSeconds : 90,
      restStatus:
        parsed.restStatus === 'running' || parsed.restStatus === 'paused'
          ? parsed.restStatus
          : 'idle',
      restEndAtMs: typeof parsed.restEndAtMs === 'number' ? parsed.restEndAtMs : null,
      restPausedRemainingSeconds:
        typeof parsed.restPausedRemainingSeconds === 'number'
          ? parsed.restPausedRemainingSeconds
          : 0,
      updatedAtMs: typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : Date.now(),
    };
  } catch {
    return null;
  }
}

export function persistWorkoutSession(session: ActiveWorkoutSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getWorkoutDraftStorageKey(session.userId),
      JSON.stringify(session)
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function clearPersistedWorkoutSession(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.removeItem(getWorkoutDraftStorageKey(userId));
    window.localStorage.removeItem('gympaglu_active_workout_draft_v1');
  } catch {
    // Ignore
  }
}
