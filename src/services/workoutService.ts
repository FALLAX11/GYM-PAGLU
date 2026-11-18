import { MASTER_EXERCISE_CATALOG } from '../data/masterExerciseCatalog';
import { computeBaselinesFromSessions } from '../lib/prDetection';
import { getSupabaseClient, isSchemaMissingError } from '../lib/supabase';
import type {
  ExerciseCategory,
  ExerciseDifficulty,
  ExerciseItem,
  ExerciseMovementType,
  ExercisePRBaseline,
  PreviousExercisePerformance,
  SetType,
  SplitType,
  WorkoutPlan,
  WorkoutSessionRecord,
} from '../types/database';

const MASTER_CATALOG_STORAGE_KEY = 'gympaglu_master_exercises_v1';
const LOCAL_CUSTOM_EXERCISES_KEY = (userId: string) => `gympaglu_custom_exercises_v1_${userId}`;
const LOCAL_SESSIONS_KEY = (userId: string) => `gympaglu_local_sessions_v1_${userId}`;
const LOCAL_PHASE1_META_KEY = (userId: string) => `gympaglu_phase1_session_meta_v1_${userId}`;

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Connect your Supabase project first.');
  }
  return client;
}

function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function loadMasterCatalogCached(): ExerciseItem[] {
  if (typeof window === 'undefined') return MASTER_EXERCISE_CATALOG;
  try {
    const raw = window.localStorage.getItem(MASTER_CATALOG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExerciseItem[];
      if (Array.isArray(parsed) && parsed.length >= MASTER_EXERCISE_CATALOG.length) {
        return parsed;
      }
    }
    window.localStorage.setItem(
      MASTER_CATALOG_STORAGE_KEY,
      JSON.stringify(MASTER_EXERCISE_CATALOG)
    );
  } catch {
    // Ignore storage quota errors
  }
  return MASTER_EXERCISE_CATALOG;
}

function loadLocalCustomExercises(userId: string): ExerciseItem[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CUSTOM_EXERCISES_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExerciseItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalCustomExercise(userId: string, item: ExerciseItem): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const existing = loadLocalCustomExercises(userId).filter(
      (x) => x.name.toLowerCase() !== item.name.toLowerCase()
    );
    window.localStorage.setItem(
      LOCAL_CUSTOM_EXERCISES_KEY(userId),
      JSON.stringify([item, ...existing])
    );
  } catch {
    // Ignore
  }
}

function loadLocalWorkoutSessions(userId: string): WorkoutSessionRecord[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSIONS_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkoutSessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalWorkoutSessions(userId: string, sessions: WorkoutSessionRecord[]): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(LOCAL_SESSIONS_KEY(userId), JSON.stringify(sessions));
  } catch {
    // Ignore
  }
}

interface StoredPhase1SessionMeta {
  exercises: Array<{
    sort_order: number;
    superset_group: string | null;
    sets: Array<{ set_number: number; set_type: SetType; rpe: number | null }>;
  }>;
}

function savePhase1SessionMeta(
  userId: string,
  clientRequestId: string,
  exercises: ActiveExerciseDraft[]
): void {
  if (typeof window === 'undefined' || !userId || !clientRequestId) return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PHASE1_META_KEY(userId));
    const map: Record<string, StoredPhase1SessionMeta> = raw ? JSON.parse(raw) : {};
    map[clientRequestId] = {
      exercises: exercises.map((ex, idx) => ({
        sort_order: idx + 1,
        superset_group: ex.superset_group ?? null,
        sets: ex.sets.map((s, sIdx) => ({
          set_number: sIdx + 1,
          set_type: s.set_type ?? 'normal',
          rpe: typeof s.rpe === 'number' ? s.rpe : null,
        })),
      })),
    };
    window.localStorage.setItem(LOCAL_PHASE1_META_KEY(userId), JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function loadPhase1MetaMap(userId: string): Record<string, StoredPhase1SessionMeta> {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_PHASE1_META_KEY(userId));
    return raw ? (JSON.parse(raw) as Record<string, StoredPhase1SessionMeta>) : {};
  } catch {
    return {};
  }
}

