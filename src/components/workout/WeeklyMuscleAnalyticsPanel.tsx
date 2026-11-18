import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Info, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  Card,
  INPUT_CLASS,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../ui/Primitives';
import { MuscleBodySvg } from './MuscleBodySvg';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MASTER_EXERCISE_CATALOG } from '../../data/masterExerciseCatalog';
import {
  ALL_MUSCLE_REGION_IDS,
  MUSCLE_REGION_META,
  type MuscleRegionId,
} from '../../lib/muscleAnatomy';
import {
  computeWeeklyMuscleAnalytics,
  fetchMuscleTargets,
  getDefaultMuscleTargets,
  HEURISTIC_RECOVERY_DISCLAIMER,
  persistMuscleTargets,
  type HeuristicRecoveryStatus,
  type MuscleTargetsMap,
} from '../../lib/muscleAnalytics';
import { formatWeight } from '../../lib/units';
import { fetchExerciseCatalog } from '../../services/workoutService';
import type { ExerciseItem, WorkoutSessionRecord } from '../../types/database';

function getRecoveryBadgeClasses(status: HeuristicRecoveryStatus): string {
  if (status === 'fatigued') {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/35';
  }
  if (status === 'recovering') {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
  }
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
}

export function WeeklyMuscleAnalyticsPanel({
  sessions,
}: {
  sessions: WorkoutSessionRecord[];
}) {
  const navigate = useNavigate();
  const { user, settings } = useAuth();
  const { showToast } = useToast();

  const [catalog, setCatalog] = useState<ExerciseItem[]>(MASTER_EXERCISE_CATALOG);
  const [targets, setTargets] = useState<MuscleTargetsMap>(() => getDefaultMuscleTargets());
  const [draftTargets, setDraftTargets] = useState<MuscleTargetsMap>(() =>
    getDefaultMuscleTargets()
  );
  const [targetsModalOpen, setTargetsModalOpen] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleRegionId>('chest');

  useEffect(() => {
    if (!user) return;
    void fetchMuscleTargets(user.id).then((loaded) => {
      setTargets(loaded);
      setDraftTargets(loaded);
    });
    void fetchExerciseCatalog(user.id)
      .then(setCatalog)
      .catch(() => setCatalog(MASTER_EXERCISE_CATALOG));
  }, [user]);

  const stats = useMemo(
    () => computeWeeklyMuscleAnalytics(sessions, catalog, targets),
    [catalog, sessions, targets]
  );

  const recoveryByMuscle = useMemo(() => {
    const map: Partial<Record<MuscleRegionId, HeuristicRecoveryStatus>> = {};
    for (const s of stats) map[s.muscleId] = s.recoveryStatus;
    return map;
  }, [stats]);

  const trainedMuscles = useMemo(
    () => stats.filter((s) => s.workingSets > 0).map((s) => s.muscleId),
    [stats]
  );

  // Auto-select most-trained muscle on initial load if chest has 0 sets
  useEffect(() => {
    const topTrained = [...stats].sort((a, b) => b.workingSets - a.workingSets)[0];
    if (topTrained && topTrained.workingSets > 0 && selectedMuscle === 'chest') {
      const chestStat = stats.find((s) => s.muscleId === 'chest');
      if ((chestStat?.workingSets ?? 0) === 0) {
        setSelectedMuscle(topTrained.muscleId);
      }
    }
  }, [selectedMuscle, stats]);

  const selectedStat =
    stats.find((s) => s.muscleId === selectedMuscle) ?? stats[0];

  const totalWeeklyWorkingSets = useMemo(
    () => stats.reduce((sum, s) => sum + s.workingSets, 0),
    [stats]
  );
  const musclesHitCount = useMemo(
    () => stats.filter((s) => s.workingSets > 0).length,
    [stats]
  );

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingTargets(true);
    try {
      await persistMuscleTargets(user.id, draftTargets);
      setTargets(draftTargets);
      setTargetsModalOpen(false);
      showToast('Weekly muscle set targets saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingTargets(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Weekly Muscle Volume &amp; Recovery
          </h2>
          <p className="text-xs text-zinc-400">
            Last 7 days · {totalWeeklyWorkingSets} direct working sets across {musclesHitCount} of{' '}
            {ALL_MUSCLE_REGION_IDS.length} muscle groups (warm-ups excluded)
          </p>
        </div>
        <SecondaryButton
          onClick={() => {
            setDraftTargets(targets);
            setTargetsModalOpen(true);
          }}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Weekly Set Targets
        </SecondaryButton>
      </div>

      {/* Explicit Heuristic Non-Medical Disclaimer */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-zinc-300">
        <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">{HEURISTIC_RECOVERY_DISCLAIMER}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Interactive Recovery Body Map */}
        <Card className="lg:col-span-5 space-y-3">
          <MuscleBodySvg
            mode="recovery"
            recoveryByMuscle={recoveryByMuscle}
            trainedMuscles={trainedMuscles}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={setSelectedMuscle}
          />
        </Card>

        {/* Selected Muscle Spotlight + Per-Muscle Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          {selectedStat && (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-400">
                    {MUSCLE_REGION_META[selectedStat.muscleId].anatomyNote}
                  </p>
                  <h3 className="font-display text-lg font-bold text-white mt-0.5">
                    {selectedStat.label}
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${getRecoveryBadgeClasses(
                    selectedStat.recoveryStatus
                  )}`}
                >
                  {selectedStat.recoveryLabel} (Heuristic)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-zinc-400">Working Sets</p>
                  <p className="font-mono-num text-xl font-bold text-white mt-0.5">
                    {selectedStat.workingSets}
                    <span className="text-xs font-normal text-zinc-400">
                      {' '}
                      / {selectedStat.targetSets}
                    </span>
                  </p>
                  {selectedStat.secondarySets > 0 && (
                    <p className="text-[11px] text-zinc-500 font-mono-num">
                      +{selectedStat.secondarySets} secondary
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400">Weekly Volume</p>
                  <p className="font-mono-num text-xl font-bold text-white mt-0.5">
                    {formatWeight(selectedStat.weeklyVolumeKg, settings.weight_unit)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400">Frequency</p>
                  <p className="font-mono-num text-xl font-bold text-white mt-0.5">
                    {selectedStat.frequency}
                    <span className="text-xs font-normal text-zinc-400"> / wk</span>
                  </p>
                </div>
              </div>

              {/* Target Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{selectedStat.recoveryReason}</span>
                  <span className="font-mono-num font-semibold text-white">
                    {selectedStat.targetPct}% of target
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, selectedStat.targetPct)}%`,
                      backgroundColor: 'var(--accent-primary)',
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                <span className="text-xs text-zinc-400">
                  {selectedStat.lastTrainedDate
                    ? `Last trained ${selectedStat.lastTrainedDate}`
                    : 'Not trained in the past 7 days'}
                </span>
                <SecondaryButton
                  onClick={() => navigate(`/workout?muscle=${selectedStat.muscleId}`)}
                >
                  <Dumbbell className="w-4 h-4" />
                  Browse {selectedStat.shortLabel} Exercises
                </SecondaryButton>
              </div>
            </Card>
          )}

          {/* All 15 Muscle Groups Scrollable Matrix */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-white">
                All Muscle Groups (Tap to Inspect)
              </h3>
              <span className="text-[11px] text-zinc-400">Sets · Volume · Frequency</span>
            </div>
            <div className="divide-y divide-white/[0.06] max-h-80 overflow-y-auto">
              {[...stats]
                .sort((a, b) => b.workingSets - a.workingSets || a.label.localeCompare(b.label))
                .map((row) => {
                  const isSelected = row.muscleId === selectedMuscle;
                  return (
                    <button
                      key={row.muscleId}
                      type="button"
                      onClick={() => setSelectedMuscle(row.muscleId)}
                      className={`w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
                        isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">
                            {row.shortLabel}
                          </span>
                          <span className="text-[11px] text-zinc-500">·</span>
                          <span
                            className={`text-[11px] font-medium ${
                              row.recoveryStatus === 'fatigued'
                                ? 'text-rose-300'
                                : row.recoveryStatus === 'recovering'
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }`}
                          >
                            {row.recoveryLabel}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full max-w-[200px] rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, row.targetPct)}%`,
                              backgroundColor:
                                row.workingSets > 0 ? 'var(--accent-primary)' : 'transparent',
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-right font-mono-num shrink-0">
                        <p className="text-xs font-bold text-white">
                          {row.workingSets}/{row.targetSets} sets
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {formatWeight(row.weeklyVolumeKg, settings.weight_unit)} · {row.frequency}x
                        </p>
                      </div>
                    </button>
                  );
                })}
            </div>
          </Card>
        </div>
      </div>

      {/* Configurable Weekly Targets Modal */}
      <ModalSheet
        open={targetsModalOpen}
        onClose={() => setTargetsModalOpen(false)}
        title="Configure Weekly Set Targets"
      >
        <form onSubmit={handleSaveTargets} className="space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Set your target weekly direct working sets for each muscle group. Progress bars and
            volume heuristics adapt automatically.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {ALL_MUSCLE_REGION_IDS.map((id) => (
              <label
                key={id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <span className="text-xs font-medium text-zinc-200 truncate">
                  {MUSCLE_REGION_META[id].shortLabel}
                </span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={draftTargets[id] ?? 10}
                  onChange={(e) =>
                    setDraftTargets((prev) => ({
                      ...prev,
                      [id]: Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)),
                    }))
                  }
                  className={`${INPUT_CLASS} w-20 py-1.5 text-center font-mono-num text-xs`}
                />
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <SecondaryButton
              onClick={() => setDraftTargets(getDefaultMuscleTargets())}
              className="shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              Defaults
            </SecondaryButton>
            <PrimaryButton type="submit" loading={savingTargets} className="flex-1">
              Save Weekly Targets
            </PrimaryButton>
          </div>
        </form>
      </ModalSheet>
    </div>
  );
}
