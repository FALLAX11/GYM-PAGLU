import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  Dumbbell,
  History,
  Layers,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  EmptyState,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  LoadingBlock,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { MuscleBodySvg } from '../../components/workout/MuscleBodySvg';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWorkoutSession } from '../../context/WorkoutSessionContext';
import {
  CUSTOM_EXERCISE_CATEGORIES,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTY_FILTERS,
  EXERCISE_EQUIPMENT_FILTERS,
  EXERCISE_TYPE_FILTERS,
  filterExercises,
} from '../../lib/exerciseSearch';
import {
  ALL_MUSCLE_REGION_IDS,
  exerciseMatchesMuscleRegion,
  MUSCLE_REGION_META,
  resolveExerciseMuscles,
  type MuscleRegionId,
} from '../../lib/muscleAnatomy';
import { isSchemaMissingError } from '../../lib/supabase';
import { formatDuration, formatWeight } from '../../lib/units';
import {
  createCustomExercise,
  createCustomWorkoutPlan,
  deleteCustomWorkoutPlan,
  fetchExerciseCatalog,
  fetchPreviousExercisePerformance,
  fetchWorkoutPlans,
  fetchWorkoutSessions,
} from '../../services/workoutService';
import type {
  ExerciseCategory,
  ExerciseDifficulty,
  ExerciseItem,
  ExerciseMovementType,
  SplitType,
  WorkoutPlan,
  WorkoutPlanExercise,
  WorkoutSessionRecord,
} from '../../types/database';

