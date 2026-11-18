import { MASTER_FOOD_CATALOG } from '../data/masterFoodCatalog';
import { getDefaultWeeklyRatePct } from '../lib/adaptiveNutrition';
import { getSupabaseClient, isSchemaMissingError } from '../lib/supabase';
import type {
  FitnessGoal,
  FoodCategory,
  FoodItem,
  FoodLogRecord,
  MealCategory,
  NutritionCheckinRecord,
  NutritionCoachPrefs,
  SavedMeal,
  WaterLogRecord,
} from '../types/database';

const LOCAL_CUSTOM_FOODS_KEY = (userId: string) => `gympaglu_custom_foods_v1_${userId}`;
const LOCAL_FOOD_LOGS_KEY = (userId: string) => `gympaglu_food_logs_v1_${userId}`;
const LOCAL_WATER_LOGS_KEY = (userId: string) => `gympaglu_water_logs_v1_${userId}`;
const LOCAL_SAVED_MEALS_KEY = (userId: string) => `gympaglu_saved_meals_v1_${userId}`;
const LOCAL_COACH_PREFS_KEY = (userId: string) => `gympaglu_coach_prefs_v1_${userId}`;
const LOCAL_CHECKINS_KEY = (userId: string) => `gympaglu_nutrition_checkins_v1_${userId}`;

function getClientOrNull() {
  return getSupabaseClient();
}

function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readLocalArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalArray<T>(key: string, rows: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Ignore storage quota errors
  }
}

function readLocalObject<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalObject<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore
  }
}

function mergeFoodCatalog(remotePub: FoodItem[], remoteCustom: FoodItem[], localCustom: FoodItem[]): FoodItem[] {
  const aliasMap = new Map<string, string[]>();
  for (const m of MASTER_FOOD_CATALOG) {
    if (m.aliases?.length) aliasMap.set(m.name.toLowerCase(), m.aliases);
  }

  const customSeen = new Map<string, FoodItem>();
  for (const c of [...remoteCustom, ...localCustom]) {
    const key = c.name.toLowerCase();
    if (!customSeen.has(key)) customSeen.set(key, c);
  }

  const pubSeen = new Map<string, FoodItem>();
  for (const f of remotePub) {
    const key = f.name.toLowerCase();
    pubSeen.set(key, {
      ...f,
      aliases: f.aliases ?? aliasMap.get(key),
    });
  }
  for (const m of MASTER_FOOD_CATALOG) {
    const key = m.name.toLowerCase();
    if (!pubSeen.has(key)) {
      pubSeen.set(key, m);
    }
  }

  return [
    ...Array.from(customSeen.values()).sort((a, b) => a.name.localeCompare(b.name)),
    ...Array.from(pubSeen.values()).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export async function fetchFoodCatalog(userId: string): Promise<FoodItem[]> {
  const localCustom = readLocalArray<FoodItem>(LOCAL_CUSTOM_FOODS_KEY(userId));
  const supabase = getClientOrNull();
  if (!supabase) {
    return mergeFoodCatalog([], [], localCustom);
  }

  try {
    const [pubRes, customRes] = await Promise.all([
      supabase.from('foods').select('*').order('name', { ascending: true }),
      supabase
        .from('custom_foods')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true }),
    ]);

    if (pubRes.error) throw new Error(pubRes.error.message);
    if (customRes.error) throw new Error(customRes.error.message);

    const pubFoods: FoodItem[] = (pubRes.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category as FoodCategory,
      serving_size: Number(f.serving_size),
      serving_unit: f.serving_unit,
      calories: Number(f.calories),
      protein_g: Number(f.protein_g),
      carbs_g: Number(f.carbs_g),
      fat_g: Number(f.fat_g),
      fibre_g: Number(f.fibre_g),
      is_custom: false,
    }));

    const customFoods: FoodItem[] = (customRes.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category as FoodCategory,
      serving_size: Number(f.serving_size),
      serving_unit: f.serving_unit,
      calories: Number(f.calories),
      protein_g: Number(f.protein_g),
      carbs_g: Number(f.carbs_g),
      fat_g: Number(f.fat_g),
      fibre_g: Number(f.fibre_g),
      is_custom: true,
      is_favorite: f.is_favorite,
    }));

    if (customFoods.length > 0) {
      writeLocalArray(LOCAL_CUSTOM_FOODS_KEY(userId), customFoods);
    }

    return mergeFoodCatalog(pubFoods, customFoods, localCustom);
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return mergeFoodCatalog([], [], localCustom);
    }
    // Fallback to bundled catalog on network errors too, while surfacing if needed
    return mergeFoodCatalog([], [], localCustom);
  }
}

