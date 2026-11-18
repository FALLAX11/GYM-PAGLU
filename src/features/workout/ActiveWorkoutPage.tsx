import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calculator,
  Check,
  Clock,
  CloudCheck,
  Link2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Timer,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { MuscleBodySvg } from '../../components/workout/MuscleBodySvg';
import { PlateCalculatorModal } from '../../components/workout/PlateCalculatorModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWorkoutSession } from '../../context/WorkoutSessionContext';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTY_FILTERS,
  EXERCISE_EQUIPMENT_FILTERS,
  EXERCISE_TYPE_FILTERS,
  filterExercises,
} from '../../lib/exerciseSearch';
import { resolveExerciseMuscles } from '../../lib/muscleAnatomy';
import { evaluateSetPR } from '../../lib/prDetection';
import {
  formatDuration,
  formatWeight,
  toCanonicalWeightKg,
  toDisplayWeight,
} from '../../lib/units';
import {
  fetchExerciseCatalog,
  fetchPreviousExercisePerformance,
  type ActiveExerciseDraft,
} from '../../services/workoutService';
import type {
  ExerciseCategory,
  ExerciseDifficulty,
  ExerciseItem,
  ExerciseMovementType,
  PreviousExercisePerformance,
  SetType,
  WorkoutPlanExercise,
} from '../../types/database';

const SET_TYPE_ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const SUPERSET_GROUPS = ['A', 'B', 'C', 'D'] as const;

function nextSetType(current: SetType | undefined): SetType {
  const idx = SET_TYPE_ORDER.indexOf(current ?? 'normal');
  return SET_TYPE_ORDER[(idx + 1) % SET_TYPE_ORDER.length];
}

function nextSupersetGroup(current: string | null | undefined): string | null {
  if (!current) return 'A';
  const idx = SUPERSET_GROUPS.indexOf(current as (typeof SUPERSET_GROUPS)[number]);
  if (idx === -1 || idx === SUPERSET_GROUPS.length - 1) return null;
  return SUPERSET_GROUPS[idx + 1];
}

function getSupersetAccentColor(group: string | null | undefined): string | undefined {
  if (group === 'A') return '#C4F82A';
  if (group === 'B') return '#38BDF8';
  if (group === 'C') return '#C084FC';
  if (group === 'D') return '#F59E0B';
  return undefined;
}