function enrichSessionsWithPhase1Meta(
  userId: string,
  sessions: WorkoutSessionRecord[]
): WorkoutSessionRecord[] {
  const metaMap = loadPhase1MetaMap(userId);
  return sessions.map((sess) => {
    const meta = metaMap[sess.client_request_id];
    sess.workout_session_exercises?.sort((a, b) => a.sort_order - b.sort_order);
    for (const ex of sess.workout_session_exercises ?? []) {
      const metaEx = meta?.exercises.find((m) => m.sort_order === ex.sort_order);
      if (ex.superset_group === undefined) {
        ex.superset_group = metaEx?.superset_group ?? null;
      }
      ex.workout_sets?.sort((a, b) => a.set_number - b.set_number);
      for (const st of ex.workout_sets ?? []) {
        const metaSet = metaEx?.sets.find((ms) => ms.set_number === st.set_number);
        if (!st.set_type) {
          st.set_type = metaSet?.set_type ?? 'normal';
        }
        if (st.rpe === undefined) {
          st.rpe = metaSet?.rpe ?? null;
        }
      }
    }
    return sess;
  });
}

function isColumnMissingError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  const code = String((err as { code?: string })?.code ?? '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

export interface ActiveSetDraft {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  rest_seconds: number;
  set_type?: SetType;
  rpe?: number | null;
}

export interface ActiveExerciseDraft {
  tempId: string;
  exercise_id: string | null;
  custom_exercise_id: string | null;
  exercise_name: string;
  exercise_category: string;
  rest_seconds: number;
  exercise_notes: string;
  superset_group?: string | null;
  sets: ActiveSetDraft[];
}

export interface SaveWorkoutPayload {
  client_request_id: string;
  plan_id: string | null;
  workout_name: string;
  workout_date: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  session_notes: string;
  exercises: ActiveExerciseDraft[];
}

export async function countPublicExercises(): Promise<number> {
  const supabase = requireClient();
  const { count, error } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function mapSupabasePublicExercise(
  row: Record<string, unknown>,
  fallbackMeta?: ExerciseItem
): ExerciseItem {
  const category = row.category as ExerciseCategory;
  const categoriesRaw = Array.isArray(row.categories)
    ? (row.categories as ExerciseCategory[])
    : [];
  const categories =
    categoriesRaw.length > 0
      ? categoriesRaw
      : fallbackMeta?.categories ?? [category];

  return {
    id: String(row.id),
    name: String(row.name),
    category,
    categories,
    primary_muscle:
      typeof row.primary_muscle === 'string' && row.primary_muscle
        ? row.primary_muscle
        : fallbackMeta?.primary_muscle ?? category,
    secondary_muscles: Array.isArray(row.secondary_muscles)
      ? (row.secondary_muscles as string[])
      : fallbackMeta?.secondary_muscles ?? [],
    equipment: String(row.equipment || fallbackMeta?.equipment || 'Other'),
    exercise_type:
      (row.exercise_type as ExerciseMovementType | undefined) ??
      fallbackMeta?.exercise_type ??
      (row.is_compound ? 'Compound' : 'Isolation'),
    difficulty:
      (row.difficulty as ExerciseDifficulty | undefined) ??
      fallbackMeta?.difficulty ??
      'Intermediate',
    target_muscle:
      typeof row.target_muscle === 'string' && row.target_muscle
        ? row.target_muscle
        : fallbackMeta?.target_muscle ?? category,
    aliases: Array.isArray(row.aliases)
      ? (row.aliases as string[])
      : fallbackMeta?.aliases ?? [],
    instructions:
      typeof row.instructions === 'string' && row.instructions
        ? row.instructions
        : fallbackMeta?.instructions ?? '',
    common_mistakes:
      typeof row.common_mistakes === 'string' && row.common_mistakes
        ? row.common_mistakes
        : fallbackMeta?.common_mistakes ?? '',
    media_url:
      typeof row.media_url === 'string'
        ? row.media_url
        : fallbackMeta?.media_url ?? null,
    is_compound: Boolean(row.is_compound ?? fallbackMeta?.is_compound),
    is_custom: false,
  };
}

export async function fetchExerciseCatalog(userId: string): Promise<ExerciseItem[]> {
  const masterCatalog = loadMasterCatalogCached();
  const masterByLower = new Map(masterCatalog.map((m) => [m.name.toLowerCase(), m]));
  const localCustoms = loadLocalCustomExercises(userId);

  const client = getSupabaseClient();
  if (!client) {
    return [...localCustoms, ...masterCatalog];
  }

  let pubItems: ExerciseItem[] = [];
  let customItems: ExerciseItem[] = [];

  try {
    const [pubRes, customRes] = await Promise.all([
      client
        .from('exercises')
        .select('*')
        .order('name', { ascending: true })
        .range(0, 999),
      client
        .from('custom_exercises')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true })
        .range(0, 499),
    ]);

    if (!pubRes.error && Array.isArray(pubRes.data)) {
      pubItems = pubRes.data.map((e) => {
        const rec = e as Record<string, unknown>;
        const match = masterByLower.get(String(rec.name ?? '').toLowerCase());
        return mapSupabasePublicExercise(rec, match);
      });
    }

    if (!customRes.error && Array.isArray(customRes.data)) {
      customItems = customRes.data.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category as ExerciseCategory,
        categories: [e.category as ExerciseCategory],
        primary_muscle: e.category,
        secondary_muscles: [],
        equipment: e.equipment,
        exercise_type: 'Compound',
        difficulty: 'Intermediate',
        target_muscle: e.category,
        aliases: [],
        notes: e.notes,
        media_url: null,
        is_custom: true,
      }));
    }
  } catch {
    // Gracefully fall back to local master catalog + custom exercises
  }

  // Merge custom exercises (cloud + local) without duplicates
  const mergedCustomsMap = new Map<string, ExerciseItem>();
  for (const item of [...customItems, ...localCustoms]) {
    const key = item.name.toLowerCase();
    if (!mergedCustomsMap.has(key)) mergedCustomsMap.set(key, item);
  }

  // Merge canonical public exercises: Supabase rows first (preserving real DB UUIDs), then any remaining master entries
  const mergedPublicMap = new Map<string, ExerciseItem>();
  for (const item of pubItems) {
    mergedPublicMap.set(item.name.toLowerCase(), item);
  }
  for (const item of masterCatalog) {
    const key = item.name.toLowerCase();
    if (!mergedPublicMap.has(key)) {
      mergedPublicMap.set(key, item);
    }
  }

  const sortedPublic = Array.from(mergedPublicMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return [...Array.from(mergedCustomsMap.values()), ...sortedPublic];
}