export async function createCustomFood(
  userId: string,
  food: Omit<FoodItem, 'id' | 'is_custom'>
): Promise<FoodItem> {
  const localItem: FoodItem = {
    id: makeLocalId(),
    name: food.name.trim(),
    category: food.category,
    serving_size: food.serving_size,
    serving_unit: food.serving_unit.trim() || 'serving',
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g,
    fibre_g: food.fibre_g,
    is_custom: true,
    is_favorite: Boolean(food.is_favorite),
  };

  const supabase = getClientOrNull();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('custom_foods')
        .insert({
          user_id: userId,
          name: localItem.name,
          category: localItem.category,
          serving_size: localItem.serving_size,
          serving_unit: localItem.serving_unit,
          calories: localItem.calories,
          protein_g: localItem.protein_g,
          carbs_g: localItem.carbs_g,
          fat_g: localItem.fat_g,
          fibre_g: localItem.fibre_g,
          is_favorite: Boolean(localItem.is_favorite),
        })
        .select('*')
        .single();

      if (!error && data) {
        const saved: FoodItem = {
          id: data.id,
          name: data.name,
          category: data.category as FoodCategory,
          serving_size: Number(data.serving_size),
          serving_unit: data.serving_unit,
          calories: Number(data.calories),
          protein_g: Number(data.protein_g),
          carbs_g: Number(data.carbs_g),
          fat_g: Number(data.fat_g),
          fibre_g: Number(data.fibre_g),
          is_custom: true,
          is_favorite: data.is_favorite,
        };
        const existing = readLocalArray<FoodItem>(LOCAL_CUSTOM_FOODS_KEY(userId)).filter(
          (f) => f.id !== saved.id && f.name.toLowerCase() !== saved.name.toLowerCase()
        );
        writeLocalArray(LOCAL_CUSTOM_FOODS_KEY(userId), [saved, ...existing]);
        return saved;
      }
      if (error && !isSchemaMissingError(error)) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err;
    }
  }

  const existing = readLocalArray<FoodItem>(LOCAL_CUSTOM_FOODS_KEY(userId));
  writeLocalArray(LOCAL_CUSTOM_FOODS_KEY(userId), [localItem, ...existing]);
  return localItem;
}

export async function fetchFoodLogsByDate(
  userId: string,
  loggedDate: string
): Promise<FoodLogRecord[]> {
  const all = await fetchFoodLogsRange(userId, loggedDate, loggedDate);
  return all.filter((l) => l.logged_date === loggedDate);
}

export async function fetchFoodLogsRange(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<FoodLogRecord[]> {
  const localAll = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId));
  const localRange = localAll.filter(
    (l) => l.logged_date >= fromDate && l.logged_date <= toDate
  );

  const supabase = getClientOrNull();
  if (!supabase) {
    return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  }

  try {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_date', fromDate)
      .lte('logged_date', toDate)
      .order('logged_at', { ascending: true });

    if (error) {
      if (isSchemaMissingError(error)) {
        return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
      }
      throw new Error(error.message);
    }

    const remote = (data ?? []) as FoodLogRecord[];
    // Merge remote rows into local store for offline durability
    const remoteIds = new Set(remote.map((r) => r.id));
    const localOnlyOutsideOrUnsynced = localAll.filter(
      (l) => l.logged_date < fromDate || l.logged_date > toDate || (l.id.startsWith('loc-') && !remoteIds.has(l.id))
    );
    writeLocalArray(LOCAL_FOOD_LOGS_KEY(userId), [...remote, ...localOnlyOutsideOrUnsynced]);

    const merged = [
      ...remote,
      ...localRange.filter((l) => l.id.startsWith('loc-') && !remoteIds.has(l.id)),
    ];
    return merged.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    }
    throw err;
  }
}

