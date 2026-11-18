import { MASTER_EXERCISE_CATALOG } from '../data/masterExerciseCatalog';
import { getSupabaseClient, isSchemaMissingError } from './supabase';
import {
  ALL_MUSCLE_REGION_IDS,
  MUSCLE_REGION_META,
  resolveLoggedExerciseMuscles,
  type MuscleRegionId,
} from './muscleAnatomy';
import type { ExerciseItem, WorkoutSessionRecord } from '../types/database';

export type HeuristicRecoveryStatus = 'fresh' | 'recovering' | 'fatigued';

export const HEURISTIC_RECOVERY_DISCLAIMER =
  'Heuristic estimate based on your recent logged working sets and hours since training — not a medical or scientifically exact recovery measurement.';

export interface MuscleWeeklyStat {
  muscleId: MuscleRegionId;
  label: string;
  shortLabel: string;
  workingSets: number;
  secondarySets: number;
  weeklyVolumeKg: number;
  frequency: number;
  targetSets: number;
  targetPct: number;
  hoursSinceLastTrained: number | null;
  lastTrainedDate: string | null;
  lastSessionSets: number;
  recoveryStatus: HeuristicRecoveryStatus;
  recoveryLabel: string;
  recoveryReason: string;
}

export type MuscleTargetsMap = Record<MuscleRegionId, number>;

const LOCAL_MUSCLE_TARGETS_KEY = (userId: string) =>
  `gympaglu_muscle_targets_v1_${userId}`;

export function getDefaultMuscleTargets(): MuscleTargetsMap {
  const map = {} as MuscleTargetsMap;
  for (const id of ALL_MUSCLE_REGION_IDS) {
    map[id] = MUSCLE_REGION_META[id].defaultWeeklyTarget;
  }
  return map;
}