export async function createCustomExercise(
  userId: string,
  payload: { name: string; category: ExerciseCategory; equipment: string; notes?: string }
): Promise<ExerciseItem> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from('custom_exercises')
      .insert({
        user_id: userId,
        name: payload.name.trim(),
        category: payload.category,
        equipment: payload.equipment.trim() || 'Other',
        notes: payload.notes?.trim() ?? '',
      })
      .select('*')
      .single();

    if (!error && data) {
      return {
        id: data.id,
        name: data.name,
        category: data.category as ExerciseCategory,
        categories: [data.category as ExerciseCategory],
        primary_muscle: data.category,
        secondary_muscles: [],
        equipment: data.equipment,
        notes: data.notes,
        media_url: null,
        is_custom: true,
      };
    }

    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  }

  const localItem: ExerciseItem = {
    id: makeLocalId(),
    name: payload.name.trim(),
    category: payload.category,
    categories: [payload.category],
    primary_muscle: payload.category,
    secondary_muscles: [],
    equipment: payload.equipment.trim() || 'Other',
    exercise_type: 'Compound',
    difficulty: 'Intermediate',
    target_muscle: payload.category,
    aliases: [],
    notes: payload.notes?.trim() ?? '',
    media_url: null,
    is_custom: true,
  };
  saveLocalCustomExercise(userId, localItem);
  return localItem;
}