export async function fetchFavoriteFoodLogs(userId: string): Promise<FoodLogRecord[]> {
  const localFavs = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId))
    .filter((l) => l.is_favorite)
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
    .slice(0, 20);

  const supabase = getClientOrNull();
  if (!supabase) return localFavs;

  try {
    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_favorite', true)
      .order('logged_at', { ascending: false })
      .limit(20);

    if (error) {
      if (isSchemaMissingError(error)) return localFavs;
      throw new Error(error.message);
    }
    const remote = (data ?? []) as FoodLogRecord[];
    return remote.length > 0 ? remote : localFavs;
  } catch (err) {
    if (isSchemaMissingError(err)) return localFavs;
    throw err;
  }
}

function isUuidLike(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function addFoodLog(
  userId: string,
  entry: Omit<FoodLogRecord, 'id' | 'user_id' | 'logged_at'>
): Promise<FoodLogRecord> {
  const nowIso = new Date().toISOString();
  const payload: FoodLogRecord = {
    id: makeLocalId(),
    user_id: userId,
    food_id: isUuidLike(entry.food_id) ? entry.food_id : null,
    custom_food_id: isUuidLike(entry.custom_food_id) ? entry.custom_food_id : null,
    food_name: entry.food_name.trim(),
    quantity: entry.quantity,
    serving_unit: entry.serving_unit,
    calories: Math.round(entry.calories * 10) / 10,
    protein_g: Math.round(entry.protein_g * 10) / 10,
    carbs_g: Math.round(entry.carbs_g * 10) / 10,
    fat_g: Math.round(entry.fat_g * 10) / 10,
    fibre_g: Math.round(entry.fibre_g * 10) / 10,
    meal_category: entry.meal_category,
    logged_date: entry.logged_date,
    logged_at: nowIso,
    is_favorite: entry.is_favorite,
  };

  const supabase = getClientOrNull();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('food_logs')
        .insert({
          user_id: userId,
          food_id: payload.food_id,
          custom_food_id: payload.custom_food_id,
          food_name: payload.food_name,
          quantity: payload.quantity,
          serving_unit: payload.serving_unit,
          calories: payload.calories,
          protein_g: payload.protein_g,
          carbs_g: payload.carbs_g,
          fat_g: payload.fat_g,
          fibre_g: payload.fibre_g,
          meal_category: payload.meal_category,
          logged_date: payload.logged_date,
          logged_at: nowIso,
          is_favorite: payload.is_favorite,
        })
        .select('*')
        .single();

      if (!error && data) {
        const saved = data as FoodLogRecord;
        const existing = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId));
        writeLocalArray(LOCAL_FOOD_LOGS_KEY(userId), [...existing, saved]);
        return saved;
      }
      if (error && !isSchemaMissingError(error)) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err;
    }
  }

  const localPayload: FoodLogRecord = { ...payload, id: `loc-${Date.now()}-${Math.random().toString(16).slice(2, 7)}` };
  const existing = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId));
  writeLocalArray(LOCAL_FOOD_LOGS_KEY(userId), [...existing, localPayload]);
  return localPayload;
}

