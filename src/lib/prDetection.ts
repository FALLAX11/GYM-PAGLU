import { estimateOneRepMaxKg } from './units';
import type {
  ExercisePRBaseline,
  SetType,
  WorkoutSessionRecord,
} from '../types/database';

export interface SetPRResult {
  isWeightPR: boolean;
  is1RMPR: boolean;
  isVolumePR: boolean;
  anyPR: boolean;
  estimated1RMKg: number;
  setVolumeKg: number;
  labels: string[];
}

export interface SessionPRHighlight {
  exerciseName: string;
  weightPR?: { previousKg: number; newKg: number };
  oneRMPR?: { previousKg: number; newKg: number };
  volumePR?: { previousKg: number; newKg: number; reps: number; weightKg: number };
}

export interface PersistedSessionPRSummary {
  sessionId: string;
  clientRequestId: string;
  workoutName: string;
  workoutDate: string;
  achievedAt: string;
  highlights: SessionPRHighlight[];
}

const PR_SUMMARY_STORAGE_KEY = (userId: string) => `gympaglu_pr_summaries_v1_${userId}`;

export function evaluateSetPR(params: {
  weightKg: number;
  reps: number;
  setType?: SetType;
  baseline?: ExercisePRBaseline | null;
  priorWorkingSetsInSession?: Array<{ weight_kg: number; reps: number; set_type?: SetType; is_completed: boolean }>;
}): SetPRResult {
  const { weightKg, reps, setType = 'normal', baseline, priorWorkingSetsInSession = [] } = params;

  if (setType === 'warmup' || weightKg <= 0 || reps <= 0) {
    return {
      isWeightPR: false,
      is1RMPR: false,
      isVolumePR: false,
      anyPR: false,
      estimated1RMKg: 0,
      setVolumeKg: 0,
      labels: [],
    };
  }

  const estimated1RMKg = estimateOneRepMaxKg(weightKg, reps);
  const setVolumeKg = Math.round(weightKg * reps * 100) / 100;

  const hasHistoricalRecord = Boolean(
    baseline &&
      (baseline.maxWeightKg > 0 || baseline.best1RMKg > 0 || baseline.maxSetVolumeKg > 0)
  );

  // Require at least one prior historical completed record to celebrate a true PR
  if (!hasHistoricalRecord || !baseline) {
    return {
      isWeightPR: false,
      is1RMPR: false,
      isVolumePR: false,
      anyPR: false,
      estimated1RMKg,
      setVolumeKg,
      labels: [],
    };
  }

  let bestWeightSoFar = baseline.maxWeightKg;
  let best1RMSoFar = baseline.best1RMKg;
  let bestVolumeSoFar = baseline.maxSetVolumeKg;

  for (const s of priorWorkingSetsInSession) {
    if (!s.is_completed || (s.set_type ?? 'normal') === 'warmup') continue;
    if (s.weight_kg <= 0 || s.reps <= 0) continue;
    if (s.weight_kg > bestWeightSoFar) bestWeightSoFar = s.weight_kg;
    const rm = estimateOneRepMaxKg(s.weight_kg, s.reps);
    if (rm > best1RMSoFar) best1RMSoFar = rm;
    const vol = Math.round(s.weight_kg * s.reps * 100) / 100;
    if (vol > bestVolumeSoFar) bestVolumeSoFar = vol;
  }

  const isWeightPR = weightKg > bestWeightSoFar + 0.01;
  const is1RMPR = estimated1RMKg > best1RMSoFar + 0.05;
  const isVolumePR = setVolumeKg > bestVolumeSoFar + 0.05;

  const labels: string[] = [];
  if (isWeightPR) labels.push('Heaviest Weight PR');
  if (is1RMPR) labels.push('Best Est. 1RM PR');
  if (isVolumePR) labels.push('Max Set Volume PR');

  return {
    isWeightPR,
    is1RMPR,
    isVolumePR,
    anyPR: isWeightPR || is1RMPR || isVolumePR,
    estimated1RMKg,
    setVolumeKg,
    labels,
  };
}