export async function fetchWorkoutPlans(userId: string): Promise<WorkoutPlan[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('workout_plans')
    .select('*, workout_plan_exercises(*)')
    .or(`is_system_template.eq.true,user_id.eq.${userId}`)
    .order('is_system_template', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isSchemaMissingError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as WorkoutPlan[];
}

export async function createCustomWorkoutPlan(
  userId: string,
  payload: {
    name: string;
    split_type: SplitType;
    description: string;
    exercises: Array<{
      exercise_id: string | null;
      custom_exercise_id: string | null;
      exercise_name: string;
      exercise_category: string;
      day_label: string;
      target_sets: number;
      target_reps: string;
      rest_seconds: number;
    }>;
  }
): Promise<WorkoutPlan> {
  const supabase = requireClient();
  const { data: plan, error: planErr } = await supabase
    .from('workout_plans')
    .insert({
      user_id: userId,
      name: payload.name.trim(),
      split_type: payload.split_type,
      description: payload.description.trim(),
      is_system_template: false,
    })
    .select('*')
    .single();

  if (planErr || !plan) throw new Error(planErr?.message ?? 'Failed to create plan');

  if (payload.exercises.length > 0) {
    const rows = payload.exercises.map((ex, idx) => ({
      plan_id: plan.id,
      exercise_id: ex.exercise_id,
      custom_exercise_id: ex.custom_exercise_id,
      exercise_name: ex.exercise_name,
      exercise_category: ex.exercise_category,
      day_label: ex.day_label || 'Workout',
      sort_order: idx + 1,
      target_sets: ex.target_sets,
      target_reps: ex.target_reps,
      rest_seconds: ex.rest_seconds,
    }));
    const { error: exErr } = await supabase.from('workout_plan_exercises').insert(rows);
    if (exErr) throw new Error(exErr.message);
  }

  const { data: fullPlan, error: refetchErr } = await supabase
    .from('workout_plans')
    .select('*, workout_plan_exercises(*)')
    .eq('id', plan.id)
    .single();

  if (refetchErr) throw new Error(refetchErr.message);
  return fullPlan as WorkoutPlan;
}

export async function deleteCustomWorkoutPlan(userId: string, planId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from('workout_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId)
    .eq('is_system_template', false);

  if (error) throw new Error(error.message);
}

function buildLocalSessionRecord(userId: string, payload: SaveWorkoutPayload): WorkoutSessionRecord {
  const sessionId = makeLocalId();
  let totalVolumeKg = 0;
  for (const ex of payload.exercises) {
    for (const s of ex.sets) {
      if (s.is_completed && s.weight_kg >= 0 && s.reps > 0) {
        totalVolumeKg += Number(s.weight_kg) * Number(s.reps);
      }
    }
  }
  totalVolumeKg = Math.round(totalVolumeKg * 100) / 100;

  return {
    id: sessionId,
    user_id: userId,
    client_request_id: payload.client_request_id,
    plan_id: payload.plan_id,
    workout_name: payload.workout_name.trim() || 'Training Session',
    workout_date: payload.workout_date,
    started_at: payload.started_at,
    ended_at: payload.ended_at,
    duration_seconds: Math.max(0, Math.round(payload.duration_seconds)),
    total_volume_kg: totalVolumeKg,
    session_notes: payload.session_notes.trim(),
    status: 'completed',
    created_at: new Date().toISOString(),
    workout_session_exercises: payload.exercises.map((ex, idx) => {
      const seId = makeLocalId();
      return {
        id: seId,
        user_id: userId,
        session_id: sessionId,
        exercise_id: ex.exercise_id,
        custom_exercise_id: ex.custom_exercise_id,
        exercise_name: ex.exercise_name,
        exercise_category: ex.exercise_category,
        sort_order: idx + 1,
        rest_seconds: ex.rest_seconds,
        exercise_notes: ex.exercise_notes.trim(),
        superset_group: ex.superset_group ?? null,
        workout_sets: ex.sets.map((s, sIdx) => ({
          id: makeLocalId(),
          user_id: userId,
          session_exercise_id: seId,
          set_number: sIdx + 1,
          weight_kg: Number(s.weight_kg) || 0,
          reps: Math.max(0, Math.round(Number(s.reps) || 0)),
          is_completed: Boolean(s.is_completed),
          rest_seconds: s.rest_seconds || ex.rest_seconds || 90,
          set_type: s.set_type ?? 'normal',
          rpe: typeof s.rpe === 'number' ? s.rpe : null,
        })),
      };
    }),
  };
}

/**
 * Saves a completed workout session to Supabase PostgreSQL idempotently using client_request_id.
 * Falls back to local device persistence only when Supabase tables have not been created yet.
 */
export async function saveWorkoutSession(
  userId: string,
  payload: SaveWorkoutPayload
): Promise<WorkoutSessionRecord> {
  const supabase = requireClient();

  // Always persist Phase 1 rich metadata locally so superset_group, set_type & RPE survive even before SQL migration runs
  savePhase1SessionMeta(userId, payload.client_request_id, payload.exercises);

  // Check if already persisted from an earlier retry with the same client_request_id
  const { data: existing, error: lookupErr } = await supabase
    .from('workout_sessions')
    .select('*, workout_session_exercises(*, workout_sets(*))')
    .eq('user_id', userId)
    .eq('client_request_id', payload.client_request_id)
    .maybeSingle();

  if (lookupErr) {
    if (isSchemaMissingError(lookupErr)) {
      const existingLocals = loadLocalWorkoutSessions(userId);
      const dup = existingLocals.find(
        (s) => s.client_request_id === payload.client_request_id
      );
      if (dup) return dup;
      const localRecord = buildLocalSessionRecord(userId, payload);
      saveLocalWorkoutSessions(userId, [localRecord, ...existingLocals]);
      return localRecord;
    }
    throw new Error(lookupErr.message);
  }
  if (existing) {
    return enrichSessionsWithPhase1Meta(userId, [existing as WorkoutSessionRecord])[0];
  }

  let totalVolumeKg = 0;
  for (const ex of payload.exercises) {
    for (const s of ex.sets) {
      if (s.is_completed && s.weight_kg >= 0 && s.reps > 0) {
        totalVolumeKg += Number(s.weight_kg) * Number(s.reps);
      }
    }
  }
  totalVolumeKg = Math.round(totalVolumeKg * 100) / 100;

  const { data: session, error: sessionErr } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: userId,
      client_request_id: payload.client_request_id,
      plan_id: payload.plan_id,
      workout_name: payload.workout_name.trim() || 'Training Session',
      workout_date: payload.workout_date,
      started_at: payload.started_at,
      ended_at: payload.ended_at,
      duration_seconds: Math.max(0, Math.round(payload.duration_seconds)),
      total_volume_kg: totalVolumeKg,
      session_notes: payload.session_notes.trim(),
      status: 'completed',
    })
    .select('*')
    .single();

  if (sessionErr || !session) {
    throw new Error(sessionErr?.message ?? 'Failed to create workout session in cloud.');
  }

  for (let i = 0; i < payload.exercises.length; i++) {
    const ex = payload.exercises[i];
    const validDbExerciseId =
      ex.exercise_id && !ex.exercise_id.startsWith('a0000000-') ? ex.exercise_id : null;

    const baseExerciseRow = {
      user_id: userId,
      session_id: session.id,
      exercise_id: validDbExerciseId,
      custom_exercise_id: ex.custom_exercise_id,
      exercise_name: ex.exercise_name,
      exercise_category: ex.exercise_category,
      sort_order: i + 1,
      rest_seconds: ex.rest_seconds,
      exercise_notes: ex.exercise_notes.trim(),
    };

    let { data: exRow, error: exErr } = await supabase
      .from('workout_session_exercises')
      .insert({
        ...baseExerciseRow,
        superset_group: ex.superset_group ?? null,
      })
      .select('*')
      .single();

    if (exErr && isColumnMissingError(exErr)) {
      const retry = await supabase
        .from('workout_session_exercises')
        .insert(baseExerciseRow)
        .select('*')
        .single();
      exRow = retry.data;
      exErr = retry.error;
    }

    if (exErr || !exRow) {
      throw new Error(exErr?.message ?? `Failed to save exercise ${ex.exercise_name}`);
    }

    if (ex.sets.length > 0) {
      const baseSets = ex.sets.map((s, idx) => ({
        user_id: userId,
        session_exercise_id: exRow.id,
        set_number: idx + 1,
        weight_kg: Number(s.weight_kg) || 0,
        reps: Math.max(0, Math.round(Number(s.reps) || 0)),
        is_completed: Boolean(s.is_completed),
        rest_seconds: s.rest_seconds || ex.rest_seconds || 90,
      }));

      const richSets = baseSets.map((row, idx) => ({
        ...row,
        set_type: ex.sets[idx].set_type ?? 'normal',
        rpe: typeof ex.sets[idx].rpe === 'number' ? ex.sets[idx].rpe : null,
      }));

      let { error: setsErr } = await supabase.from('workout_sets').insert(richSets);
      if (setsErr && isColumnMissingError(setsErr)) {
        const retrySets = await supabase.from('workout_sets').insert(baseSets);
        setsErr = retrySets.error;
      }
      if (setsErr) {
        throw new Error(setsErr.message);
      }
    }
  }

  const { data: verified, error: verifyErr } = await supabase
    .from('workout_sessions')
    .select('*, workout_session_exercises(*, workout_sets(*))')
    .eq('id', session.id)
    .single();

  if (verifyErr || !verified) {
    throw new Error(verifyErr?.message ?? 'Cloud write verification failed.');
  }

  return enrichSessionsWithPhase1Meta(userId, [verified as WorkoutSessionRecord])[0];
}

