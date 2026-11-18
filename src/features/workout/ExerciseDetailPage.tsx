import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Award, ChevronRight, Dumbbell, Plus } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
} from '../../components/ui/Primitives';
import { MuscleBodySvg } from '../../components/workout/MuscleBodySvg';
import { useAuth } from '../../context/AuthContext';
import { MASTER_EXERCISE_CATALOG } from '../../data/masterExerciseCatalog';
import { resolveExerciseMuscles } from '../../lib/muscleAnatomy';
import { isSchemaMissingError } from '../../lib/supabase';
import { formatWeight, toDisplayWeight } from '../../lib/units';
import {
  fetchExerciseLifetimeHistory,
  type ExerciseHistoryEntry,
} from '../../services/workoutService';

export function ExerciseDetailPage() {
  const { exerciseName } = useParams<{ exerciseName: string }>();
  const decodedName = decodeURIComponent(exerciseName || '');
  const navigate = useNavigate();
  const { user, settings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ExerciseHistoryEntry[]>([]);

  const catalogMeta = useMemo(() => {
    const lower = decodedName.trim().toLowerCase();
    return (
      MASTER_EXERCISE_CATALOG.find(
        (ex) =>
          ex.name.toLowerCase() === lower ||
          (ex.aliases ?? []).some((alias) => alias.toLowerCase() === lower)
      ) ?? null
    );
  }, [decodedName]);

  const load = useCallback(async () => {
    if (!user || !decodedName) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchExerciseLifetimeHistory(user.id, decodedName);
      setHistory(rows);
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [decodedName, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const personalRecords = useMemo(() => {
    let maxWeightKg = 0;
    let best1RMKg = 0;
    let maxVolumeKg = 0;
    for (const h of history) {
      if (h.maxWeightKg > maxWeightKg) maxWeightKg = h.maxWeightKg;
      if (h.estimated1RMKg > best1RMKg) best1RMKg = h.estimated1RMKg;
      if (h.totalVolumeKg > maxVolumeKg) maxVolumeKg = h.totalVolumeKg;
    }
    return { maxWeightKg, best1RMKg, maxVolumeKg };
  }, [history]);

  const chartData = useMemo(() => {
    return [...history]
      .reverse()
      .map((h) => ({
        date: h.workoutDate,
        topWeight: toDisplayWeight(h.maxWeightKg, settings.weight_unit),
        est1RM: toDisplayWeight(h.estimated1RMKg, settings.weight_unit),
      }));
  }, [history, settings.weight_unit]);

  return (
    <AppShell
      title={decodedName || 'Exercise History'}
      showBack
      headerAction={
        catalogMeta && (
          <PrimaryButton
            onClick={() =>
              navigate('/workout/active', { state: { preselectExercise: catalogMeta } })
            }
          >
            <Plus className="w-4 h-4" />
            Add to Workout
          </PrimaryButton>
        )
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs text-zinc-400">
            {catalogMeta
              ? `${catalogMeta.categories?.join(', ') || catalogMeta.category} · ${catalogMeta.equipment} · ${catalogMeta.exercise_type ?? 'Compound'} · ${catalogMeta.difficulty ?? 'Intermediate'}`
              : 'Exercise Lifetime Analytics'}
          </p>
          <h1 className="font-display text-2xl font-bold text-white mt-0.5">{decodedName}</h1>
        </div>

        {catalogMeta && (
          <Card className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-300">
              <p>
                <strong className="text-white">Primary Muscle:</strong>{' '}
                {catalogMeta.primary_muscle ?? catalogMeta.category}
              </p>
              <p>
                <strong className="text-white">Target Muscle:</strong>{' '}
                {catalogMeta.target_muscle ?? catalogMeta.category}
              </p>
              {catalogMeta.secondary_muscles && catalogMeta.secondary_muscles.length > 0 && (
                <p className="sm:col-span-2 text-zinc-400">
                  <strong className="text-zinc-200">Secondary Muscles:</strong>{' '}
                  {catalogMeta.secondary_muscles.join(', ')}
                </p>
              )}
            </div>
            {catalogMeta.instructions && (
              <div className="pt-2 border-t border-white/[0.06] space-y-1">
                <p className="font-semibold text-white">Instructions</p>
                <p className="text-zinc-300 leading-relaxed">{catalogMeta.instructions}</p>
              </div>
            )}
            {catalogMeta.common_mistakes && (
              <div className="pt-2 border-t border-white/[0.06] space-y-1">
                <p className="font-semibold text-amber-300 inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Common Mistakes
                </p>
                <p className="text-amber-100/80 leading-relaxed">{catalogMeta.common_mistakes}</p>
              </div>
            )}
            {(() => {
              const muscleMap = resolveExerciseMuscles(catalogMeta);
              return (
                <div className="pt-2 border-t border-white/[0.06]">
                  <MuscleBodySvg
                    mode="highlight"
                    primaryMuscles={muscleMap.primary}
                    secondaryMuscles={muscleMap.secondary}
                    compact
                    onSelectMuscle={(muscleId) => navigate(`/workout?muscle=${muscleId}`)}
                  />
                </div>
              );
            })()}
          </Card>
        )}

        {error && <ErrorBanner message={error} onRetry={load} />}

        {loading ? (
          <LoadingBlock label="Analyzing exercise records..." />
        ) : history.length === 0 ? (
          <EmptyState
            icon={<Dumbbell className="w-6 h-6" />}
            title="No logged history yet"
            description={`Complete a workout containing ${decodedName} to unlock personal records and progression charts.`}
          />
        ) : (
          <>
            {/* Personal Records Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Award className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span>Heaviest Weight PR</span>
                </div>
                <p className="font-mono-num text-2xl font-bold text-white mt-1.5">
                  {formatWeight(personalRecords.maxWeightKg, settings.weight_unit)}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-zinc-400">Estimated 1RM PR</p>
                <p className="font-mono-num text-2xl font-bold text-white mt-1.5">
                  {formatWeight(personalRecords.best1RMKg, settings.weight_unit)}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-zinc-400">Best Session Volume</p>
                <p className="font-mono-num text-2xl font-bold text-white mt-1.5">
                  {formatWeight(personalRecords.maxVolumeKg, settings.weight_unit)}
                </p>
              </Card>
            </div>

            {/* Strength Progression Chart */}
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-white">
                  Strength Progression ({settings.weight_unit.toUpperCase()})
                </h2>
                <span className="text-xs text-zinc-400 font-mono-num">
                  {history.length} sessions
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717A" fontSize={11} />
                    <YAxis stroke="#71717A" fontSize={11} width={40} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111318',
                        borderColor: 'rgba(255,255,255,0.12)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="topWeight"
                      name="Top Weight"
                      stroke="#C4F82A"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="est1RM"
                      name="Est. 1RM"
                      stroke="#38BDF8"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Date-wise Log */}
            <div className="space-y-3">
              <h2 className="font-display text-base font-bold text-white">
                Date-Wise Set History
              </h2>
              {history.map((entry) => (
                <Card
                  key={entry.sessionId}
                  onClick={() => navigate(`/workout/session/${entry.sessionId}`)}
                  className="space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono-num text-xs text-zinc-400">{entry.workoutDate}</p>
                      <p className="text-sm font-semibold text-white">{entry.workoutName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-semibold text-zinc-300">
                        {formatWeight(entry.totalVolumeKg, settings.weight_unit)} vol
                      </span>
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.06]">
                    {entry.sets.map((s) => (
                      <p key={s.set_number} className="font-mono-num text-xs text-zinc-300">
                        Set {s.set_number}: {formatWeight(s.weight_kg, settings.weight_unit)} ×{' '}
                        {s.reps} reps
                      </p>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