export async function copyMealFromDate(
  userId: string,
  sourceDate: string,
  targetDate: string,
  mealCategory: MealCategory
): Promise<FoodLogRecord[]> {
  const sourceLogs = await fetchFoodLogsByDate(userId, sourceDate);
  const matching = sourceLogs.filter((l) => l.meal_category === mealCategory);
  if (matching.length === 0) return [];

  const created = await Promise.all(
    matching.map((item) =>
      addFoodLog(userId, {
        food_id: item.food_id,
        custom_food_id: item.custom_food_id,
        food_name: item.food_name,
        quantity: item.quantity,
        serving_unit: item.serving_unit,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fibre_g: item.fibre_g,
        meal_category: mealCategory,
        logged_date: targetDate,
        is_favorite: item.is_favorite,
      })
    )
  );
  return created;
}

export async function updateFoodLog(
  userId: string,
  id: string,
  updates: Partial<
    Pick<
      FoodLogRecord,
      'quantity' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'meal_category' | 'is_favorite'
    >
  >
): Promise<FoodLogRecord> {
  const localAll = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId));
  const updateLocal = (record?: FoodLogRecord) => {
    const next = localAll.map((item) =>
      item.id === id ? record ?? { ...item, ...updates } : item
    );
    writeLocalArray(LOCAL_FOOD_LOGS_KEY(userId), next);
    return record ?? next.find((item) => item.id === id)!;
  };

  const supabase = getClientOrNull();
  if (supabase && !id.startsWith('loc-')) {
    try {
      const { data, error } = await supabase
        .from('food_logs')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (!error && data) {
        return updateLocal(data as FoodLogRecord);
      }
      if (error && !isSchemaMissingError(error)) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err;
    }
  }

  return updateLocal();
}

export async function deleteFoodLog(userId: string, id: string): Promise<void> {
  const localAll = readLocalArray<FoodLogRecord>(LOCAL_FOOD_LOGS_KEY(userId));
  writeLocalArray(
    LOCAL_FOOD_LOGS_KEY(userId),
    localAll.filter((l) => l.id !== id)
  );

  const supabase = getClientOrNull();
  if (!supabase || id.startsWith('loc-')) return;

  try {
    const { error } = await supabase
      .from('food_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }
}

export async function fetchSavedMeals(userId: string): Promise<SavedMeal[]> {
  const localMeals = readLocalArray<SavedMeal>(LOCAL_SAVED_MEALS_KEY(userId));
  const supabase = getClientOrNull();
  if (!supabase) return localMeals;

  try {
    const { data, error } = await supabase
      .from('saved_meals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isSchemaMissingError(error)) return localMeals;
      throw new Error(error.message);
    }
    const remote = (data ?? []) as SavedMeal[];
    if (remote.length > 0) writeLocalArray(LOCAL_SAVED_MEALS_KEY(userId), remote);
    return remote.length > 0 ? remote : localMeals;
  } catch (err) {
    if (isSchemaMissingError(err)) return localMeals;
    throw err;
  }
}

export async function createSavedMeal(
  userId: string,
  name: string,
  mealCategory: MealCategory,
  items: SavedMeal['items']
): Promise<SavedMeal> {
  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein_g: acc.protein_g + item.protein_g,
      carbs_g: acc.carbs_g + item.carbs_g,
      fat_g: acc.fat_g + item.fat_g,
      fibre_g: acc.fibre_g + item.fibre_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  );

  const localMeal: SavedMeal = {
    id: `loc-${Date.now()}`,
    user_id: userId,
    name: name.trim(),
    meal_category: mealCategory,
    items,
    total_calories: Math.round(totals.calories * 10) / 10,
    total_protein_g: Math.round(totals.protein_g * 10) / 10,
    total_carbs_g: Math.round(totals.carbs_g * 10) / 10,
    total_fat_g: Math.round(totals.fat_g * 10) / 10,
    total_fibre_g: Math.round(totals.fibre_g * 10) / 10,
  };

  const supabase = getClientOrNull();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('saved_meals')
        .insert({
          user_id: userId,
          name: localMeal.name,
          meal_category: localMeal.meal_category,
          items: localMeal.items,
          total_calories: localMeal.total_calories,
          total_protein_g: localMeal.total_protein_g,
          total_carbs_g: localMeal.total_carbs_g,
          total_fat_g: localMeal.total_fat_g,
          total_fibre_g: localMeal.total_fibre_g,
        })
        .select('*')
        .single();

      if (!error && data) {
        const saved = data as SavedMeal;
        const existing = readLocalArray<SavedMeal>(LOCAL_SAVED_MEALS_KEY(userId));
        writeLocalArray(LOCAL_SAVED_MEALS_KEY(userId), [saved, ...existing]);
        return saved;
      }
      if (error && !isSchemaMissingError(error)) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err;
    }
  }

  const existing = readLocalArray<SavedMeal>(LOCAL_SAVED_MEALS_KEY(userId));
  writeLocalArray(LOCAL_SAVED_MEALS_KEY(userId), [localMeal, ...existing]);
  return localMeal;
}