export async function fetchWorkoutSessions(
  userId: string,
  options?: { limit?: number; fromDate?: string; toDate?: string }
): Promise<WorkoutSessionRecord[]> {
  const supabase = requireClient();
  let query = supabase
    .from('workout_sessions')
    .select('*, workout_session_exercises(*, workout_sets(*))')
    .eq('user_id', userId)
    .order('workout_date', { ascending: false })
    .order('started_at', { ascending: false });

  if (options?.fromDate) query = query.gte('workout_date', options.fromDate);
  if (options?.toDate) query = query.lte('workout_date', options.toDate);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    if (isSchemaMissingError(error)) {
      let locals = loadLocalWorkoutSessions(userId);
      if (options?.fromDate) locals = locals.filter((s) => s.workout_date >= options.fromDate!);
      if (options?.toDate) locals = locals.filter((s) => s.workout_date <= options.toDate!);
      locals.sort((a, b) => b.started_at.localeCompare(a.started_at));
      return options?.limit ? locals.slice(0, options.limit) : locals;
    }
    throw new Error(error.message);
  }

  const sessions = enrichSessionsWithPhase1Meta(
    userId,
    (data ?? []) as WorkoutSessionRecord[]
  );
  return sessions;
}

export async function fetchWorkoutSessionById(
  userId: string,
  sessionId: string
): Promise<WorkoutSessionRecord | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workout_session_exercises(*, workout_sets(*))')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    if (isSchemaMissingError(error)) {
      const found = loadLocalWorkoutSessions(userId).find((s) => s.id === sessionId) ?? null;
      return found ? enrichSessionsWithPhase1Meta(userId, [found])[0] : null;
    }
    throw new Error(error.message);
  }
  if (!data) {
    const found = loadLocalWorkoutSessions(userId).find((s) => s.id === sessionId) ?? null;
    return found ? enrichSessionsWithPhase1Meta(userId, [found])[0] : null;
  }
  return enrichSessionsWithPhase1Meta(userId, [data as WorkoutSessionRecord])[0];
}