export function WorkoutHubPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, settings, exerciseCatalogCount } = useAuth();
  const { showToast } = useToast();
  const {
    isActive: hasActiveWorkout,
    isSessionPaused,
    session: activeWorkout,
    elapsedSeconds,
    startNewWorkout,
    toggleWorkoutPause,
    discardWorkout,
    addExerciseToSession,
  } = useWorkoutSession();

  const initialMuscleParam = searchParams.get('muscle');
  const validInitialMuscle =
    initialMuscleParam && ALL_MUSCLE_REGION_IDS.includes(initialMuscleParam as MuscleRegionId)
      ? (initialMuscleParam as MuscleRegionId)
      : null;

  const [tab, setTab] = useState<'plans' | 'exercises' | 'recent'>(() =>
    validInitialMuscle ? 'exercises' : 'plans'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<WorkoutSessionRecord[]>([]);

  // Exercise library search & filters
  const [exSearch, setExSearch] = useState('');
  const [exCategory, setExCategory] = useState<'All' | ExerciseCategory>('All');
  const [exEquipment, setExEquipment] = useState<string>('All');
  const [exDifficulty, setExDifficulty] = useState<'All' | ExerciseDifficulty>('All');
  const [exType, setExType] = useState<'All' | ExerciseMovementType>('All');
  const [exMuscleRegion, setExMuscleRegion] = useState<MuscleRegionId | null>(validInitialMuscle);
  const [showMuscleMapFilter, setShowMuscleMapFilter] = useState(Boolean(validInitialMuscle));

  // Exercise detail & workout-add configuration sheet
  const [inspectExercise, setInspectExercise] = useState<ExerciseItem | null>(null);
  const [addSetsCount, setAddSetsCount] = useState(3);
  const [addReps, setAddReps] = useState(10);
  const [addWeightKg, setAddWeightKg] = useState(20);
  const [addRestSeconds, setAddRestSeconds] = useState(settings.default_rest_seconds || 90);
  const [addNotes, setAddNotes] = useState('');
  const [addingToWorkout, setAddingToWorkout] = useState(false);

  const [pendingStartRequest, setPendingStartRequest] = useState<{
    planId: string | null;
    workoutName: string;
    presetExercises: WorkoutPlanExercise[];
  } | null>(null);
  const [discardActiveConfirm, setDiscardActiveConfirm] = useState(false);

  // Create custom exercise modal
  const [newExOpen, setNewExOpen] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCat, setNewExCat] = useState<ExerciseCategory>('Chest');
  const [newExEquip, setNewExEquip] = useState('Dumbbell');
  const [newExNotes, setNewExNotes] = useState('');
  const [savingEx, setSavingEx] = useState(false);

  // Create custom plan modal
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planSplit, setPlanSplit] = useState<SplitType>('Custom');
  const [planDesc, setPlanDesc] = useState('');
  const [planExSearch, setPlanExSearch] = useState('');
  const [planSelectedExercises, setPlanSelectedExercises] = useState<
    Array<{ exercise: ExerciseItem; target_sets: number; target_reps: string }>
  >([]);
  const [savingPlan, setSavingPlan] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [pl, ex, sess] = await Promise.all([
        fetchWorkoutPlans(user.id).catch((err) => {
          if (isSchemaMissingError(err)) return [] as WorkoutPlan[];
          throw err;
        }),
        fetchExerciseCatalog(user.id),
        fetchWorkoutSessions(user.id, { limit: 8 }).catch((err) => {
          if (isSchemaMissingError(err)) return [] as WorkoutSessionRecord[];
          throw err;
        }),
      ]);
      setPlans(pl);
      setExercises(ex);
      setRecentSessions(sess);
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [exerciseCatalogCount, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredExercises = useMemo(() => {
    const base = filterExercises(exercises, {
      query: exSearch,
      category: exCategory,
      equipment: exEquipment,
      difficulty: exDifficulty,
      exerciseType: exType,
    });
    if (!exMuscleRegion) return base;
    return base.filter((ex) => exerciseMatchesMuscleRegion(ex, exMuscleRegion, 'all'));
  }, [exCategory, exDifficulty, exEquipment, exMuscleRegion, exSearch, exType, exercises]);

  const planFilteredExercises = useMemo(
    () =>
      filterExercises(exercises, {
        query: planExSearch,
      }).slice(0, 60),
    [exercises, planExSearch]
  );

  const openExerciseSheet = (ex: ExerciseItem) => {
    setInspectExercise(ex);
    setAddSetsCount(3);
    setAddReps(ex.exercise_type === 'Cardio' || ex.exercise_type === 'Mobility' ? 15 : 10);
    setAddWeightKg(
      ex.equipment === 'Bodyweight' || ex.exercise_type === 'Mobility' ? 0 : 20
    );
    setAddRestSeconds(settings.default_rest_seconds || 90);
    setAddNotes('');
  };

  const handleAddInspectExerciseToWorkout = async () => {
    if (!user || !inspectExercise) return;
    setAddingToWorkout(true);
    try {
      let prevPerf = null;
      try {
        prevPerf = await fetchPreviousExercisePerformance(user.id, inspectExercise.name);
      } catch {
        prevPerf = null;
      }

      if (!hasActiveWorkout) {
        startNewWorkout({ workoutName: 'Strength Session' });
      }

      addExerciseToSession(inspectExercise, prevPerf, {
        setsCount: addSetsCount,
        reps: addReps,
        weightKg: addWeightKg,
        restSeconds: addRestSeconds,
        notes: addNotes,
      });

      showToast(`Added "${inspectExercise.name}" to active workout.`, 'success');
      setInspectExercise(null);
      navigate('/workout/active');
    } finally {
      setAddingToWorkout(false);
    }
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newExName.trim()) return;
    setSavingEx(true);
    try {
      const created = await createCustomExercise(user.id, {
        name: newExName,
        category: newExCat,
        equipment: newExEquip,
        notes: newExNotes,
      });
      setExercises((prev) => [created, ...prev]);
      setNewExName('');
      setNewExNotes('');
      setNewExOpen(false);
      showToast(`Custom exercise "${created.name}" saved.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingEx(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !planName.trim()) return;
    setSavingPlan(true);
    try {
      const created = await createCustomWorkoutPlan(user.id, {
        name: planName,
        split_type: planSplit,
        description: planDesc,
        exercises: planSelectedExercises.map((item) => ({
          exercise_id: item.exercise.is_custom ? null : item.exercise.id,
          custom_exercise_id: item.exercise.is_custom ? item.exercise.id : null,
          exercise_name: item.exercise.name,
          exercise_category: item.exercise.category,
          day_label: 'Custom Day',
          target_sets: item.target_sets,
          target_reps: item.target_reps,
          rest_seconds: settings.default_rest_seconds,
        })),
      });
      setPlans((prev) => [created, ...prev]);
      setPlanName('');
      setPlanDesc('');
      setPlanExSearch('');
      setPlanSelectedExercises([]);
      setNewPlanOpen(false);
      showToast(`Workout plan "${created.name}" saved.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!user) return;
    try {
      await deleteCustomWorkoutPlan(user.id, planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      showToast('Custom workout plan deleted.', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const startPlanDay = (plan: WorkoutPlan, dayLabel?: string) => {
    const planExercises = (plan.workout_plan_exercises ?? [])
      .filter((pe) => !dayLabel || pe.day_label === dayLabel)
      .sort((a, b) => a.sort_order - b.sort_order);

    const nextPayload = {
      planId: plan.id,
      workoutName: dayLabel ? `${plan.name} · ${dayLabel}` : plan.name,
      presetExercises: planExercises,
    };

    if (hasActiveWorkout) {
      setPendingStartRequest(nextPayload);
      return;
    }

    startNewWorkout(nextPayload);
    navigate('/workout/active');
  };

  const hasAnyExerciseFilter =
    exSearch !== '' ||
    exCategory !== 'All' ||
    exEquipment !== 'All' ||
    exDifficulty !== 'All' ||
    exType !== 'All' ||
    exMuscleRegion !== null;

  const inspectMuscleMapping = useMemo(
    () => (inspectExercise ? resolveExerciseMuscles(inspectExercise) : null),
    [inspectExercise]
  );

  return (
    <AppShell
      title="Workout"
      headerAction={
        <button
          type="button"
          onClick={() => navigate('/workout/history')}
          className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      }
    >
      <div className="space-y-5">
        {/* Top Action Hero Card */}
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-white">
              {hasActiveWorkout && activeWorkout
                ? `Active: ${activeWorkout.workoutName}`
                : 'Start Training Session'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              {hasActiveWorkout
                ? `Elapsed ${formatDuration(elapsedSeconds)}${isSessionPaused ? ' (Paused)' : ''} · Timer stays synced across all tabs.`
                : 'Log sets, weights, reps, and rest with automatic previous-session comparison.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <PrimaryButton onClick={() => navigate('/workout/active')}>
              <Play className="w-4 h-4" />
              {hasActiveWorkout ? 'Open Active Workout' : 'Empty Workout'}
            </PrimaryButton>
            {hasActiveWorkout && (
              <>
                <SecondaryButton onClick={toggleWorkoutPause}>
                  {isSessionPaused ? (
                    <>
                      <Play className="w-4 h-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  )}
                </SecondaryButton>
                <button
                  type="button"
                  onClick={() => setDiscardActiveConfirm(true)}
                  aria-label="Delete active session"
                  className="min-h-[44px] px-3.5 rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 text-xs font-semibold text-rose-300 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
            <SecondaryButton onClick={() => navigate('/workout/history')}>
              <History className="w-4 h-4" />
              Calendar &amp; Logs
            </SecondaryButton>
          </div>
        </Card>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#111318] border border-white/[0.08] overflow-x-auto">
          {(
            [
              { id: 'plans', label: 'Workout Splits & Plans' },
              { id: 'exercises', label: `Exercise Library (${exercises.length})` },
              { id: 'recent', label: 'Recent Sessions' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[40px] flex-1 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === item.id ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
              }`}
              style={
                tab === item.id
                  ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                  : undefined
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {loading ? (
          <LoadingBlock label="Loading workout plans & exercise library..." />
        ) : tab === 'plans' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">
                Choose a split day to pre-load exercises or create a custom split.
              </p>
              <SecondaryButton onClick={() => setNewPlanOpen(true)}>
                <Plus className="w-4 h-4" />
                Custom Split
              </SecondaryButton>
            </div>

            {plans.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-6 h-6" />}
                title="No saved workout splits yet"
                description="Start an Empty Workout above, pick exercises from our 348+ Exercise Library, or finish SQL setup to load system templates."
                action={
                  <PrimaryButton onClick={() => setTab('exercises')}>
                    <Dumbbell className="w-4 h-4" />
                    Browse Exercise Library
                  </PrimaryButton>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan) => {
                  const days = Array.from(
                    new Set((plan.workout_plan_exercises ?? []).map((e) => e.day_label))
                  );
                  return (
                    <Card key={plan.id} className="flex flex-col justify-between gap-4">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs text-zinc-400">
                              {plan.split_type} · {plan.is_system_template ? 'Template' : 'Custom'}
                            </p>
                            <h3 className="font-display text-base font-bold text-white mt-0.5">
                              {plan.name}
                            </h3>
                          </div>
                          {!plan.is_system_template && (
                            <button
                              type="button"
                              onClick={() => void handleDeletePlan(plan.id)}
                              aria-label={`Delete ${plan.name}`}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {plan.description && (
                          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                            {plan.description}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        {days.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {days.map((day) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => startPlanDay(plan, day)}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:border-[var(--accent-primary)] text-xs font-semibold text-white inline-flex items-center gap-1.5"
                              >
                                <Play
                                  className="w-3 h-3"
                                  style={{ color: 'var(--accent-primary)' }}
                                />
                                <span>Start {day}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <SecondaryButton onClick={() => startPlanDay(plan)} className="w-full">
                            <Layers className="w-4 h-4" />
                            Start Split
                          </SecondaryButton>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : tab === 'exercises' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={exSearch}
                  onChange={(e) => setExSearch(e.target.value)}
                  placeholder="Search by exercise name, alias, or muscle (e.g. Bench Press, Lat Pulldown)..."
                  className={`${INPUT_CLASS} pl-10`}
                />
              </div>
              <div className="flex gap-2">
                <SecondaryButton
                  onClick={() => setShowMuscleMapFilter((prev) => !prev)}
                >
                  <UserCheck className="w-4 h-4" />
                  {exMuscleRegion
                    ? `Muscle: ${MUSCLE_REGION_META[exMuscleRegion].shortLabel}`
                    : 'Muscle Map'}
                </SecondaryButton>
                <SecondaryButton onClick={() => setNewExOpen(true)}>
                  <Plus className="w-4 h-4" />
                  New Exercise
                </SecondaryButton>
              </div>
            </div>

            {showMuscleMapFilter && (
              <Card className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {exMuscleRegion
                        ? `Filtering by ${MUSCLE_REGION_META[exMuscleRegion].label}`
                        : 'Tap a Muscle Group to Filter Exercises'}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Highlights primary and synergist exercises across all {exercises.length}{' '}
                      movements.
                    </p>
                  </div>
                  {exMuscleRegion && (
                    <button
                      type="button"
                      onClick={() => {
                        setExMuscleRegion(null);
                        setSearchParams({}, { replace: true });
                      }}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Clear muscle
                    </button>
                  )}
                </div>
                <MuscleBodySvg
                  mode="highlight"
                  primaryMuscles={exMuscleRegion ? [exMuscleRegion] : []}
                  selectedMuscle={exMuscleRegion}
                  compact
                  showLegend={false}
                  onSelectMuscle={(m) => {
                    const next = exMuscleRegion === m ? null : m;
                    setExMuscleRegion(next);
                    if (next) {
                      setSearchParams({ muscle: next }, { replace: true });
                    } else {
                      setSearchParams({}, { replace: true });
                    }
                  }}
                />
              </Card>
            )}

            {/* 15 Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {EXERCISE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setExCategory(cat)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                    exCategory === cat
                      ? 'text-[#08090B] border-transparent font-semibold'
                      : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:text-white'
                  }`}
                  style={
                    exCategory === cat
                      ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                      : undefined
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Equipment, Difficulty & Movement Type Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                aria-label="Filter by equipment"
                value={exEquipment}
                onChange={(e) => setExEquipment(e.target.value)}
                className="min-h-[40px] px-3 rounded-xl bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_EQUIPMENT_FILTERS.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq === 'All' ? 'All Equipment' : eq}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by difficulty"
                value={exDifficulty}
                onChange={(e) => setExDifficulty(e.target.value as 'All' | ExerciseDifficulty)}
                className="min-h-[40px] px-3 rounded-xl bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_DIFFICULTY_FILTERS.map((d) => (
                  <option key={d} value={d}>
                    {d === 'All' ? 'All Difficulty Levels' : d}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by movement type"
                value={exType}
                onChange={(e) => setExType(e.target.value as 'All' | ExerciseMovementType)}
                className="min-h-[40px] px-3 rounded-xl bg-[#0D0F13] border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {EXERCISE_TYPE_FILTERS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'All Exercise Types' : t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>
                Showing <strong className="text-white">{filteredExercises.length}</strong> of{' '}
                <strong className="text-white">{exercises.length}</strong> exercises
              </span>
              {hasAnyExerciseFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setExSearch('');
                    setExCategory('All');
                    setExEquipment('All');
                    setExDifficulty('All');
                    setExType('All');
                    setExMuscleRegion(null);
                    setSearchParams({}, { replace: true });
                  }}
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Clear filters
                </button>
              )}
            </div>

            <Card className="p-0 overflow-hidden">
              {filteredExercises.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-400 space-y-2">
                  <p>
                    No exercises match your current search or filters. Adjust filters above or
                    create a custom exercise.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredExercises.map((ex) => {
                    const extraCats = (ex.categories ?? []).filter((c) => c !== ex.category);
                    return (
                      <button
                        key={`${ex.is_custom ? 'c' : 'p'}-${ex.id}`}
                        type="button"
                        onClick={() => openExerciseSheet(ex)}
                        className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{ex.name}</p>
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">
                            {ex.category}
                            {extraCats.length > 0 ? ` (+${extraCats.join(', ')})` : ''} ·{' '}
                            {ex.equipment} · {ex.exercise_type ?? 'Compound'} ·{' '}
                            {ex.difficulty ?? 'Intermediate'}
                            {ex.is_custom ? ' · Custom' : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.length === 0 ? (
              <EmptyState
                icon={<Dumbbell className="w-6 h-6" />}
                title="No completed workouts yet"
                description="Start a session and save your sets to build permanent workout history."
                action={
                  <PrimaryButton onClick={() => navigate('/workout/active')}>
                    Start First Workout
                  </PrimaryButton>
                }
              />
            ) : (
              recentSessions.map((sess) => (
                <Card
                  key={sess.id}
                  onClick={() => navigate(`/workout/session/${sess.id}`)}
                  className="flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono-num text-zinc-400">{sess.workout_date}</p>
                    <h3 className="font-display text-base font-bold text-white mt-0.5 truncate">
                      {sess.workout_name}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono-num mt-1">
                      {formatDuration(sess.duration_seconds)} ·{' '}
                      {sess.workout_session_exercises?.length ?? 0} exercises ·{' '}
                      {formatWeight(sess.total_volume_kg, settings.weight_unit)} volume
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" />
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {/* Exercise Details & Configure Add-to-Workout Sheet */}
      <ModalSheet
        open={inspectExercise !== null}
        onClose={() => setInspectExercise(null)}
        title={inspectExercise?.name ?? 'Exercise Details'}
      >
        {inspectExercise && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {inspectExercise.categories?.join(', ') || inspectExercise.category}
                </span>
                <span className="text-zinc-400">
                  {inspectExercise.exercise_type ?? 'Compound'} ·{' '}
                  {inspectExercise.difficulty ?? 'Intermediate'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-zinc-300">
                <p>
                  <strong className="text-white">Primary Muscle:</strong>{' '}
                  {inspectExercise.primary_muscle ?? inspectExercise.category}
                </p>
                <p>
                  <strong className="text-white">Equipment:</strong> {inspectExercise.equipment}
                </p>
                {inspectExercise.target_muscle && (
                  <p className="sm:col-span-2">
                    <strong className="text-white">Target Muscle:</strong>{' '}
                    {inspectExercise.target_muscle}
                  </p>
                )}
                {inspectExercise.secondary_muscles &&
                  inspectExercise.secondary_muscles.length > 0 && (
                    <p className="sm:col-span-2 text-zinc-400">
                      <strong className="text-zinc-200">Secondary Muscles:</strong>{' '}
                      {inspectExercise.secondary_muscles.join(', ')}
                    </p>
                  )}
              </div>

              {inspectExercise.instructions && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1">
                  <p className="font-semibold text-white">Instructions</p>
                  <p className="text-zinc-300 leading-relaxed">{inspectExercise.instructions}</p>
                </div>
              )}

              {inspectExercise.common_mistakes && (
                <div className="pt-2 border-t border-white/[0.06] space-y-1">
                  <p className="font-semibold text-amber-300 inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Common Mistakes
                  </p>
                  <p className="text-amber-100/80 leading-relaxed">
                    {inspectExercise.common_mistakes}
                  </p>
                </div>
              )}

              {inspectMuscleMapping && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <MuscleBodySvg
                    mode="highlight"
                    primaryMuscles={inspectMuscleMapping.primary}
                    secondaryMuscles={inspectMuscleMapping.secondary}
                    compact
                    onSelectMuscle={(muscleId) => {
                      setInspectExercise(null);
                      setExMuscleRegion(muscleId);
                      setShowMuscleMapFilter(true);
                      setTab('exercises');
                      setSearchParams({ muscle: muscleId }, { replace: true });
                    }}
                  />
                </div>
              )}

              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const name = inspectExercise.name;
                    setInspectExercise(null);
                    navigate(`/workout/exercise/${encodeURIComponent(name)}`);
                  }}
                  className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Lifetime Analytics &amp; PRs</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-white">
                Add to {hasActiveWorkout ? 'Active Workout' : 'New Workout'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <FormField label="Sets">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={addSetsCount}
                    onChange={(e) => setAddSetsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={`${INPUT_CLASS} font-mono-num text-center`}
                  />
                </FormField>
                <FormField label="Reps">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={addReps}
                    onChange={(e) => setAddReps(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={`${INPUT_CLASS} font-mono-num text-center`}
                  />
                </FormField>
                <FormField label="Weight (kg)">
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={addWeightKg}
                    onChange={(e) =>
                      setAddWeightKg(Math.max(0, parseFloat(e.target.value) || 0))
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
                    value={addRestSeconds}
                    onChange={(e) =>
                      setAddRestSeconds(Math.max(10, parseInt(e.target.value, 10) || 90))
                    }
                    className={`${INPUT_CLASS} font-mono-num text-center`}
                  />
                </FormField>
              </div>

              <FormField label="Exercise Notes (Optional)">
                <input
                  type="text"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="Grip width, tempo, RPE..."
                  className={INPUT_CLASS}
                />
              </FormField>

              <PrimaryButton
                onClick={() => void handleAddInspectExerciseToWorkout()}
                loading={addingToWorkout}
                className="w-full"
              >
                <Plus className="w-4 h-4" />
                {hasActiveWorkout ? 'Add to Active Workout' : 'Start Workout with Exercise'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* Create Custom Exercise Modal */}
      <ModalSheet open={newExOpen} onClose={() => setNewExOpen(false)} title="Create Custom Exercise">
        <form onSubmit={handleCreateExercise} className="space-y-4">
          <FormField label="Exercise Name">
            <input
              type="text"
              required
              value={newExName}
              onChange={(e) => setNewExName(e.target.value)}
              placeholder="e.g. Cable Bayesian Curl"
              className={INPUT_CLASS}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Muscle Category">
              <select
                value={newExCat}
                onChange={(e) => setNewExCat(e.target.value as ExerciseCategory)}
                className={INPUT_CLASS}
              >
                {CUSTOM_EXERCISE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Equipment">
              <input
                type="text"
                value={newExEquip}
                onChange={(e) => setNewExEquip(e.target.value)}
                placeholder="Barbell / Cable"
                className={INPUT_CLASS}
              />
            </FormField>
          </div>
          <FormField label="Form Notes (Optional)">
            <textarea
              rows={2}
              value={newExNotes}
              onChange={(e) => setNewExNotes(e.target.value)}
              placeholder="Cue notes..."
              className={INPUT_CLASS}
            />
          </FormField>
          <PrimaryButton type="submit" loading={savingEx} className="w-full">
            Save Custom Exercise
          </PrimaryButton>
        </form>
      </ModalSheet>

      {/* Create Custom Split Modal */}
      <ModalSheet open={newPlanOpen} onClose={() => setNewPlanOpen(false)} title="Create Workout Split">
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <FormField label="Plan Name">
            <input
              type="text"
              required
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Heavy Push Focus"
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Split Type">
            <select
              value={planSplit}
              onChange={(e) => setPlanSplit(e.target.value as SplitType)}
              className={INPUT_CLASS}
            >
              <option value="Push/Pull/Legs">Push/Pull/Legs</option>
              <option value="Upper/Lower">Upper/Lower</option>
              <option value="Arnold split">Arnold split</option>
              <option value="Full body">Full body</option>
              <option value="Custom">Custom</option>
            </select>
          </FormField>
          <FormField label="Description">
            <input
              type="text"
              value={planDesc}
              onChange={(e) => setPlanDesc(e.target.value)}
              placeholder="Goals or notes for this split"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-zinc-300">
              Select Exercises ({planSelectedExercises.length} added)
            </span>
            <input
              type="search"
              value={planExSearch}
              onChange={(e) => setPlanExSearch(e.target.value)}
              placeholder="Filter exercises to add..."
              className={`${INPUT_CLASS} text-xs`}
            />
            <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06]">
              {planFilteredExercises.map((ex) => {
                const exists = planSelectedExercises.some((i) => i.exercise.name === ex.name);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => {
                      if (exists) {
                        setPlanSelectedExercises((prev) =>
                          prev.filter((i) => i.exercise.name !== ex.name)
                        );
                      } else {
                        setPlanSelectedExercises((prev) => [
                          ...prev,
                          { exercise: ex, target_sets: 3, target_reps: '8-12' },
                        ]);
                      }
                    }}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-left text-xs hover:bg-white/[0.04]"
                  >
                    <span className="text-white font-medium">{ex.name}</span>
                    <span
                      className="font-semibold"
                      style={{ color: exists ? 'var(--accent-primary)' : '#71717A' }}
                    >
                      {exists ? 'Added' : '+ Add'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <PrimaryButton type="submit" loading={savingPlan} className="w-full">
            Save Workout Split
          </PrimaryButton>
        </form>
      </ModalSheet>

      {/* Active Workout Conflict Confirmation Modal */}
      <ModalSheet
        open={pendingStartRequest !== null}
        onClose={() => setPendingStartRequest(null)}
        title="Workout Already in Progress"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            You currently have <strong className="text-white">{activeWorkout?.workoutName}</strong>{' '}
            running ({formatDuration(elapsedSeconds)}). Do you want to resume it or start{' '}
            <strong className="text-white">{pendingStartRequest?.workoutName}</strong> instead?
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <PrimaryButton
              onClick={() => {
                setPendingStartRequest(null);
                navigate('/workout/active');
              }}
              className="flex-1"
            >
              <Play className="w-4 h-4" />
              Resume Current
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                if (pendingStartRequest) {
                  startNewWorkout(pendingStartRequest);
                }
                setPendingStartRequest(null);
                navigate('/workout/active');
              }}
              className="flex-1"
            >
              Start New Instead
            </SecondaryButton>
          </div>
        </div>
      </ModalSheet>

      {/* Delete Active Session Confirmation Modal */}
      <ModalSheet
        open={discardActiveConfirm}
        onClose={() => setDiscardActiveConfirm(false)}
        title="Delete Active Strength Session?"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Deleting this session permanently removes its active timer and unsaved sets. Saved
            workout history remains untouched.
          </p>
          <div className="flex gap-2.5">
            <SecondaryButton
              onClick={() => setDiscardActiveConfirm(false)}
              className="flex-1"
            >
              Keep Training
            </SecondaryButton>
            <button
              type="button"
              onClick={() => {
                discardWorkout();
                setDiscardActiveConfirm(false);
                showToast('Strength session deleted.', 'info');
              }}
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