export async function deleteSavedMeal(userId: string, mealId: string): Promise<void> {
  const existing = readLocalArray<SavedMeal>(LOCAL_SAVED_MEALS_KEY(userId));
  writeLocalArray(
    LOCAL_SAVED_MEALS_KEY(userId),
    existing.filter((m) => m.id !== mealId)
  );

  const supabase = getClientOrNull();
  if (!supabase || mealId.startsWith('loc-')) return;
  try {
    const { error } = await supabase
      .from('saved_meals')
      .delete()
      .eq('id', mealId)
      .eq('user_id', userId);
    if (error && !isSchemaMissingError(error)) throw new Error(error.message);
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }
}

export async function fetchWaterLogsRange(
  userId: string,
  fromDate: string,
  toDate: string
): Promise<WaterLogRecord[]> {
  const localAll = readLocalArray<WaterLogRecord>(LOCAL_WATER_LOGS_KEY(userId));
  const localRange = localAll.filter(
    (w) => w.logged_date >= fromDate && w.logged_date <= toDate
  );

  const supabase = getClientOrNull();
  if (!supabase) return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));

  try {
    const { data, error } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_date', fromDate)
      .lte('logged_date', toDate)
      .order('logged_at', { ascending: true });

    if (error) {
      if (isSchemaMissingError(error)) {
        return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
      }
      throw new Error(error.message);
    }

    const remote = (data ?? []) as WaterLogRecord[];
    const remoteIds = new Set(remote.map((r) => r.id));
    const otherDates = localAll.filter(
      (w) => w.logged_date < fromDate || w.logged_date > toDate || (w.id.startsWith('loc-') && !remoteIds.has(w.id))
    );
    writeLocalArray(LOCAL_WATER_LOGS_KEY(userId), [...remote, ...otherDates]);

    return [
      ...remote,
      ...localRange.filter((w) => w.id.startsWith('loc-') && !remoteIds.has(w.id)),
    ].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return localRange.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    }
    throw err;
  }
}