export function loadLocalMuscleTargets(userId: string): MuscleTargetsMap {
  const defaults = getDefaultMuscleTargets();
  if (typeof window === 'undefined' || !userId) return defaults;
  try {
    const raw = window.localStorage.getItem(LOCAL_MUSCLE_TARGETS_KEY(userId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<MuscleRegionId, number>>;
    const merged = { ...defaults };
    for (const id of ALL_MUSCLE_REGION_IDS) {
      const val = Number(parsed[id]);
      if (Number.isFinite(val) && val >= 0 && val <= 60) {
        merged[id] = Math.round(val);
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveLocalMuscleTargets(userId: string, targets: MuscleTargetsMap): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(LOCAL_MUSCLE_TARGETS_KEY(userId), JSON.stringify(targets));
  } catch {
    // Ignore storage quota errors
  }
}

export async function fetchMuscleTargets(userId: string): Promise<MuscleTargetsMap> {
  const local = loadLocalMuscleTargets(userId);
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return local;

  try {
    const { data, error } = await supabase
      .from('user_muscle_targets')
      .select('targets')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error)) return local;
      return local;
    }

    if (data?.targets && typeof data.targets === 'object') {
      const defaults = getDefaultMuscleTargets();
      const merged = { ...defaults };
      const rawObj = data.targets as Record<string, unknown>;
      for (const id of ALL_MUSCLE_REGION_IDS) {
        const val = Number(rawObj[id]);
        if (Number.isFinite(val) && val >= 0 && val <= 60) {
          merged[id] = Math.round(val);
        }
      }
      saveLocalMuscleTargets(userId, merged);
      return merged;
    }
  } catch {
    // Fall back to localStorage
  }

  return local;
}

export async function persistMuscleTargets(
  userId: string,
  targets: MuscleTargetsMap
): Promise<void> {
  saveLocalMuscleTargets(userId, targets);
  const supabase = getSupabaseClient();
  if (!supabase || !userId) return;

  try {
    const { error } = await supabase.from('user_muscle_targets').upsert(
      {
        user_id: userId,
        targets,
      },
      { onConflict: 'user_id' }
    );
    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  } catch {
    // Local cache already saved cleanly
  }
}

function getSessionTimestampMs(session: WorkoutSessionRecord): number {
  if (session.ended_at) {
    const t = new Date(session.ended_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (session.started_at) {
    const t = new Date(session.started_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const fallback = new Date(`${session.workout_date}T12:00:00`).getTime();
  return Number.isFinite(fallback) ? fallback : Date.now();
}

function computeHeuristicRecovery(params: {
  hoursSinceLastTrained: number | null;
  lastSessionSets: number;
  weeklySets: number;
  targetSets: number;
}): {
  status: HeuristicRecoveryStatus;
  label: string;
  reason: string;
} {
  const { hoursSinceLastTrained, lastSessionSets, weeklySets, targetSets } = params;

  if (hoursSinceLastTrained === null || weeklySets === 0) {
    return {
      status: 'fresh',
      label: 'Fresh',
      reason: 'No working sets logged in the last 7 days.',
    };
  }

  const ratio = targetSets > 0 ? weeklySets / targetSets : weeklySets / 10;

  if (
    (hoursSinceLastTrained < 24 && lastSessionSets >= 3) ||
    (hoursSinceLastTrained < 36 && lastSessionSets >= 10) ||
    (hoursSinceLastTrained < 48 && ratio >= 1.25)
  ) {
    return {
      status: 'fatigued',
      label: 'Potentially Fatigued',
      reason: `${lastSessionSets} sets ${Math.round(hoursSinceLastTrained)}h ago · high recent load`,
    };
  }

  if (hoursSinceLastTrained >= 72 || (hoursSinceLastTrained >= 48 && lastSessionSets <= 4)) {
    return {
      status: 'fresh',
      label: 'Fresh',
      reason: `${Math.round(hoursSinceLastTrained)}h since last session`,
    };
  }

  return {
    status: 'recovering',
    label: 'Recovering',
    reason: `${lastSessionSets} sets · ${Math.round(hoursSinceLastTrained)}h elapsed`,
  };
}

export function computeWeeklyMuscleAnalytics(
  sessions: WorkoutSessionRecord[],
  exerciseCatalog: ExerciseItem[] = MASTER_EXERCISE_CATALOG,
  targets: MuscleTargetsMap = getDefaultMuscleTargets(),
  referenceNow: Date = new Date()
): MuscleWeeklyStat[] {
  const catalogIndex = new Map<string, ExerciseItem>();
  for (const item of MASTER_EXERCISE_CATALOG) {
    catalogIndex.set(item.name.trim().toLowerCase(), item);
  }
  for (const item of exerciseCatalog) {
    catalogIndex.set(item.name.trim().toLowerCase(), item);
  }

  const nowMs = referenceNow.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(nowMs - 6 * 24 * 60 * 60 * 1000);
  const cutoffDateStr = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(cutoffDate.getDate()).padStart(2, '0')}`;

  interface Accumulator {
    workingSets: number;
    secondarySets: number;
    weeklyVolumeKg: number;
    dates: Set<string>;
    latestSessionMs: number | null;
    latestDate: string | null;
    latestSessionSets: number;
  }

  const accum = new Map<MuscleRegionId, Accumulator>();
  for (const id of ALL_MUSCLE_REGION_IDS) {
    accum.set(id, {
      workingSets: 0,
      secondarySets: 0,
      weeklyVolumeKg: 0,
      dates: new Set<string>(),
      latestSessionMs: null,
      latestDate: null,
      latestSessionSets: 0,
    });
  }

  const completedSessions = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => getSessionTimestampMs(b) - getSessionTimestampMs(a));

  for (const sess of completedSessions) {
    const sessMs = getSessionTimestampMs(sess);
    const isWithinWeek =
      sess.workout_date >= cutoffDateStr || nowMs - sessMs <= sevenDaysMs;
    if (!isWithinWeek) continue;

    // Count sets per muscle within this single session for recovery heuristics
    const sessionPrimarySets = new Map<MuscleRegionId, number>();

    for (const ex of sess.workout_session_exercises ?? []) {
      const mapping = resolveLoggedExerciseMuscles(
        ex.exercise_name,
        ex.exercise_category,
        catalogIndex
      );
      const completedWorkingSets = (ex.workout_sets ?? []).filter(
        (s) => s.is_completed && (s.set_type ?? 'normal') !== 'warmup'
      );
      if (completedWorkingSets.length === 0) continue;

      const setCount = completedWorkingSets.length;
      const exVolumeKg = completedWorkingSets.reduce(
        (sum, s) => sum + (Number(s.weight_kg) || 0) * Math.max(0, Number(s.reps) || 0),
        0
      );

      for (const mId of mapping.primary) {
        const entry = accum.get(mId)!;
        entry.workingSets += setCount;
        entry.weeklyVolumeKg += exVolumeKg;
        entry.dates.add(sess.workout_date);
        sessionPrimarySets.set(mId, (sessionPrimarySets.get(mId) ?? 0) + setCount);
      }

      for (const mId of mapping.secondary) {
        const entry = accum.get(mId)!;
        entry.secondarySets += setCount;
      }
    }

    for (const [mId, setsInSess] of sessionPrimarySets.entries()) {
      const entry = accum.get(mId)!;
      if (entry.latestSessionMs === null || sessMs > entry.latestSessionMs) {
        entry.latestSessionMs = sessMs;
        entry.latestDate = sess.workout_date;
        entry.latestSessionSets = setsInSess;
      }
    }
  }

  return ALL_MUSCLE_REGION_IDS.map((id) => {
    const meta = MUSCLE_REGION_META[id];
    const entry = accum.get(id)!;
    const targetSets = Math.max(0, targets[id] ?? meta.defaultWeeklyTarget);
    const hoursSinceLastTrained =
      entry.latestSessionMs !== null
        ? Math.max(0, (nowMs - entry.latestSessionMs) / (1000 * 60 * 60))
        : null;

    const recovery = computeHeuristicRecovery({
      hoursSinceLastTrained,
      lastSessionSets: entry.latestSessionSets,
      weeklySets: entry.workingSets,
      targetSets,
    });

    return {
      muscleId: id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      workingSets: entry.workingSets,
      secondarySets: entry.secondarySets,
      weeklyVolumeKg: Math.round(entry.weeklyVolumeKg * 10) / 10,
      frequency: entry.dates.size,
      targetSets,
      targetPct:
        targetSets > 0 ? Math.min(200, Math.round((entry.workingSets / targetSets) * 100)) : 0,
      hoursSinceLastTrained:
        hoursSinceLastTrained !== null ? Math.round(hoursSinceLastTrained * 10) / 10 : null,
      lastTrainedDate: entry.latestDate,
      lastSessionSets: entry.latestSessionSets,
      recoveryStatus: recovery.status,
      recoveryLabel: recovery.label,
      recoveryReason: recovery.reason,
    };
  });
}
