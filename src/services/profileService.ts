import { getSupabaseClient, isSchemaMissingError } from '../lib/supabase';
import type {
  NutritionGoals,
  Profile,
  UserReminder,
  UserSettings,
  UserWidget,
} from '../types/database';

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Connect your Supabase project first.');
  }
  return client;
}

export const DEFAULT_WIDGETS: Array<{ widget_key: string; title: string; sort_order: number }> = [
  { widget_key: 'quick_actions', title: 'Quick Actions', sort_order: 1 },
  { widget_key: 'calories_macros', title: 'Daily Calories & Macros', sort_order: 2 },
  { widget_key: 'body_weight', 'title': 'Weight & Goal', sort_order: 3 },
  { widget_key: 'hydration', title: 'Water Intake', sort_order: 4 },
  { widget_key: 'today_workout', title: "Today's Workout", sort_order: 5 },
  { widget_key: 'weekly_streak', title: 'Weekly Streak & Activity', sort_order: 6 },
  { widget_key: 'recent_workouts', title: 'Recent Workout History', sort_order: 7 },
];

export async function fetchUserProfile(userId: string): Promise<Profile | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function upsertUserProfile(
  userId: string,
  updates: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
): Promise<Profile> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates }, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function fetchUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserSettings | null;
}

export async function updateUserSettings(
  userId: string,
  updates: Partial<Omit<UserSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<UserSettings> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as UserSettings;
}

const LOCAL_GOALS_KEY = (userId: string) => `gympaglu_nutrition_goals_v1_${userId}`;

function readLocalNutritionGoals(userId: string): NutritionGoals | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_GOALS_KEY(userId));
    if (!raw) return null;
    return JSON.parse(raw) as NutritionGoals;
  } catch {
    return null;
  }
}

function writeLocalNutritionGoals(userId: string, goals: NutritionGoals): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(LOCAL_GOALS_KEY(userId), JSON.stringify(goals));
  } catch {
    // Ignore
  }
}

export async function fetchNutritionGoals(userId: string): Promise<NutritionGoals | null> {
  const local = readLocalNutritionGoals(userId);
  const client = getSupabaseClient();
  if (!client) return local;

  const { data, error } = await client
    .from('nutrition_goals')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (local) return local;
    throw new Error(error.message);
  }
  if (data) {
    const goals = data as NutritionGoals;
    writeLocalNutritionGoals(userId, goals);
    return goals;
  }
  return local;
}

export async function updateNutritionGoals(
  userId: string,
  updates: Partial<Omit<NutritionGoals, 'id' | 'user_id'>>
): Promise<NutritionGoals> {
  const prev = readLocalNutritionGoals(userId) ?? {
    id: `local-goals-${userId}`,
    user_id: userId,
    calories_target: 2400,
    protein_target_g: 160,
    carbs_target_g: 260,
    fat_target_g: 70,
    fibre_target_g: 32,
    water_target_ml: 3500,
  };
  const nextLocal: NutritionGoals = { ...prev, ...updates, user_id: userId };
  writeLocalNutritionGoals(userId, nextLocal);

  const client = getSupabaseClient();
  if (!client) return nextLocal;

  const { data, error } = await client
    .from('nutrition_goals')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    if (isSchemaMissingError(error)) return nextLocal;
    throw new Error(error.message);
  }
  const saved = data as NutritionGoals;
  writeLocalNutritionGoals(userId, saved);
  return saved;
}

export async function fetchUserWidgets(userId: string): Promise<UserWidget[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_widgets')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    const seed = DEFAULT_WIDGETS.map((w) => ({
      user_id: userId,
      widget_key: w.widget_key,
      title: w.title,
      is_visible: true,
      sort_order: w.sort_order,
    }));
    const { data: inserted, error: insertErr } = await supabase
      .from('user_widgets')
      .upsert(seed, { onConflict: 'user_id,widget_key' })
      .select('*')
      .order('sort_order', { ascending: true });
    if (insertErr) throw new Error(insertErr.message);
    return (inserted ?? []) as UserWidget[];
  }

  return data as UserWidget[];
}

export async function saveUserWidgets(
  userId: string,
  widgets: Array<{ widget_key: string; title: string; is_visible: boolean; sort_order: number }>
): Promise<UserWidget[]> {
  const supabase = requireClient();
  const payload = widgets.map((w, idx) => ({
    user_id: userId,
    widget_key: w.widget_key,
    title: w.title,
    is_visible: w.is_visible,
    sort_order: idx + 1,
  }));

  const { data, error } = await supabase
    .from('user_widgets')
    .upsert(payload, { onConflict: 'user_id,widget_key' })
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as UserWidget[];
}

export async function ensureUserAccountRecords(
  userId: string,
  email: string,
  fullName = ''
): Promise<void> {
  const supabase = requireClient();

  await Promise.all([
    supabase
      .from('profiles')
      .upsert({ id: userId, email, full_name: fullName }, { onConflict: 'id', ignoreDuplicates: true }),
    supabase
      .from('user_settings')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }),
    supabase
      .from('nutrition_goals')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }),
  ]);
}

export async function fetchUserReminders(userId: string): Promise<UserReminder[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_reminders')
    .select('*')
    .eq('user_id', userId)
    .order('schedule_time', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as UserReminder[];
}

export async function createUserReminder(
  userId: string,
  reminder: Omit<UserReminder, 'id' | 'user_id'>
): Promise<UserReminder> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_reminders')
    .insert({ user_id: userId, ...reminder })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as UserReminder;
}

export async function updateUserReminder(
  userId: string,
  id: string,
  updates: Partial<Omit<UserReminder, 'id' | 'user_id'>>
): Promise<UserReminder> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('user_reminders')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as UserReminder;
}

export async function deleteUserReminder(userId: string, id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from('user_reminders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