export async function addWaterLog(
  userId: string,
  amountMl: number,
  loggedDate: string
): Promise<WaterLogRecord> {
  const nowIso = new Date().toISOString();
  const localRecord: WaterLogRecord = {
    id: `loc-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    user_id: userId,
    amount_ml: Math.round(amountMl),
    logged_date: loggedDate,
    logged_at: nowIso,
  };

  const supabase = getClientOrNull();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('water_logs')
        .insert({
          user_id: userId,
          amount_ml: localRecord.amount_ml,
          logged_date: loggedDate,
          logged_at: nowIso,
        })
        .select('*')
        .single();

      if (!error && data) {
        const saved = data as WaterLogRecord;
        const existing = readLocalArray<WaterLogRecord>(LOCAL_WATER_LOGS_KEY(userId));
        writeLocalArray(LOCAL_WATER_LOGS_KEY(userId), [...existing, saved]);
        return saved;
      }
      if (error && !isSchemaMissingError(error)) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) throw err;
    }
  }

  const existing = readLocalArray<WaterLogRecord>(LOCAL_WATER_LOGS_KEY(userId));
  writeLocalArray(LOCAL_WATER_LOGS_KEY(userId), [...existing, localRecord]);
  return localRecord;
}

export async function deleteWaterLog(userId: string, id: string): Promise<void> {
  const existing = readLocalArray<WaterLogRecord>(LOCAL_WATER_LOGS_KEY(userId));
  writeLocalArray(
    LOCAL_WATER_LOGS_KEY(userId),
    existing.filter((w) => w.id !== id)
  );

  const supabase = getClientOrNull();
  if (!supabase || id.startsWith('loc-')) return;
  try {
    const { error } = await supabase
      .from('water_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error && !isSchemaMissingError(error)) throw new Error(error.message);
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }
}

export function getDefaultCoachPrefs(
  userId: string,
  fitnessGoal: FitnessGoal = 'fat_loss'
): NutritionCoachPrefs {
  return {
    id: `local-prefs-${userId}`,
    user_id: userId,
    biological_sex: 'unspecified',
    macro_style: 'balanced',
    weekly_rate_pct: getDefaultWeeklyRatePct(fitnessGoal),
    auto_apply_checkins: false,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchNutritionCoachPrefs(
  userId: string,
  fitnessGoal: FitnessGoal = 'fat_loss'
): Promise<NutritionCoachPrefs> {
  const local = readLocalObject<NutritionCoachPrefs>(LOCAL_COACH_PREFS_KEY(userId));
  const fallback = local ?? getDefaultCoachPrefs(userId, fitnessGoal);
  const supabase = getClientOrNull();
  if (!supabase) return fallback;

  try {
    const { data, error } = await supabase
      .from('nutrition_coach_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error)) return fallback;
      throw new Error(error.message);
    }
    if (data) {
      const parsed: NutritionCoachPrefs = {
        id: data.id,
        user_id: data.user_id,
        biological_sex: data.biological_sex,
        macro_style: data.macro_style,
        weekly_rate_pct: Number(data.weekly_rate_pct),
        auto_apply_checkins: Boolean(data.auto_apply_checkins),
        updated_at: data.updated_at,
      };
      writeLocalObject(LOCAL_COACH_PREFS_KEY(userId), parsed);
      return parsed;
    }
    return fallback;
  } catch (err) {
    if (isSchemaMissingError(err)) return fallback;
    return fallback;
  }
}

export async function saveNutritionCoachPrefs(
  userId: string,
  updates: Partial<
    Pick<
      NutritionCoachPrefs,
      'biological_sex' | 'macro_style' | 'weekly_rate_pct' | 'auto_apply_checkins'
    >
  >,
  fitnessGoal: FitnessGoal = 'fat_loss'
): Promise<NutritionCoachPrefs> {
  const prev = await fetchNutritionCoachPrefs(userId, fitnessGoal);
  const merged: NutritionCoachPrefs = {
    ...prev,
    ...updates,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  writeLocalObject(LOCAL_COACH_PREFS_KEY(userId), merged);

  const supabase = getClientOrNull();
  if (!supabase) return merged;

  try {
    const { data, error } = await supabase
      .from('nutrition_coach_prefs')
      .upsert(
        {
          user_id: userId,
          biological_sex: merged.biological_sex,
          macro_style: merged.macro_style,
          weekly_rate_pct: merged.weekly_rate_pct,
          auto_apply_checkins: merged.auto_apply_checkins,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (!error && data) {
      const saved: NutritionCoachPrefs = {
        id: data.id,
        user_id: data.user_id,
        biological_sex: data.biological_sex,
        macro_style: data.macro_style,
        weekly_rate_pct: Number(data.weekly_rate_pct),
        auto_apply_checkins: Boolean(data.auto_apply_checkins),
        updated_at: data.updated_at,
      };
      writeLocalObject(LOCAL_COACH_PREFS_KEY(userId), saved);
      return saved;
    }
    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }

  return merged;
}

export async function fetchNutritionCheckins(userId: string): Promise<NutritionCheckinRecord[]> {
  const local = readLocalArray<NutritionCheckinRecord>(LOCAL_CHECKINS_KEY(userId));
  const supabase = getClientOrNull();
  if (!supabase) {
    return [...local].sort((a, b) => b.checkin_date.localeCompare(a.checkin_date));
  }

  try {
    const { data, error } = await supabase
      .from('nutrition_checkins')
      .select('*')
      .eq('user_id', userId)
      .order('checkin_date', { ascending: false })
      .limit(24);

    if (error) {
      if (isSchemaMissingError(error)) {
        return [...local].sort((a, b) => b.checkin_date.localeCompare(a.checkin_date));
      }
      throw new Error(error.message);
    }
    const remote = (data ?? []).map((r) => ({
      ...r,
      trend_weight_kg: r.trend_weight_kg !== null ? Number(r.trend_weight_kg) : null,
      estimated_tdee: Number(r.estimated_tdee),
      baseline_tdee: Number(r.baseline_tdee),
      paired_days: Number(r.paired_days),
      recommended_calories: Number(r.recommended_calories),
      recommended_protein_g: Number(r.recommended_protein_g),
      recommended_carbs_g: Number(r.recommended_carbs_g),
      recommended_fat_g: Number(r.recommended_fat_g),
      recommended_fibre_g: Number(r.recommended_fibre_g),
    })) as NutritionCheckinRecord[];

    if (remote.length > 0) writeLocalArray(LOCAL_CHECKINS_KEY(userId), remote);
    return remote.length > 0 ? remote : local;
  } catch (err) {
    if (isSchemaMissingError(err)) {
      return [...local].sort((a, b) => b.checkin_date.localeCompare(a.checkin_date));
    }
    return local;
  }
}

export async function saveNutritionCheckin(
  userId: string,
  payload: Omit<NutritionCheckinRecord, 'id' | 'user_id' | 'created_at'>
): Promise<NutritionCheckinRecord> {
  const localEntry: NutritionCheckinRecord = {
    ...payload,
    id: `loc-chk-${Date.now()}`,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  const existing = readLocalArray<NutritionCheckinRecord>(LOCAL_CHECKINS_KEY(userId));
  writeLocalArray(LOCAL_CHECKINS_KEY(userId), [localEntry, ...existing].slice(0, 24));

  const supabase = getClientOrNull();
  if (!supabase) return localEntry;

  try {
    const { data, error } = await supabase
      .from('nutrition_checkins')
      .insert({
        user_id: userId,
        checkin_date: payload.checkin_date,
        trend_weight_kg: payload.trend_weight_kg,
        estimated_tdee: Math.round(payload.estimated_tdee),
        baseline_tdee: Math.round(payload.baseline_tdee),
        confidence: payload.confidence,
        paired_days: payload.paired_days,
        recommended_calories: Math.round(payload.recommended_calories),
        recommended_protein_g: Math.round(payload.recommended_protein_g),
        recommended_carbs_g: Math.round(payload.recommended_carbs_g),
        recommended_fat_g: Math.round(payload.recommended_fat_g),
        recommended_fibre_g: Math.round(payload.recommended_fibre_g),
        notes: payload.notes,
      })
      .select('*')
      .single();

    if (!error && data) {
      const saved: NutritionCheckinRecord = {
        ...data,
        trend_weight_kg: data.trend_weight_kg !== null ? Number(data.trend_weight_kg) : null,
      } as NutritionCheckinRecord;
      writeLocalArray(
        LOCAL_CHECKINS_KEY(userId),
        [saved, ...existing.filter((c) => c.id !== localEntry.id)].slice(0, 24)
      );
      return saved;
    }
    if (error && !isSchemaMissingError(error)) {
      throw new Error(error.message);
    }
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }

  return localEntry;
}