export function computeSessionPRSummary(
  exercises: Array<{
    exercise_name: string;
    sets: Array<{
      weight_kg: number;
      reps: number;
      is_completed: boolean;
      set_type?: SetType;
    }>;
  }>,
  baselines: Record<string, ExercisePRBaseline | null | undefined>
): SessionPRHighlight[] {
  const highlights: SessionPRHighlight[] = [];

  for (const ex of exercises) {
    const baseline = baselines[ex.exercise_name];
    if (
      !baseline ||
      (baseline.maxWeightKg <= 0 && baseline.best1RMKg <= 0 && baseline.maxSetVolumeKg <= 0)
    ) {
      continue;
    }

    let bestNewWeight = baseline.maxWeightKg;
    let bestNew1RM = baseline.best1RMKg;
    let bestNewVolume = baseline.maxSetVolumeKg;
    let bestVolSet: { weightKg: number; reps: number } | null = null;

    for (const s of ex.sets) {
      if (!s.is_completed || (s.set_type ?? 'normal') === 'warmup') continue;
      if (s.weight_kg <= 0 || s.reps <= 0) continue;

      if (s.weight_kg > bestNewWeight + 0.01) {
        bestNewWeight = s.weight_kg;
      }
      const rm = estimateOneRepMaxKg(s.weight_kg, s.reps);
      if (rm > bestNew1RM + 0.05) {
        bestNew1RM = rm;
      }
      const vol = Math.round(s.weight_kg * s.reps * 100) / 100;
      if (vol > bestNewVolume + 0.05) {
        bestNewVolume = vol;
        bestVolSet = { weightKg: s.weight_kg, reps: s.reps };
      }
    }

    const item: SessionPRHighlight = { exerciseName: ex.exercise_name };
    let hasAny = false;

    if (bestNewWeight > baseline.maxWeightKg + 0.01) {
      item.weightPR = { previousKg: baseline.maxWeightKg, newKg: bestNewWeight };
      hasAny = true;
    }
    if (bestNew1RM > baseline.best1RMKg + 0.05) {
      item.oneRMPR = { previousKg: baseline.best1RMKg, newKg: bestNew1RM };
      hasAny = true;
    }
    if (bestNewVolume > baseline.maxSetVolumeKg + 0.05 && bestVolSet) {
      item.volumePR = {
        previousKg: baseline.maxSetVolumeKg,
        newKg: bestNewVolume,
        reps: bestVolSet.reps,
        weightKg: bestVolSet.weightKg,
      };
      hasAny = true;
    }

    if (hasAny) {
      highlights.push(item);
    }
  }

  return highlights;
}

export function computeBaselinesFromSessions(
  sessions: WorkoutSessionRecord[],
  excludeClientRequestId?: string
): Record<string, ExercisePRBaseline> {
  const map: Record<string, ExercisePRBaseline> = {};
  const sessionSeenPerExercise = new Map<string, Set<string>>();

  for (const sess of sessions) {
    if (sess.status !== 'completed') continue;
    if (excludeClientRequestId && sess.client_request_id === excludeClientRequestId) continue;

    for (const ex of sess.workout_session_exercises ?? []) {
      const name = ex.exercise_name;
      if (!map[name]) {
        map[name] = {
          exerciseName: name,
          maxWeightKg: 0,
          best1RMKg: 0,
          maxSetVolumeKg: 0,
          sessionsLogged: 0,
        };
      }
      if (!sessionSeenPerExercise.has(name)) {
        sessionSeenPerExercise.set(name, new Set());
      }

      let hasCompletedWorking = false;
      for (const s of ex.workout_sets ?? []) {
        if (!s.is_completed || (s.set_type ?? 'normal') === 'warmup') continue;
        const w = Number(s.weight_kg) || 0;
        const r = Number(s.reps) || 0;
        if (w <= 0 || r <= 0) continue;

        hasCompletedWorking = true;
        if (w > map[name].maxWeightKg) map[name].maxWeightKg = w;
        const rm = estimateOneRepMaxKg(w, r);
        if (rm > map[name].best1RMKg) map[name].best1RMKg = rm;
        const vol = Math.round(w * r * 100) / 100;
        if (vol > map[name].maxSetVolumeKg) map[name].maxSetVolumeKg = vol;
      }

      if (hasCompletedWorking) {
        sessionSeenPerExercise.get(name)!.add(sess.id);
        map[name].sessionsLogged = sessionSeenPerExercise.get(name)!.size;
      }
    }
  }

  return map;
}

export function persistSessionPRSummary(
  userId: string,
  summary: PersistedSessionPRSummary
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const raw = window.localStorage.getItem(PR_SUMMARY_STORAGE_KEY(userId));
    const existing: PersistedSessionPRSummary[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing)
      ? existing.filter(
          (item) =>
            item.sessionId !== summary.sessionId &&
            item.clientRequestId !== summary.clientRequestId
        )
      : [];
    window.localStorage.setItem(
      PR_SUMMARY_STORAGE_KEY(userId),
      JSON.stringify([summary, ...filtered].slice(0, 60))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSessionPRSummary(
  userId: string,
  sessionId: string
): PersistedSessionPRSummary | null {
  if (typeof window === 'undefined' || !userId || !sessionId) return null;
  try {
    const raw = window.localStorage.getItem(PR_SUMMARY_STORAGE_KEY(userId));
    if (!raw) return null;
    const list: PersistedSessionPRSummary[] = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    return list.find((s) => s.sessionId === sessionId) ?? null;
  } catch {
    return null;
  }
}