export async function updateWorkoutSessionNotesAndSets(
  userId: string,
  sessionId: string,
  workoutName: string,
  sessionNotes: string,
  updatedSets: Array<{ id: string; weight_kg: number; reps: number; is_completed: boolean }>
): Promise<WorkoutSessionRecord> {
  const localMatch = loadLocalWorkoutSessions(userId).find((s) => s.id === sessionId);
  if (localMatch) {
    const patchMap = new Map(updatedSets.map((s) => [s.id, s]));
    let totalVol = 0;
    const nextExercises = (localMatch.workout_session_exercises ?? []).map((ex) => ({
      ...ex,
      workout_sets: (ex.workout_sets ?? []).map((s) => {
        const p = patchMap.get(s.id);
        const updated = p ? { ...s, ...p } : s;
        if (updated.is_completed) totalVol += updated.weight_kg * updated.reps;
        return updated;
      }),
    }));
    const updatedSession: WorkoutSessionRecord = {
      ...localMatch,
      workout_name: workoutName.trim(),
      session_notes: sessionNotes.trim(),
      total_volume_kg: Math.round(totalVol * 100) / 100,
      workout_session_exercises: nextExercises,
    };
    const nextAll = loadLocalWorkoutSessions(userId).map((s) =>
      s.id === sessionId ? updatedSession : s
    );
    saveLocalWorkoutSessions(userId, nextAll);
    return updatedSession;
  }

  const supabase = requireClient();

  for (const s of updatedSets) {
    const { error } = await supabase
      .from('workout_sets')
      .update({
        weight_kg: Number(s.weight_kg) || 0,
        reps: Math.max(0, Math.round(Number(s.reps) || 0)),
        is_completed: s.is_completed,
      })
      .eq('id', s.id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  const totalVolumeKg =
    Math.round(
      updatedSets.reduce(
        (sum, s) => (s.is_completed ? sum + Number(s.weight_kg) * Number(s.reps) : sum),
        0
      ) * 100
    ) / 100;

  const { error: sessErr } = await supabase
    .from('workout_sessions')
    .update({
      workout_name: workoutName.trim(),
      session_notes: sessionNotes.trim(),
      total_volume_kg: totalVolumeKg,
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (sessErr) throw new Error(sessErr.message);

  const refreshed = await fetchWorkoutSessionById(userId, sessionId);
  if (!refreshed) throw new Error('Could not reload updated workout session.');
  return refreshed;
}

export async function deleteWorkoutSession(userId: string, sessionId: string): Promise<void> {
  const locals = loadLocalWorkoutSessions(userId);
  if (locals.some((s) => s.id === sessionId)) {
    saveLocalWorkoutSessions(
      userId,
      locals.filter((s) => s.id !== sessionId)
    );
  }

  const supabase = requireClient();
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error && !isSchemaMissingError(error)) throw new Error(error.message);
}

/**
 * Fetches the user's most recent completed performance for a given exercise name,
 * enabling automatic "Previous: 70 KG x 6 reps" display and progressive overload deltas.
 */
export async function fetchPreviousExercisePerformance(
  userId: string,
  exerciseName: string
): Promise<PreviousExercisePerformance | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('workout_session_exercises')
    .select(
      `
      id,
      exercise_name,
      workout_sessions!inner(id, workout_date, started_at, user_id, status),
      workout_sets(set_number, weight_kg, reps, is_completed)
    `
    )
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .eq('workout_sessions.status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    if (isSchemaMissingError(error)) {
      const locals = loadLocalWorkoutSessions(userId).sort((a, b) =>
        b.started_at.localeCompare(a.started_at)
      );
      for (const s of locals) {
        const matchEx = (s.workout_session_exercises ?? []).find(
          (e) => e.exercise_name === exerciseName
        );
        if (!matchEx) continue;
        const completed = (matchEx.workout_sets ?? []).filter(
          (st) => st.is_completed && st.reps > 0
        );
        if (completed.length === 0) continue;
        let best = completed[0];
        let totalVol = 0;
        for (const st of completed) {
          totalVol += st.weight_kg * st.reps;
          if (st.weight_kg > best.weight_kg || (st.weight_kg === best.weight_kg && st.reps > best.reps)) {
            best = st;
          }
        }
        return {
          exerciseName,
          lastDate: s.workout_date,
          bestSet: { weight_kg: best.weight_kg, reps: best.reps },
          sets: completed.map((st) => ({
            set_number: st.set_number,
            weight_kg: st.weight_kg,
            reps: st.reps,
          })),
          totalVolumeKg: Math.round(totalVol * 100) / 100,
        };
      }
      return null;
    }
    throw new Error(error.message);
  }
  if (!data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => {
    const sessA = (a as unknown as { workout_sessions: { workout_date: string; started_at: string } }).workout_sessions;
    const sessB = (b as unknown as { workout_sessions: { workout_date: string; started_at: string } }).workout_sessions;
    return sessB.started_at.localeCompare(sessA.started_at);
  });

  const latest = sorted[0] as unknown as {
    exercise_name: string;
    workout_sessions: { workout_date: string };
    workout_sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>;
  };

  const completedSets = (latest.workout_sets ?? [])
    .filter((s) => s.is_completed && s.reps > 0)
    .sort((a, b) => a.set_number - b.set_number);

  if (completedSets.length === 0) return null;

  let bestSet = completedSets[0];
  let totalVolumeKg = 0;
  for (const s of completedSets) {
    totalVolumeKg += Number(s.weight_kg) * Number(s.reps);
    if (
      Number(s.weight_kg) > Number(bestSet.weight_kg) ||
      (Number(s.weight_kg) === Number(bestSet.weight_kg) && s.reps > bestSet.reps)
    ) {
      bestSet = s;
    }
  }

  return {
    exerciseName: latest.exercise_name,
    lastDate: latest.workout_sessions.workout_date,
    bestSet: { weight_kg: Number(bestSet.weight_kg), reps: Number(bestSet.reps) },
    sets: completedSets.map((s) => ({
      set_number: s.set_number,
      weight_kg: Number(s.weight_kg),
      reps: Number(s.reps),
    })),
    totalVolumeKg: Math.round(totalVolumeKg * 100) / 100,
  };
}

export interface ExerciseHistoryEntry {
  sessionId: string;
  workoutDate: string;
  workoutName: string;
  notes: string;
  sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>;
  maxWeightKg: number;
  totalVolumeKg: number;
  estimated1RMKg: number;
}

export async function fetchExerciseLifetimeHistory(
  userId: string,
  exerciseName: string
): Promise<ExerciseHistoryEntry[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('workout_session_exercises')
    .select(
      `
      id,
      exercise_notes,
      workout_sessions!inner(id, workout_date, workout_name, started_at, status),
      workout_sets(set_number, weight_kg, reps, is_completed)
    `
    )
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .eq('workout_sessions.status', 'completed');

  if (error) {
    if (isSchemaMissingError(error)) {
      const locals = loadLocalWorkoutSessions(userId);
      const out: ExerciseHistoryEntry[] = [];
      for (const s of locals) {
        const matchEx = (s.workout_session_exercises ?? []).find(
          (e) => e.exercise_name === exerciseName
        );
        if (!matchEx) continue;
        const sets = [...(matchEx.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number);
        let maxWeightKg = 0;
        let totalVolumeKg = 0;
        let best1RM = 0;
        for (const st of sets) {
          if (!st.is_completed) continue;
          if (st.weight_kg > maxWeightKg) maxWeightKg = st.weight_kg;
          totalVolumeKg += st.weight_kg * st.reps;
          const epley = st.reps === 1 ? st.weight_kg : st.weight_kg * (1 + st.reps / 30);
          if (epley > best1RM) best1RM = epley;
        }
        out.push({
          sessionId: s.id,
          workoutDate: s.workout_date,
          workoutName: s.workout_name,
          notes: matchEx.exercise_notes || '',
          sets,
          maxWeightKg: Math.round(maxWeightKg * 10) / 10,
          totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
          estimated1RMKg: Math.round(best1RM * 10) / 10,
        });
      }
      return out.sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
    }
    throw new Error(error.message);
  }

  const entries: ExerciseHistoryEntry[] = (data ?? []).map((row) => {
    const typed = row as unknown as {
      exercise_notes: string;
      workout_sessions: { id: string; workout_date: string; workout_name: string; started_at: string };
      workout_sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>;
    };
    const sets = [...(typed.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number);
    let maxWeightKg = 0;
    let totalVolumeKg = 0;
    let best1RM = 0;

    for (const s of sets) {
      if (!s.is_completed) continue;
      const w = Number(s.weight_kg) || 0;
      const r = Number(s.reps) || 0;
      if (w > maxWeightKg) maxWeightKg = w;
      totalVolumeKg += w * r;
      const epley = r === 1 ? w : w * (1 + r / 30);
      if (epley > best1RM) best1RM = epley;
    }

    return {
      sessionId: typed.workout_sessions.id,
      workoutDate: typed.workout_sessions.workout_date,
      workoutName: typed.workout_sessions.workout_name,
      notes: typed.exercise_notes || '',
      sets,
      maxWeightKg: Math.round(maxWeightKg * 10) / 10,
      totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
      estimated1RMKg: Math.round(best1RM * 10) / 10,
    };
  });

  return entries.sort((a, b) => b.workoutDate.localeCompare(a.workoutDate));
}

export async function fetchAllTimeExercisePRs(
  userId: string,
  excludeClientRequestId?: string
): Promise<Record<string, ExercisePRBaseline>> {
  try {
    const sessions = await fetchWorkoutSessions(userId, { limit: 400 });
    return computeBaselinesFromSessions(sessions, excludeClientRequestId);
  } catch (err) {
    if (isSchemaMissingError(err)) {
      const locals = loadLocalWorkoutSessions(userId);
      return computeBaselinesFromSessions(locals, excludeClientRequestId);
    }
    return {};
  }
}