function getSetTypeBadgeMeta(
  setType: SetType | undefined,
  setNumber: number
): { short: string; title: string; className: string } {
  if (setType === 'warmup') {
    return {
      short: 'W',
      title: 'Warm-up set (tap to cycle type)',
      className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    };
  }
  if (setType === 'drop') {
    return {
      short: 'D',
      title: 'Drop set (tap to cycle type)',
      className: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    };
  }
  if (setType === 'failure') {
    return {
      short: 'F',
      title: 'Failure set (tap to cycle type)',
      className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
  }
  return {
    short: String(setNumber),
    title: 'Normal working set (tap to switch to Warm-up / Drop / Failure)',
    className: 'bg-white/[0.04] text-zinc-300 border-white/10',
  };
}

function computeImprovementSummary(
  prev: PreviousExercisePerformance | null | undefined,
  currentSets: ActiveExerciseDraft['sets'],
  unit: 'kg' | 'lb'
): { label: string; improved: boolean } | null {
  if (!prev) return null;
  const completed = currentSets.filter(
    (s) => s.is_completed && s.reps > 0 && (s.set_type ?? 'normal') !== 'warmup'
  );
  if (completed.length === 0) return null;

  let currentBest = completed[0];
  let currentVolume = 0;
  for (const s of completed) {
    currentVolume += s.weight_kg * s.reps;
    if (
      s.weight_kg > currentBest.weight_kg ||
      (s.weight_kg === currentBest.weight_kg && s.reps > currentBest.reps)
    ) {
      currentBest = s;
    }
  }

  const weightDiffKg = Math.round((currentBest.weight_kg - prev.bestSet.weight_kg) * 10) / 10;
  const repDiff = currentBest.reps - prev.bestSet.reps;

  if (weightDiffKg > 0) {
    return {
      label: `+${toDisplayWeight(weightDiffKg, unit)} ${unit.toUpperCase()} heavier top set`,
      improved: true,
    };
  }
  if (weightDiffKg === 0 && repDiff > 0) {
    return {
      label: `+${repDiff} rep${repDiff > 1 ? 's' : ''} at ${toDisplayWeight(currentBest.weight_kg, unit)} ${unit.toUpperCase()}`,
      improved: true,
    };
  }
  if (currentVolume > prev.totalVolumeKg) {
    const volDelta = Math.round((currentVolume - prev.totalVolumeKg) * 10) / 10;
    return {
      label: `+${toDisplayWeight(volDelta, unit)} ${unit.toUpperCase()} total volume`,
      improved: true,
    };
  }
  return {
    label: `Target to beat: ${toDisplayWeight(prev.bestSet.weight_kg, unit)} ${unit.toUpperCase()} × ${prev.bestSet.reps} reps`,
    improved: false,
  };
}

export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, settings } = useAuth();
  const { showToast } = useToast();
  const {
    session,
    isSessionPaused,
    elapsedSeconds,
    restRemainingSeconds,
    restAudioEnabled,
    prBaselines,
    saving,
    saveError,
    startNewWorkout,
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
    toggleRestTimer,
    resetRestTimer,
    toggleRestAudio,
    finishAndSaveWorkout,
  } = useWorkoutSession();

  const routeState = location.state as {
    planId?: string;
    workoutName?: string;
    presetExercises?: WorkoutPlanExercise[];
    forceNew?: boolean;
    preselectExercise?: ExerciseItem;
  } | null;

  const initHandledRef = useRef(false);

  useEffect(() => {
    if (!user || initHandledRef.current) return;
    initHandledRef.current = true;

    if (routeState?.forceNew) {
      startNewWorkout({
        planId: routeState.planId ?? null,
        workoutName: routeState.workoutName,
        presetExercises: routeState.presetExercises,
      });
      navigate('/workout/active', { replace: true, state: null });
      return;
    }

    if (!session) {
      startNewWorkout({
        planId: routeState?.planId ?? null,
        workoutName: routeState?.workoutName,
        presetExercises: routeState?.presetExercises,
      });
    }

    const preselect = routeState?.preselectExercise;
    if (preselect) {
      openExerciseSetup(preselect);
      navigate('/workout/active', { replace: true, state: null });
    }
  }, [navigate, routeState, session, startNewWorkout, user]);

  const [previousMap, setPreviousMap] = useState<
    Record<string, PreviousExercisePerformance | null>
  >({});
  const [catalog, setCatalog] = useState<ExerciseItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Picker & Exercise Config State
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerCategory, setPickerCategory] = useState<'All' | ExerciseCategory>('All');
  const [pickerEquipment, setPickerEquipment] = useState<string>('All');
  const [pickerDifficulty, setPickerDifficulty] = useState<'All' | ExerciseDifficulty>('All');
  const [pickerType, setPickerType] = useState<'All' | ExerciseMovementType>('All');

  const [selectedForSetup, setSelectedForSetup] = useState<ExerciseItem | null>(null);
  const [setupSets, setSetupSets] = useState<number>(3);
  const [setupReps, setSetupReps] = useState<number>(10);
  const [setupWeightKg, setSetupWeightKg] = useState<number>(20);
  const [setupRestSeconds, setSetupRestSeconds] = useState<number>(
    settings.default_rest_seconds || 90
  );
  const [setupNotes, setSetupNotes] = useState<string>('');

  // Plate calculator modal state
  const [plateCalcTarget, setPlateCalcTarget] = useState<{
    open: boolean;
    exIndex: number | null;
    exerciseName?: string;
    initialDisplayWeight: number;
  }>({ open: false, exIndex: null, initialDisplayWeight: 60 });

  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const openExerciseSetup = (ex: ExerciseItem) => {
    setSelectedForSetup(ex);
    const prev = previousMap[ex.name];
    setSetupSets(prev?.sets.length || 3);
    setSetupReps(prev?.bestSet.reps || 10);
    setSetupWeightKg(prev?.bestSet.weight_kg ?? (ex.equipment === 'Bodyweight' ? 0 : 20));
    setSetupRestSeconds(settings.default_rest_seconds || 90);
    setSetupNotes('');
    setPickerOpen(true);
  };

  useEffect(() => {
    if (!user) return;
    setCatalogLoading(true);
    void fetchExerciseCatalog(user.id)
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  }, [user]);

  const exercises = session?.exercises ?? [];

  useEffect(() => {
    if (!user || exercises.length === 0) return;
    const missing = exercises
      .map((e) => e.exercise_name)
      .filter((name) => previousMap[name] === undefined);

    if (missing.length === 0) return;

    for (const exName of missing) {
      void fetchPreviousExercisePerformance(user.id, exName)
        .then((perf) => {
          setPreviousMap((prev) => ({ ...prev, [exName]: perf }));
        })
        .catch(() => {
          setPreviousMap((prev) => ({ ...prev, [exName]: null }));
        });
    }
  }, [exercises, previousMap, user]);

  const totalVolumeKg = useMemo(() => {
    let total = 0;
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.is_completed && s.weight_kg >= 0 && s.reps > 0) {
          total += s.weight_kg * s.reps;
        }
      }
    }
    return Math.round(total * 100) / 100;
  }, [exercises]);

  const completedSetsCount = useMemo(
    () => exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.is_completed).length, 0),
    [exercises]
  );

  // Compute live PR flags per exercise set & count total live PR sets
  const livePRMatrix = useMemo(() => {
    let totalPRCount = 0;
    const map = exercises.map((ex) => {
      const baseline = prBaselines[ex.exercise_name];
      return ex.sets.map((s, idx) => {
        if (!s.is_completed) return null;
        const prior = ex.sets.slice(0, idx);
        const res = evaluateSetPR({
          weightKg: s.weight_kg,
          reps: s.reps,
          setType: s.set_type ?? 'normal',
          baseline,
          priorWorkingSetsInSession: prior,
        });
        if (res.anyPR) totalPRCount++;
        return res;
      });
    });
    return { map, totalPRCount };
  }, [exercises, prBaselines]);

  const handleFinishAndSave = async () => {
    try {
      const saved = await finishAndSaveWorkout();
      navigate(`/workout/session/${saved.id}`, { replace: true });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDiscardSession = () => {
    discardWorkout();
    setDiscardConfirmOpen(false);
    showToast('Strength session deleted.', 'info');
    navigate('/workout', { replace: true });
  };

  const handleConfirmAddConfiguredExercise = () => {
    if (!selectedForSetup) return;
    addExerciseToSession(selectedForSetup, previousMap[selectedForSetup.name], {
      setsCount: setupSets,
      reps: setupReps,
      weightKg: setupWeightKg,
      restSeconds: setupRestSeconds,
      notes: setupNotes,
    });
    showToast(`Added "${selectedForSetup.name}" to workout.`, 'success');
    setSelectedForSetup(null);
    setPickerOpen(false);
    setPickerSearch('');
  };

  const closePickerModal = () => {
    setPickerOpen(false);
    setSelectedForSetup(null);
  };

  const filteredCatalog = useMemo(
    () =>
      filterExercises(catalog, {
        query: pickerSearch,
        category: pickerCategory,
        equipment: pickerEquipment,
        difficulty: pickerDifficulty,
        exerciseType: pickerType,
      }),
    [catalog, pickerCategory, pickerDifficulty, pickerEquipment, pickerSearch, pickerType]
  );

  const restRunning = session?.restStatus === 'running';

  return (
    <AppShell
      title="Active Workout"
      showBack
      headerAction={
        <PrimaryButton onClick={() => void handleFinishAndSave()} loading={saving}>
          <CloudCheck className="w-4 h-4" />
          Finish &amp; Save
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        {/* Session Summary, Controls (Pause/Resume & Delete), & Advanced Rest Timer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Card className="lg:col-span-7 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={session?.workoutName ?? 'Strength Session'}
                onChange={(e) => setWorkoutName(e.target.value)}
                aria-label="Workout name"
                className={`${INPUT_CLASS} font-display font-bold text-base flex-1`}
              />
              <input
                type="date"
                value={session?.workoutDate ?? ''}
                onChange={(e) => setWorkoutDate(e.target.value)}
                aria-label="Workout date"
                className={`${INPUT_CLASS} sm:w-44 font-mono-num`}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <p className="text-[11px] text-zinc-400">
                  Duration{' '}
                  {isSessionPaused && <span className="text-amber-300">(Paused)</span>}
                </p>
                <p className="font-mono-num text-base font-bold text-white inline-flex items-center gap-1.5 mt-0.5">
                  <Clock
                    className="w-3.5 h-3.5"
                    style={{ color: isSessionPaused ? '#FBBF24' : 'var(--accent-primary)' }}
                  />
                  {formatDuration(elapsedSeconds)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Total Volume</p>
                <p className="font-mono-num text-base font-bold text-white mt-0.5">
                  {formatWeight(totalVolumeKg, settings.weight_unit)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-400">Completed Sets</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono-num text-base font-bold text-white">
                    {completedSetsCount}
                  </span>
                  {livePRMatrix.totalPRCount > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1"
                      style={{
                        backgroundColor: 'var(--accent-soft)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      <Award className="w-3 h-3" />
                      {livePRMatrix.totalPRCount} PR
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Session Pause/Resume, Plate Calc & Delete Session Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={toggleWorkoutPause}
                className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                  isSessionPaused
                    ? 'border-[var(--accent-primary)]/60 bg-[var(--accent-soft)] text-white'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200'
                }`}
              >
                {isSessionPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                    <span>Resume Session</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Session</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setPlateCalcTarget({
                    open: true,
                    exIndex: null,
                    initialDisplayWeight: settings.weight_unit === 'kg' ? 60 : 135,
                  })
                }
                className="min-h-[42px] px-3.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-zinc-200 inline-flex items-center gap-2 transition-colors"
              >
                <Calculator className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span>Plates</span>
              </button>

              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(true)}
                className="min-h-[42px] px-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 text-xs font-semibold text-rose-300 inline-flex items-center gap-2 transition-colors ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Session</span>
              </button>
            </div>
          </Card>

          {/* Advanced Rest Timer Card */}
          <Card className="lg:col-span-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400 inline-flex items-center gap-1.5">
                  <Timer className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  Rest Timer{' '}
                  {session?.restStatus === 'paused' && (
                    <span className="text-amber-300 text-[11px]">(Paused)</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={toggleRestAudio}
                  aria-label="Toggle rest sound alert"
                  title={restAudioEnabled ? 'Sound alert ON' : 'Sound alert OFF'}
                  className={`min-h-[30px] px-2 rounded-lg border text-[11px] inline-flex items-center gap-1 transition-colors ${
                    restAudioEnabled
                      ? 'border-white/15 bg-white/[0.05] text-zinc-200'
                      : 'border-white/10 bg-transparent text-zinc-500'
                  }`}
                >
                  {restAudioEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{restAudioEnabled ? 'Sound' : 'Muted'}</span>
                </button>
              </div>
              <span className="font-mono-num text-xl font-bold text-white">
                {formatDuration(restRemainingSeconds)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {[60, 90, 120, 180].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => startRestTimer(sec)}
                  className={`min-h-[36px] px-2.5 rounded-lg border text-xs font-mono-num font-semibold transition-colors ${
                    session?.restDurationSeconds === sec && restRunning
                      ? 'border-[var(--accent-primary)] text-white'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:text-white'
                  }`}
                >
                  {sec}s
                </button>
              ))}
              <button
                type="button"
                onClick={() => adjustRestTimer(-15)}
                className="min-h-[36px] px-2 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-mono-num font-semibold text-zinc-200 hover:text-white"
              >
                -15s
              </button>
              <button
                type="button"
                onClick={() => adjustRestTimer(15)}
                className="min-h-[36px] px-2 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-mono-num font-semibold text-zinc-200 hover:text-white"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={toggleRestTimer}
                aria-label={restRunning ? 'Pause rest timer' : 'Resume rest timer'}
                className="min-h-[36px] min-w-[36px] ml-auto flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white"
              >
                {restRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={resetRestTimer}
                aria-label="Reset rest timer"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-zinc-300"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        </div>

        {saveError && (
          <ErrorBanner message={saveError} onRetry={() => void handleFinishAndSave()} />
        )}

        {/* Exercises List */}
        {exercises.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-white">No exercises added yet</p>
            <p className="text-xs text-zinc-400">
              Search our 348+ master exercise library across 15 categories to configure sets, reps,
              weight, rest duration, and notes.
            </p>
            <div className="pt-1">
              <PrimaryButton
                onClick={() => {
                  setSelectedForSetup(null);
                  setPickerOpen(true);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Exercise
              </PrimaryButton>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {exercises.map((ex, exIdx) => {
              const prevPerf = previousMap[ex.exercise_name];
              const prBaseline = prBaselines[ex.exercise_name];
              const improvement = computeImprovementSummary(
                prevPerf,
                ex.sets,
                settings.weight_unit
              );
              const isFocusedExercise = session?.currentExerciseIndex === exIdx;
              const supersetColor = getSupersetAccentColor(ex.superset_group);
              const workingWeightSample =
                ex.sets.find((s) => (s.set_type ?? 'normal') !== 'warmup' && s.weight_kg > 0)
                  ?.weight_kg ??
                ex.sets[0]?.weight_kg ??
                20;

              return (
                <Card
                  key={ex.tempId}
                  className={`space-y-3 ${isFocusedExercise ? 'border-white/20' : ''} ${
                    supersetColor ? 'border-l-4' : ''
                  }`}
                  style={supersetColor ? { borderLeftColor: supersetColor } : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-zinc-400">{ex.exercise_category}</p>
                        <label className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                          <Timer className="w-3 h-3" />
                          <select
                            aria-label={`Rest duration for ${ex.exercise_name}`}
                            value={ex.rest_seconds}
                            onChange={(e) =>
                              updateExerciseRestSeconds(exIdx, Number(e.target.value))
                            }
                            className="bg-[#0D0F13] border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] font-mono-num text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
                          >
                            {[30, 45, 60, 90, 120, 150, 180, 240].map((sec) => (
                              <option key={sec} value={sec}>
                                {sec}s rest
                              </option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            setExerciseSuperset(exIdx, nextSupersetGroup(ex.superset_group))
                          }
                          title="Tap to link exercises into a Superset group (A, B, C, D)"
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                            ex.superset_group
                              ? 'bg-white/[0.08] text-white'
                              : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                          }`}
                          style={
                            supersetColor
                              ? { borderColor: supersetColor, color: supersetColor }
                              : undefined
                          }
                        >
                          <Link2 className="w-3 h-3" />
                          <span>
                            {ex.superset_group ? `Superset ${ex.superset_group}` : 'Superset'}
                          </span>
                        </button>
                      </div>

                      <h3 className="font-display text-lg font-bold text-white truncate mt-0.5">
                        {ex.exercise_name}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {prevPerf ? (
                          <p className="text-xs text-zinc-400 font-mono-num">
                            Previous ({prevPerf.lastDate}):{' '}
                            <span className="text-zinc-200 font-semibold">
                              {toDisplayWeight(prevPerf.bestSet.weight_kg, settings.weight_unit)}{' '}
                              {settings.weight_unit.toUpperCase()} × {prevPerf.bestSet.reps} reps
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-500">
                            First logged session for this exercise
                          </p>
                        )}
                        {prBaseline && prBaseline.maxWeightKg > 0 && (
                          <p className="text-[11px] text-zinc-400 font-mono-num inline-flex items-center gap-1">
                            <Award
                              className="w-3 h-3"
                              style={{ color: 'var(--accent-primary)' }}
                            />
                            PR: {formatWeight(prBaseline.maxWeightKg, settings.weight_unit)} · 1RM{' '}
                            {formatWeight(prBaseline.best1RMKg, settings.weight_unit)}
                          </p>
                        )}
                      </div>

                      {improvement && (
                        <p
                          className="text-xs font-medium inline-flex items-center gap-1 mt-1 font-mono-num"
                          style={{
                            color: improvement.improved ? 'var(--accent-primary)' : '#9CA3AF',
                          }}
                        >
                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                          <span>{improvement.label}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setPlateCalcTarget({
                            open: true,
                            exIndex: exIdx,
                            exerciseName: ex.exercise_name,
                            initialDisplayWeight: toDisplayWeight(
                              workingWeightSample,
                              settings.weight_unit
                            ),
                          })
                        }
                        aria-label={`Barbell plates and warm-up for ${ex.exercise_name}`}
                        title="Plate calculator & warm-up sets"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 hover:text-white hover:border-[var(--accent-primary)]"
                      >
                        <Calculator className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExercise(exIdx)}
                        aria-label={`Remove ${ex.exercise_name}`}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-white/5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Sets Header */}
                  <div className="grid grid-cols-12 gap-1.5 text-[11px] font-medium text-zinc-500 px-1">
                    <span className="col-span-2">Type</span>
                    <span className="col-span-3">{settings.weight_unit.toUpperCase()}</span>
                    <span className="col-span-2">Reps</span>
                    <span className="col-span-2">RPE</span>
                    <span className="col-span-3 text-right">Done</span>
                  </div>

                  {/* Set Rows */}
                  <div className="space-y-2">
                    {ex.sets.map((s, setIdx) => {
                      const prevSet = prevPerf?.sets[setIdx];
                      const displayWeight = toDisplayWeight(s.weight_kg, settings.weight_unit);
                      const typeMeta = getSetTypeBadgeMeta(s.set_type, s.set_number);
                      const prState = livePRMatrix.map[exIdx]?.[setIdx];

                      return (
                        <div
                          key={setIdx}
                          className={`rounded-xl border transition-colors p-1.5 space-y-1.5 ${
                            s.is_completed
                              ? 'border-emerald-500/30 bg-emerald-950/20'
                              : 'border-white/[0.06] bg-white/[0.02]'
                          }`}
                        >
                          <div className="grid grid-cols-12 gap-1.5 items-center">
                            <div className="col-span-2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateSetField(exIdx, setIdx, {
                                    set_type: nextSetType(s.set_type),
                                  })
                                }
                                title={typeMeta.title}
                                aria-label={`Set ${s.set_number} type: ${s.set_type ?? 'normal'}`}
                                className={`min-h-[38px] w-full rounded-lg border text-xs font-mono-num font-bold transition-colors ${typeMeta.className}`}
                              >
                                {typeMeta.short}
                              </button>
                            </div>

                            <div className="col-span-3">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.5"
                                min={0}
                                value={displayWeight || ''}
                                onFocus={() => setCurrentPosition(exIdx, setIdx)}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateSetField(exIdx, setIdx, {
                                    weight_kg: Number.isFinite(val)
                                      ? toCanonicalWeightKg(val, settings.weight_unit)
                                      : 0,
                                  });
                                }}
                                aria-label={`Set ${s.set_number} weight`}
                                placeholder={
                                  prevSet
                                    ? String(toDisplayWeight(prevSet.weight_kg, settings.weight_unit))
                                    : '0'
                                }
                                className="w-full min-h-[38px] px-1.5 rounded-lg bg-[#0D0F13] border border-white/10 text-sm font-mono-num text-white text-center focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                            </div>

                            <div className="col-span-2">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={s.reps || ''}
                                onFocus={() => setCurrentPosition(exIdx, setIdx)}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  updateSetField(exIdx, setIdx, {
                                    reps: Number.isFinite(val) ? val : 0,
                                  });
                                }}
                                aria-label={`Set ${s.set_number} reps`}
                                placeholder={prevSet ? String(prevSet.reps) : '0'}
                                className="w-full min-h-[38px] px-1 rounded-lg bg-[#0D0F13] border border-white/10 text-sm font-mono-num text-white text-center focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                            </div>

                            <div className="col-span-2">
                              <select
                                aria-label={`Set ${s.set_number} RPE`}
                                value={s.rpe ?? ''}
                                onChange={(e) =>
                                  updateSetField(exIdx, setIdx, {
                                    rpe: e.target.value ? parseFloat(e.target.value) : null,
                                  })
                                }
                                className="w-full min-h-[38px] px-1 rounded-lg bg-[#0D0F13] border border-white/10 text-xs font-mono-num text-zinc-200 text-center focus:outline-none focus:border-[var(--accent-primary)]"
                              >
                                <option value="">—</option>
                                {RPE_OPTIONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="col-span-3 flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => toggleSetComplete(exIdx, setIdx)}
                                aria-label={`Mark set ${s.set_number} ${s.is_completed ? 'incomplete' : 'complete'}`}
                                className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center border transition-colors"
                                style={{
                                  backgroundColor: s.is_completed
                                    ? 'var(--accent-primary)'
                                    : 'rgba(255,255,255,0.04)',
                                  borderColor: s.is_completed
                                    ? 'var(--accent-primary)'
                                    : 'rgba(255,255,255,0.1)',
                                  color: s.is_completed ? 'var(--accent-fg)' : '#9CA3AF',
                                }}
                              >
                                <Check className="w-4 h-4" strokeWidth={2.5} />
                              </button>
                              {ex.sets.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeSet(exIdx, setIdx)}
                                  aria-label={`Delete set ${s.set_number}`}
                                  className="min-h-[38px] min-w-[26px] flex items-center justify-center rounded-lg text-zinc-600 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {(prevSet || prState?.anyPR) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px]">
                              <span className="text-zinc-500 font-mono-num">
                                {prevSet
                                  ? `Prev: ${toDisplayWeight(prevSet.weight_kg, settings.weight_unit)} ${settings.weight_unit.toUpperCase()} × ${prevSet.reps}`
                                  : ''}
                              </span>
                              {prState?.anyPR && (
                                <span
                                  className="px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1"
                                  style={{
                                    backgroundColor: 'var(--accent-soft)',
                                    color: 'var(--accent-primary)',
                                  }}
                                >
                                  <Award className="w-3 h-3" />
                                  {prState.labels.join(' · ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Set Type Legend + Exercise Notes & Add Set */}
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 px-0.5">
                    <span>Tap Set # to tag:</span>
                    <span className="text-zinc-300">Num = Normal</span>
                    <span className="text-amber-300">W = Warm-up</span>
                    <span className="text-purple-300">D = Drop</span>
                    <span className="text-rose-300">F = Failure</span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      type="text"
                      value={ex.exercise_notes}
                      onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                      placeholder="Exercise notes (grip, tempo, cues...)"
                      className={`${INPUT_CLASS} text-xs flex-1`}
                    />
                    <SecondaryButton onClick={() => addSet(exIdx)}>
                      <Plus className="w-4 h-4" />
                      Add Set
                    </SecondaryButton>
                  </div>
                </Card>
              );
            })}

            <Card className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-400">Session Notes</span>
                <textarea
                  rows={2}
                  value={session?.sessionNotes ?? ''}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="How did energy, strength, and recovery feel today?"
                  className={INPUT_CLASS}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <SecondaryButton
                  onClick={() => {
                    setSelectedForSetup(null);
                    setPickerOpen(true);
                  }}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Exercise
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => void handleFinishAndSave()}
                  loading={saving}
                  className="flex-1"
                >
                  <CloudCheck className="w-4 h-4" />
                  Save Workout
                </PrimaryButton>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Barbell Plate Calculator & Warm-Up Generator Modal */}
      <PlateCalculatorModal
        open={plateCalcTarget.open}
        onClose={() => setPlateCalcTarget((prev) => ({ ...prev, open: false }))}
        userId={user?.id ?? 'default'}
        defaultUnit={settings.weight_unit}
        initialTargetDisplayWeight={plateCalcTarget.initialDisplayWeight}
        exerciseName={plateCalcTarget.exerciseName}
        onInsertWarmups={
          plateCalcTarget.exIndex !== null
            ? (warmups) => {
                prependWarmupSets(plateCalcTarget.exIndex!, warmups);
                showToast(
                  `Added ${warmups.length} warm-up sets to ${plateCalcTarget.exerciseName}.`,
                  'success'
                );
              }
            : undefined
        }
      />

      {/* Exercise Picker & Pre-Add Configuration Modal */}
      <ModalSheet
        open={pickerOpen}
        onClose={closePickerModal}
        title={selectedForSetup ? `Configure ${selectedForSetup.name}` : 'Add Exercise'}
      >
        {selectedForSetup ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedForSetup(null)}
              className="text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Exercise Search
            </button>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm text-white">
                  {selectedForSetup.name}
                </span>
                <span className="text-zinc-400">
                  {selectedForSetup.exercise_type ?? 'Compound'} ·{' '}
                  {selectedForSetup.difficulty ?? 'Intermediate'}
                </span>
              </div>
              <p className="text-zinc-300">
                <strong className="text-white">Primary:</strong>{' '}
                {selectedForSetup.primary_muscle ?? selectedForSetup.category} ·{' '}
                <strong className="text-white">Equipment:</strong> {selectedForSetup.equipment}
              </p>
              {selectedForSetup.secondary_muscles &&
                selectedForSetup.secondary_muscles.length > 0 && (
                  <p className="text-zinc-400">
                    <strong className="text-zinc-200">Secondary:</strong>{' '}
                    {selectedForSetup.secondary_muscles.join(', ')}
                  </p>
                )}
              {selectedForSetup.instructions && (
                <p className="text-zinc-300 leading-relaxed pt-1 border-t border-white/[0.06]">
                  {selectedForSetup.instructions}
                </p>
              )}
              {selectedForSetup.common_mistakes && (
                <p className="text-amber-200/90 inline-flex items-start gap-1.5 leading-relaxed">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{selectedForSetup.common_mistakes}</span>
                </p>
              )}
              {(() => {
                const muscleMap = resolveExerciseMuscles(selectedForSetup);
                return (
                  <div className="pt-2 border-t border-white/[0.06]">
                    <MuscleBodySvg
                      mode="highlight"
                      primaryMuscles={muscleMap.primary}
                      secondaryMuscles={muscleMap.secondary}
                      compact
                    />
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <FormField label="Sets">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={setupSets}
                  onChange={(e) => setSetupSets(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${INPUT_CLASS} font-mono-num text-center`}
                />
              </FormField>
              <FormField label="Reps">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={setupReps}
                  onChange={(e) => setSetupReps(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`${INPUT_CLASS} font-mono-num text-center`}
                />
              </FormField>
              <FormField label="Weight (kg)">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={setupWeightKg}
                  onChange={(e) =>
                    setSetupWeightKg(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className={`${INPUT_CLASS} font-mono-num text-center`}
                />
              </FormField>
              <FormField label="Rest (sec)">
                <input
                  type="number"
                  step="15"
                  min={10}
                  max={600}
                  value={setupRestSeconds}
                  onChange={(e) =>
                    setSetupRestSeconds(Math.max(10, parseInt(e.target.value, 10) || 90))
                  }
                  className={`${INPUT_CLASS} font-mono-num text-center`}
                />
              </FormField>
            </div>

            <FormField label="Exercise Notes (Optional)">
              <input
                type="text"
                value={setupNotes}
                onChange={(e) => setSetupNotes(e.target.value)}
                placeholder="Grip width, tempo, RPE target..."
                className={INPUT_CLASS}
              />
            </FormField>

            <PrimaryButton onClick={handleConfirmAddConfiguredExercise} className="w-full">
              <Plus className="w-4 h-4" />
              Add to Workout
            </PrimaryButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search by name or alias (e.g. Bench Press, Lat Pulldown)..."
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>

            {/* 15 Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {EXERCISE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPickerCategory(cat)}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border ${
                    pickerCategory === cat
                      ? 'text-[#08090B] border-transparent font-semibold'
                      : 'border-white/10 text-zinc-300'
                  }`}
                  style={
                    pickerCategory === cat
                      ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                      : undefined
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Equipment, Difficulty & Type Filters */}
            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label="Filter by equipment"
                value={pickerEquipment}
                onChange={(e) => setPickerEquipment(e.target.value)}
                className="min-h-[36px] px-2 rounded-lg bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_EQUIPMENT_FILTERS.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq === 'All' ? 'All Equipment' : eq}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by difficulty"
                value={pickerDifficulty}
                onChange={(e) =>
                  setPickerDifficulty(e.target.value as 'All' | ExerciseDifficulty)
                }
                className="min-h-[36px] px-2 rounded-lg bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_DIFFICULTY_FILTERS.map((d) => (
                  <option key={d} value={d}>
                    {d === 'All' ? 'All Levels' : d}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by movement type"
                value={pickerType}
                onChange={(e) =>
                  setPickerType(e.target.value as 'All' | ExerciseMovementType)
                }
                className="min-h-[36px] px-2 rounded-lg bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_TYPE_FILTERS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'All Types' : t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 px-0.5">
              <span>
                {filteredCatalog.length} of {catalog.length} exercises
              </span>
              {(pickerSearch ||
                pickerCategory !== 'All' ||
                pickerEquipment !== 'All' ||
                pickerDifficulty !== 'All' ||
                pickerType !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setPickerSearch('');
                    setPickerCategory('All');
                    setPickerEquipment('All');
                    setPickerDifficulty('All');
                    setPickerType('All');
                  }}
                  className="hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.06] rounded-xl border border-white/10">
              {catalogLoading ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  Loading exercise catalog...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  No exercises match your current search or filters.
                </div>
              ) : (
                filteredCatalog.map((ex) => (
                  <button
                    key={`${ex.is_custom ? 'c' : 'p'}-${ex.id}`}
                    type="button"
                    onClick={() => openExerciseSetup(ex)}
                    className="w-full min-h-[56px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{ex.name}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        {ex.category} · {ex.equipment} · {ex.exercise_type ?? 'Compound'} ·{' '}
                        {ex.difficulty ?? 'Intermediate'}
                        {ex.is_custom ? ' · Custom' : ''}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </ModalSheet>

      {/* Delete Session Confirmation Modal */}
      <ModalSheet
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Delete Active Strength Session?"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Deleting this session permanently removes its active timer and unsaved sets from this
            device. Any completed workouts already saved to your history remain untouched.
          </p>
          <div className="flex gap-2.5">
            <SecondaryButton onClick={() => setDiscardConfirmOpen(false)} className="flex-1">
              Keep Training
            </SecondaryButton>
            <button
              type="button"
              onClick={handleDiscardSession}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Session
            </button>
          </div>
        </div>
      </ModalSheet>
    </AppShell>
  );
}
