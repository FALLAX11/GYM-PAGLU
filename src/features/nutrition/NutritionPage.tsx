import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Copy,
  Droplets,
  Edit3,
  Heart,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../../components/layout/AppShell';
import { NutritionCoachPanel } from '../../components/nutrition/NutritionCoachPanel';
import {
  Card,
  EmptyState,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  LoadingBlock,
  ModalSheet,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { matchesFoodQuery } from '../../data/masterFoodCatalog';
import { computeDailyNutritionSeries } from '../../lib/adaptiveNutrition';
import { isSchemaMissingError } from '../../lib/supabase';
import { getLocalDateString } from '../../lib/units';
import {
  addFoodLog,
  addWaterLog,
  copyMealFromDate,
  createCustomFood,
  createSavedMeal,
  deleteFoodLog,
  deleteSavedMeal,
  deleteWaterLog,
  fetchFavoriteFoodLogs,
  fetchFoodCatalog,
  fetchFoodLogsRange,
  fetchNutritionCheckins,
  fetchNutritionCoachPrefs,
  fetchSavedMeals,
  fetchWaterLogsRange,
  getDefaultCoachPrefs,
  saveNutritionCheckin,
  saveNutritionCoachPrefs,
  updateFoodLog,
} from '../../services/nutritionService';
import { updateNutritionGoals } from '../../services/profileService';
import { addWeightLog, fetchWeightLogs } from '../../services/progressService';
import type {
  FoodCategory,
  FoodItem,
  FoodLogRecord,
  MealCategory,
  NutritionCheckinRecord,
  NutritionCoachPrefs,
  NutritionGoals,
  SavedMeal,
  WaterLogRecord,
  WeightLogRecord,
} from '../../types/database';

const FOOD_CATEGORIES: Array<'All' | FoodCategory> = [
  'All',
  'Rice',
  'Roti',
  'Dal',
  'Vegetables',
  'Eggs',
  'Milk',
  'Paneer',
  'Chicken',
  'Fish',
  'Oats',
  'Fruits',
  'Nuts',
  'Whey protein',
  'Other Indian foods',
];

const MEALS: Array<{ id: MealCategory; label: string }> = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

type NutritionTab = 'log' | 'coach' | 'insights';

export function NutritionPage() {
  const { user, profile, settings, nutritionGoals, setNutritionGoalsState } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<NutritionTab>('log');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [foodLogsRange, setFoodLogsRange] = useState<FoodLogRecord[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLogRecord[]>([]);
  const [catalog, setCatalog] = useState<FoodItem[]>([]);
  const [favorites, setFavorites] = useState<FoodLogRecord[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLogRecord[]>([]);
  const [coachPrefs, setCoachPrefs] = useState<NutritionCoachPrefs>(() =>
    getDefaultCoachPrefs(user?.id ?? '', profile?.fitness_goal ?? 'fat_loss')
  );
  const [checkins, setCheckins] = useState<NutritionCheckinRecord[]>([]);

  // Food Search & Log Modal
  const [addOpen, setAddOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<MealCategory>('breakfast');
  const [pickerTab, setPickerTab] = useState<
    'database' | 'quick' | 'favorites' | 'meals' | 'custom'
  >('database');
  const [foodSearch, setFoodSearch] = useState('');
  const [foodCategory, setFoodCategory] = useState<'All' | FoodCategory>('All');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingQty, setServingQty] = useState('1');
  const [savingFood, setSavingFood] = useState(false);

  // Quick Macros form state
  const [qmLabel, setQmLabel] = useState('');
  const [qmPro, setQmPro] = useState('');
  const [qmCarb, setQmCarb] = useState('');
  const [qmFat, setQmFat] = useState('');
  const [qmCal, setQmCal] = useState('');
  const [qmFibre, setQmFibre] = useState('');

  // Create custom food state
  const [cfName, setCfName] = useState('');
  const [cfCat, setCfCat] = useState<FoodCategory>('Other Indian foods');
  const [cfSize, setCfSize] = useState('100');
  const [cfUnit, setCfUnit] = useState('g');
  const [cfCal, setCfCal] = useState('150');
  const [cfPro, setCfPro] = useState('10');
  const [cfCarb, setCfCarb] = useState('20');
  const [cfFat, setCfFat] = useState('4');
  const [cfFibre, setCfFibre] = useState('2');

  // Edit food log entry modal
  const [editingLog, setEditingLog] = useState<FoodLogRecord | null>(null);
  const [editQty, setEditQty] = useState('1');

  // Edit goals modal
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [gCal, setGCal] = useState(String(nutritionGoals.calories_target));
  const [gPro, setGPro] = useState(String(nutritionGoals.protein_target_g));
  const [gCarb, setGCarb] = useState(String(nutritionGoals.carbs_target_g));
  const [gFat, setGFat] = useState(String(nutritionGoals.fat_target_g));
  const [gFibre, setGFibre] = useState(String(nutritionGoals.fibre_target_g));
  const [gWater, setGWater] = useState(String(nutritionGoals.water_target_ml));
  const [savingGoals, setSavingGoals] = useState(false);

  // Custom water input
  const [customWaterMl, setCustomWaterMl] = useState('');

  // Save meal combo modal
  const [saveMealOpen, setSaveMealOpen] = useState<MealCategory | null>(null);
  const [saveMealName, setSaveMealName] = useState('');

  const twentyOneDaysAgo = useMemo(() => {
    const dt = new Date(`${selectedDate}T00:00:00`);
    dt.setDate(dt.getDate() - 20);
    return getLocalDateString(dt);
  }, [selectedDate]);

  const sevenDaysAgo = useMemo(() => {
    const dt = new Date(`${selectedDate}T00:00:00`);
    dt.setDate(dt.getDate() - 6);
    return getLocalDateString(dt);
  }, [selectedDate]);

  const yesterdayDate = useMemo(() => {
    const dt = new Date(`${selectedDate}T00:00:00`);
    dt.setDate(dt.getDate() - 1);
    return getLocalDateString(dt);
  }, [selectedDate]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [logsRange, water, foods, favs, meals, weights, prefs, chk] = await Promise.all([
        fetchFoodLogsRange(user.id, twentyOneDaysAgo, selectedDate),
        fetchWaterLogsRange(user.id, sevenDaysAgo, selectedDate),
        fetchFoodCatalog(user.id),
        fetchFavoriteFoodLogs(user.id),
        fetchSavedMeals(user.id),
        fetchWeightLogs(user.id),
        fetchNutritionCoachPrefs(user.id, profile?.fitness_goal ?? 'fat_loss'),
        fetchNutritionCheckins(user.id),
      ]);
      setFoodLogsRange(logsRange);
      setWaterLogs(water);
      setCatalog(foods);
      setFavorites(favs);
      setSavedMeals(meals);
      setWeightLogs(weights);
      setCoachPrefs(prefs);
      setCheckins(chk);
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.fitness_goal, selectedDate, sevenDaysAgo, twentyOneDaysAgo, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const shiftDate = (delta: number) => {
    const dt = new Date(`${selectedDate}T00:00:00`);
    dt.setDate(dt.getDate() + delta);
    setSelectedDate(getLocalDateString(dt));
  };

  const foodLogs = useMemo(
    () => foodLogsRange.filter((l) => l.logged_date === selectedDate),
    [foodLogsRange, selectedDate]
  );

  const yesterdayMealCount = useMemo(() => {
    const counts: Record<MealCategory, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snacks: 0,
    };
    for (const l of foodLogsRange) {
      if (l.logged_date === yesterdayDate) {
        counts[l.meal_category] = (counts[l.meal_category] ?? 0) + 1;
      }
    }
    return counts;
  }, [foodLogsRange, yesterdayDate]);

  const dailyTotals = useMemo(() => {
    return foodLogs.reduce(
      (acc, item) => ({
        calories: acc.calories + Number(item.calories || 0),
        protein: acc.protein + Number(item.protein_g || 0),
        carbs: acc.carbs + Number(item.carbs_g || 0),
        fat: acc.fat + Number(item.fat_g || 0),
        fibre: acc.fibre + Number(item.fibre_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
    );
  }, [foodLogs]);

  const todayWaterLogs = useMemo(
    () => waterLogs.filter((w) => w.logged_date === selectedDate),
    [selectedDate, waterLogs]
  );

  const todayWaterMl = useMemo(
    () => todayWaterLogs.reduce((sum, w) => sum + Number(w.amount_ml || 0), 0),
    [todayWaterLogs]
  );

  const hydrationChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(`${selectedDate}T00:00:00`);
      dt.setDate(dt.getDate() - i);
      map.set(getLocalDateString(dt), 0);
    }
    for (const w of waterLogs) {
      map.set(w.logged_date, (map.get(w.logged_date) ?? 0) + Number(w.amount_ml || 0));
    }
    return Array.from(map.entries()).map(([date, ml]) => ({
      date: date.slice(5),
      ml,
    }));
  }, [selectedDate, waterLogs]);

  const weeklyNutritionSeries = useMemo(
    () => computeDailyNutritionSeries(foodLogsRange, sevenDaysAgo, selectedDate),
    [foodLogsRange, sevenDaysAgo, selectedDate]
  );

  const weeklyInsightsSummary = useMemo(() => {
    const activeDays = weeklyNutritionSeries.filter((d) => d.hasLogs);
    const divisor = Math.max(1, activeDays.length);
    const sums = activeDays.reduce(
      (acc, d) => ({
        calories: acc.calories + d.calories,
        protein: acc.protein + d.protein_g,
        carbs: acc.carbs + d.carbs_g,
        fat: acc.fat + d.fat_g,
        fibre: acc.fibre + d.fibre_g,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
    );
    const onTargetDays = activeDays.filter(
      (d) =>
        Math.abs(d.calories - nutritionGoals.calories_target) <=
        Math.max(150, nutritionGoals.calories_target * 0.1)
    ).length;

    return {
      loggedDays: activeDays.length,
      onTargetDays,
      avgCalories: activeDays.length ? Math.round(sums.calories / divisor) : 0,
      avgProtein: activeDays.length ? Math.round(sums.protein / divisor) : 0,
      avgCarbs: activeDays.length ? Math.round(sums.carbs / divisor) : 0,
      avgFat: activeDays.length ? Math.round(sums.fat / divisor) : 0,
      avgFibre: activeDays.length ? Math.round(sums.fibre / divisor) : 0,
    };
  }, [weeklyNutritionSeries, nutritionGoals.calories_target]);

  const filteredFoods = useMemo(() => {
    return catalog.filter((f) => {
      const catOk = foodCategory === 'All' || f.category === foodCategory;
      const qOk = matchesFoodQuery(f, foodSearch);
      return catOk && qOk;
    });
  }, [catalog, foodCategory, foodSearch]);

  const handleLogSelectedFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFood) return;
    const qty = parseFloat(servingQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a valid serving multiplier greater than 0.', 'error');
      return;
    }

    setSavingFood(true);
    try {
      const created = await addFoodLog(user.id, {
        food_id: selectedFood.is_custom ? null : selectedFood.id,
        custom_food_id: selectedFood.is_custom ? selectedFood.id : null,
        food_name: selectedFood.name,
        quantity: qty,
        serving_unit: `${selectedFood.serving_size} ${selectedFood.serving_unit}`,
        calories: selectedFood.calories * qty,
        protein_g: selectedFood.protein_g * qty,
        carbs_g: selectedFood.carbs_g * qty,
        fat_g: selectedFood.fat_g * qty,
        fibre_g: selectedFood.fibre_g * qty,
        meal_category: activeMeal,
        logged_date: selectedDate,
        is_favorite: false,
      });
      setFoodLogsRange((prev) => [...prev, created]);
      setSelectedFood(null);
      setServingQty('1');
      setAddOpen(false);
      showToast(`${created.food_name} logged.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingFood(false);
    }
  };

  const handleQuickMacrosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const pro = parseFloat(qmPro) || 0;
    const carb = parseFloat(qmCarb) || 0;
    const fat = parseFloat(qmFat) || 0;
    const fibre = parseFloat(qmFibre) || 0;
    const derivedKcal = Math.round(pro * 4 + carb * 4 + fat * 9);
    const cal = qmCal.trim() ? parseFloat(qmCal) || 0 : derivedKcal;

    if (cal <= 0 && pro <= 0 && carb <= 0 && fat <= 0) {
      showToast('Enter calories or macros to quick-log.', 'error');
      return;
    }

    setSavingFood(true);
    try {
      const created = await addFoodLog(user.id, {
        food_id: null,
        custom_food_id: null,
        food_name: qmLabel.trim() || 'Quick Macros Entry',
        quantity: 1,
        serving_unit: 'quick entry',
        calories: cal,
        protein_g: pro,
        carbs_g: carb,
        fat_g: fat,
        fibre_g: fibre,
        meal_category: activeMeal,
        logged_date: selectedDate,
        is_favorite: false,
      });
      setFoodLogsRange((prev) => [...prev, created]);
      setQmLabel('');
      setQmPro('');
      setQmCarb('');
      setQmFat('');
      setQmCal('');
      setQmFibre('');
      setAddOpen(false);
      showToast(`Quick macros (${Math.round(created.calories)} kcal) logged.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingFood(false);
    }
  };

  const handleCreateAndLogCustomFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !cfName.trim()) return;
    setSavingFood(true);
    try {
      const createdFood = await createCustomFood(user.id, {
        name: cfName,
        category: cfCat,
        serving_size: Number(cfSize) || 100,
        serving_unit: cfUnit || 'g',
        calories: Number(cfCal) || 0,
        protein_g: Number(cfPro) || 0,
        carbs_g: Number(cfCarb) || 0,
        fat_g: Number(cfFat) || 0,
        fibre_g: Number(cfFibre) || 0,
      });
      setCatalog((prev) => [createdFood, ...prev]);

      const log = await addFoodLog(user.id, {
        food_id: null,
        custom_food_id: createdFood.id,
        food_name: createdFood.name,
        quantity: 1,
        serving_unit: `${createdFood.serving_size} ${createdFood.serving_unit}`,
        calories: createdFood.calories,
        protein_g: createdFood.protein_g,
        carbs_g: createdFood.carbs_g,
        fat_g: createdFood.fat_g,
        fibre_g: createdFood.fibre_g,
        meal_category: activeMeal,
        logged_date: selectedDate,
        is_favorite: false,
      });
      setFoodLogsRange((prev) => [...prev, log]);
      setCfName('');
      setAddOpen(false);
      showToast(`Custom food "${createdFood.name}" created and logged.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingFood(false);
    }
  };

  const handleCopyYesterdayMeal = async (mealCategory: MealCategory) => {
    if (!user) return;
    try {
      const copied = await copyMealFromDate(user.id, yesterdayDate, selectedDate, mealCategory);
      if (copied.length === 0) {
        showToast('No items logged in this meal yesterday.', 'info');
        return;
      }
      setFoodLogsRange((prev) => [...prev, ...copied]);
      showToast(`Copied ${copied.length} item${copied.length > 1 ? 's' : ''} from yesterday.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleLogFavorite = async (fav: FoodLogRecord) => {
    if (!user) return;
    setSavingFood(true);
    try {
      const created = await addFoodLog(user.id, {
        food_id: fav.food_id,
        custom_food_id: fav.custom_food_id,
        food_name: fav.food_name,
        quantity: fav.quantity,
        serving_unit: fav.serving_unit,
        calories: fav.calories,
        protein_g: fav.protein_g,
        carbs_g: fav.carbs_g,
        fat_g: fav.fat_g,
        fibre_g: fav.fibre_g,
        meal_category: activeMeal,
        logged_date: selectedDate,
        is_favorite: true,
      });
      setFoodLogsRange((prev) => [...prev, created]);
      setAddOpen(false);
      showToast(`Logged favourite "${created.food_name}".`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingFood(false);
    }
  };

  const handleLogSavedMeal = async (meal: SavedMeal) => {
    if (!user) return;
    setSavingFood(true);
    try {
      const createdEntries = await Promise.all(
        meal.items.map((item) =>
          addFoodLog(user.id, {
            food_id: null,
            custom_food_id: null,
            food_name: item.food_name,
            quantity: item.quantity,
            serving_unit: item.serving_unit,
            calories: item.calories,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            fibre_g: item.fibre_g,
            meal_category: activeMeal,
            logged_date: selectedDate,
            is_favorite: false,
          })
        )
      );
      setFoodLogsRange((prev) => [...prev, ...createdEntries]);
      setAddOpen(false);
      showToast(`Logged saved meal "${meal.name}".`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingFood(false);
    }
  };

  const handleSaveMealCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !saveMealOpen || !saveMealName.trim()) return;
    const mealItems = foodLogs.filter((l) => l.meal_category === saveMealOpen);
    if (mealItems.length === 0) return;

    try {
      const created = await createSavedMeal(
        user.id,
        saveMealName,
        saveMealOpen,
        mealItems.map((m) => ({
          food_name: m.food_name,
          quantity: m.quantity,
          serving_unit: m.serving_unit,
          calories: m.calories,
          protein_g: m.protein_g,
          carbs_g: m.carbs_g,
          fat_g: m.fat_g,
          fibre_g: m.fibre_g,
        }))
      );
      setSavedMeals((prev) => [created, ...prev]);
      setSaveMealName('');
      setSaveMealOpen(null);
      showToast(`Saved meal "${created.name}" for 1-tap logging.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleToggleFavorite = async (log: FoodLogRecord) => {
    if (!user) return;
    try {
      const updated = await updateFoodLog(user.id, log.id, { is_favorite: !log.is_favorite });
      setFoodLogsRange((prev) => prev.map((l) => (l.id === log.id ? updated : l)));
      if (updated.is_favorite) {
        setFavorites((prev) => [updated, ...prev.filter((p) => p.id !== updated.id)]);
      } else {
        setFavorites((prev) => prev.filter((p) => p.id !== updated.id));
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveEditedLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingLog) return;
    const newQty = parseFloat(editQty);
    if (!Number.isFinite(newQty) || newQty <= 0) return;

    const ratio = newQty / (editingLog.quantity || 1);
    try {
      const updated = await updateFoodLog(user.id, editingLog.id, {
        quantity: newQty,
        calories: Math.round(editingLog.calories * ratio * 10) / 10,
        protein_g: Math.round(editingLog.protein_g * ratio * 10) / 10,
        carbs_g: Math.round(editingLog.carbs_g * ratio * 10) / 10,
        fat_g: Math.round(editingLog.fat_g * ratio * 10) / 10,
        fibre_g: Math.round(editingLog.fibre_g * ratio * 10) / 10,
      });
      setFoodLogsRange((prev) => prev.map((l) => (l.id === editingLog.id ? updated : l)));
      setEditingLog(null);
      showToast('Food entry updated.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!user) return;
    try {
      await deleteFoodLog(user.id, id);
      setFoodLogsRange((prev) => prev.filter((l) => l.id !== id));
      showToast('Food entry deleted.', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleAddWater = async (ml: number) => {
    if (!user || ml <= 0) return;
    try {
      const created = await addWaterLog(user.id, ml, selectedDate);
      setWaterLogs((prev) => [...prev, created]);
      setCustomWaterMl('');
      showToast(`Added ${ml} ml water.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingGoals(true);
    try {
      const updated = await updateNutritionGoals(user.id, {
        calories_target: Number(gCal) || 2400,
        protein_target_g: Number(gPro) || 160,
        carbs_target_g: Number(gCarb) || 260,
        fat_target_g: Number(gFat) || 70,
        fibre_target_g: Number(gFibre) || 32,
        water_target_ml: Number(gWater) || 3500,
      });
      setNutritionGoalsState(updated);
      setGoalsOpen(false);
      showToast('Nutrition targets saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingGoals(false);
    }
  };

  const handleUpdateCoachPrefs = async (
    updates: Partial<
      Pick<
        NutritionCoachPrefs,
        'biological_sex' | 'macro_style' | 'weekly_rate_pct' | 'auto_apply_checkins'
      >
    >
  ) => {
    if (!user) return;
    setCoachPrefs((prev) => ({ ...prev, ...updates }));
    try {
      const saved = await saveNutritionCoachPrefs(
        user.id,
        updates,
        profile?.fitness_goal ?? 'fat_loss'
      );
      setCoachPrefs(saved);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleQuickWeighIn = async (weightKg: number, dateStr: string) => {
    if (!user) return;
    try {
      const created = await addWeightLog(user.id, weightKg, dateStr, 'Macro Coach check-in');
      setWeightLogs((prev) =>
        [...prev, created].sort((a, b) => a.logged_date.localeCompare(b.logged_date))
      );
      showToast('Weight logged & trend updated.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleApplyCheckin = async (params: {
    checkin: Omit<NutritionCheckinRecord, 'id' | 'user_id' | 'created_at'>;
    goals: Omit<NutritionGoals, 'id' | 'user_id'>;
  }) => {
    if (!user) return;
    try {
      const [savedGoal, savedCheckin] = await Promise.all([
        updateNutritionGoals(user.id, params.goals),
        saveNutritionCheckin(user.id, params.checkin),
      ]);
      setNutritionGoalsState(savedGoal);
      setCheckins((prev) => [savedCheckin, ...prev]);
      showToast(
        `Check-in complete: daily target updated to ${savedGoal.calories_target} kcal.`,
        'success'
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const remainingKcal = Math.round(nutritionGoals.calories_target - dailyTotals.calories);

  return (
    <AppShell
      title="Nutrition"
      headerAction={
        <button
          type="button"
          onClick={() => {
            setGCal(String(nutritionGoals.calories_target));
            setGPro(String(nutritionGoals.protein_target_g));
            setGCarb(String(nutritionGoals.carbs_target_g));
            setGFat(String(nutritionGoals.fat_target_g));
            setGFibre(String(nutritionGoals.fibre_target_g));
            setGWater(String(nutritionGoals.water_target_ml));
            setGoalsOpen(true);
          }}
          className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Targets</span>
        </button>
      }
    >
      <div className="space-y-5">
        {/* Sub-Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#111318] border border-white/[0.08]">
          {(
            [
              { id: 'log', label: 'Daily Log', icon: Utensils },
              { id: 'coach', label: 'Macro Coach', icon: Sparkles },
              { id: 'insights', label: '7-Day Insights', icon: BarChart3 },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  active ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
                }`}
                style={
                  active
                    ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                    : undefined
                }
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Date Navigation Bar */}
        <Card className="flex items-center justify-between gap-3 py-3">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/5 text-zinc-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Select nutrition date"
              className="bg-transparent text-sm font-mono-num font-bold text-white focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Next day"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/5 text-zinc-300"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </Card>

        {error && <ErrorBanner message={error} onRetry={loadData} />}

        {loading ? (
          <LoadingBlock label="Loading nutrition, expenditure & water records..." />
        ) : tab === 'coach' ? (
          <NutritionCoachPanel
            profile={profile}
            settings={settings}
            nutritionGoals={nutritionGoals}
            foodLogsRange={foodLogsRange}
            weightLogs={weightLogs}
            coachPrefs={coachPrefs}
            checkins={checkins}
            selectedDate={selectedDate}
            onUpdatePrefs={handleUpdateCoachPrefs}
            onQuickWeighIn={handleQuickWeighIn}
            onApplyCheckin={handleApplyCheckin}
          />
        ) : tab === 'insights' ? (
          <div className="space-y-4">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-white">
                    7-Day Nutrition Adherence
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {weeklyInsightsSummary.loggedDays} of 7 days logged ·{' '}
                    {weeklyInsightsSummary.onTargetDays} within target band
                  </p>
                </div>
                <p className="font-mono-num text-xs text-zinc-300">
                  Target: {nutritionGoals.calories_target} kcal · {nutritionGoals.protein_target_g}g P
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[11px] text-zinc-400">Avg Calories</p>
                  <p className="font-mono-num text-base font-bold text-white mt-0.5">
                    {weeklyInsightsSummary.avgCalories} kcal
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[11px] text-zinc-400">Avg Protein</p>
                  <p className="font-mono-num text-base font-bold mt-0.5" style={{ color: '#C4F82A' }}>
                    {weeklyInsightsSummary.avgProtein} g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[11px] text-zinc-400">Avg Carbs</p>
                  <p className="font-mono-num text-base font-bold text-sky-400 mt-0.5">
                    {weeklyInsightsSummary.avgCarbs} g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[11px] text-zinc-400">Avg Fat</p>
                  <p className="font-mono-num text-base font-bold text-amber-400 mt-0.5">
                    {weeklyInsightsSummary.avgFat} g
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[11px] text-zinc-400">Avg Fibre</p>
                  <p className="font-mono-num text-base font-bold text-white mt-0.5">
                    {weeklyInsightsSummary.avgFibre} g
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="space-y-3">
                <h3 className="font-display text-sm font-bold text-white">
                  Daily Calories vs Target (kcal)
                </h3>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyNutritionSeries}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#71717A" fontSize={10} />
                      <YAxis stroke="#71717A" fontSize={10} width={40} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111318',
                          borderColor: 'rgba(255,255,255,0.12)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <ReferenceLine
                        y={nutritionGoals.calories_target}
                        stroke="#38BDF8"
                        strokeDasharray="4 4"
                      />
                      <Bar dataKey="calories" name="Calories" fill="#C4F82A" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="space-y-3">
                <h3 className="font-display text-sm font-bold text-white">
                  Daily Protein vs Target (g)
                </h3>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weeklyNutritionSeries}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#71717A" fontSize={10} />
                      <YAxis stroke="#71717A" fontSize={10} width={36} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111318',
                          borderColor: 'rgba(255,255,255,0.12)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <ReferenceLine
                        y={nutritionGoals.protein_target_g}
                        stroke="#C4F82A"
                        strokeDasharray="4 4"
                      />
                      <Bar dataKey="protein_g" name="Protein (g)" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Daily Macro Totals + Meals */}
            <div className="lg:col-span-8 space-y-4">
              <Card className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-400">Daily Energy</p>
                    <p className="font-mono-num text-3xl font-bold text-white mt-0.5">
                      {Math.round(dailyTotals.calories)}{' '}
                      <span className="text-sm font-normal text-zinc-400">
                        / {nutritionGoals.calories_target} kcal
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num text-xs font-semibold text-white">
                      {remainingKcal >= 0
                        ? `${remainingKcal} kcal left`
                        : `${Math.abs(remainingKcal)} kcal over`}
                    </p>
                    <p className="font-mono-num text-xs text-zinc-400">
                      Fibre: {Math.round(dailyTotals.fibre)} / {nutritionGoals.fibre_target_g}g
                    </p>
                  </div>
                </div>

                <ProgressBar
                  value={dailyTotals.calories}
                  max={nutritionGoals.calories_target}
                  heightClass="h-2.5"
                />

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Protein</span>
                      <span className="font-mono-num font-semibold text-white">
                        {Math.round(dailyTotals.protein)}/{nutritionGoals.protein_target_g}g
                      </span>
                    </div>
                    <ProgressBar
                      value={dailyTotals.protein}
                      max={nutritionGoals.protein_target_g}
                      color="#C4F82A"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Carbs</span>
                      <span className="font-mono-num font-semibold text-white">
                        {Math.round(dailyTotals.carbs)}/{nutritionGoals.carbs_target_g}g
                      </span>
                    </div>
                    <ProgressBar
                      value={dailyTotals.carbs}
                      max={nutritionGoals.carbs_target_g}
                      color="#38BDF8"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Fat</span>
                      <span className="font-mono-num font-semibold text-white">
                        {Math.round(dailyTotals.fat)}/{nutritionGoals.fat_target_g}g
                      </span>
                    </div>
                    <ProgressBar
                      value={dailyTotals.fat}
                      max={nutritionGoals.fat_target_g}
                      color="#F59E0B"
                    />
                  </div>
                </div>
              </Card>

              {/* Meal Sections */}
              {MEALS.map((meal) => {
                const items = foodLogs.filter((l) => l.meal_category === meal.id);
                const mealCal = items.reduce((sum, i) => sum + Number(i.calories || 0), 0);
                const mealPro = items.reduce((sum, i) => sum + Number(i.protein_g || 0), 0);
                const hasYesterday = (yesterdayMealCount[meal.id] ?? 0) > 0;

                return (
                  <Card key={meal.id} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-bold text-white">{meal.label}</h2>
                        <p className="font-mono-num text-xs text-zinc-400">
                          {Math.round(mealCal)} kcal · {Math.round(mealPro)}g protein
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasYesterday && (
                          <button
                            type="button"
                            onClick={() => void handleCopyYesterdayMeal(meal.id)}
                            aria-label={`Copy ${meal.label} from yesterday`}
                            title="Copy yesterday's meal"
                            className="min-h-[38px] px-2.5 flex items-center justify-center gap-1 rounded-xl border border-white/10 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.04]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Yesterday</span>
                          </button>
                        )}
                        {items.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSaveMealOpen(meal.id)}
                            aria-label={`Save ${meal.label} as reusable meal`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-white/10 text-zinc-400 hover:text-white"
                          >
                            <BookmarkPlus className="w-4 h-4" />
                          </button>
                        )}
                        <SecondaryButton
                          onClick={() => {
                            setActiveMeal(meal.id);
                            setSelectedFood(null);
                            setAddOpen(true);
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          Add Food
                        </SecondaryButton>
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-1">
                        No foods logged for {meal.label.toLowerCase()}.
                      </p>
                    ) : (
                      <div className="divide-y divide-white/[0.06]">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {item.food_name}
                              </p>
                              <p className="text-xs text-zinc-400 font-mono-num">
                                {item.quantity} × {item.serving_unit} · {Math.round(item.calories)}{' '}
                                kcal · P {Math.round(item.protein_g)}g · C{' '}
                                {Math.round(item.carbs_g)}g · F {Math.round(item.fat_g)}g
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleToggleFavorite(item)}
                                aria-label="Toggle favorite"
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-white/5"
                                style={{ color: item.is_favorite ? '#F43F5E' : '#71717A' }}
                              >
                                <Heart
                                  className="w-4 h-4"
                                  fill={item.is_favorite ? 'currentColor' : 'none'}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLog(item);
                                  setEditQty(String(item.quantity));
                                }}
                                aria-label="Edit quantity"
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteLog(item.id)}
                                aria-label="Delete food log"
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/5"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Right Column: Water Tracker & 7-Day Hydration Chart */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-400">Water Intake</p>
                    <p className="font-mono-num text-2xl font-bold text-white mt-0.5">
                      {todayWaterMl} ml
                    </p>
                    <p className="font-mono-num text-xs text-zinc-400">
                      Goal: {nutritionGoals.water_target_ml} ml
                    </p>
                  </div>
                  <Droplets className="w-6 h-6 text-sky-400" />
                </div>

                <ProgressBar
                  value={todayWaterMl}
                  max={nutritionGoals.water_target_ml}
                  color="#38BDF8"
                />

                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton onClick={() => void handleAddWater(250)}>+250 ml</SecondaryButton>
                  <SecondaryButton onClick={() => void handleAddWater(500)}>+500 ml</SecondaryButton>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amt = parseInt(customWaterMl, 10);
                    if (Number.isFinite(amt) && amt > 0) void handleAddWater(amt);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    value={customWaterMl}
                    onChange={(e) => setCustomWaterMl(e.target.value)}
                    placeholder="Custom ml"
                    className={`${INPUT_CLASS} flex-1`}
                  />
                  <PrimaryButton type="submit">Add</PrimaryButton>
                </form>

                {todayWaterLogs.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06] space-y-1.5 max-h-36 overflow-y-auto">
                    {todayWaterLogs.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between text-xs text-zinc-400 font-mono-num"
                      >
                        <span>
                          {w.amount_ml} ml ·{' '}
                          {new Date(w.logged_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user) return;
                            await deleteWaterLog(user.id, w.id);
                            setWaterLogs((prev) => prev.filter((item) => item.id !== w.id));
                          }}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                          aria-label="Remove water entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="space-y-3">
                <h3 className="font-display text-sm font-bold text-white">7-Day Hydration (ml)</h3>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={hydrationChartData}
                      margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="date" stroke="#71717A" fontSize={10} />
                      <YAxis stroke="#71717A" fontSize={10} width={38} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111318',
                          borderColor: 'rgba(255,255,255,0.12)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="ml" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Add Food / Quick Macros / Favourites / Saved Meals / Custom Food Sheet */}
      <ModalSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Add to ${MEALS.find((m) => m.id === activeMeal)?.label ?? 'Meal'}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#0D0F13] border border-white/10">
            {(
              [
                { id: 'database', label: 'Search' },
                { id: 'quick', label: 'Quick' },
                { id: 'favorites', label: 'Faves' },
                { id: 'meals', label: 'Meals' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setPickerTab(t.id);
                  setSelectedFood(null);
                }}
                className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                  pickerTab === t.id ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
                }`}
                style={
                  pickerTab === t.id
                    ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                    : undefined
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {pickerTab === 'database' && !selectedFood && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder="Search rice, chapati, dahi, paneer, soya, oats..."
                  className={`${INPUT_CLASS} pl-10`}
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {FOOD_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFoodCategory(cat)}
                    className={`min-h-[32px] px-2.5 rounded-lg text-xs whitespace-nowrap shrink-0 border ${
                      foodCategory === cat
                        ? 'text-[#08090B] border-transparent font-semibold'
                        : 'border-white/10 text-zinc-300'
                    }`}
                    style={
                      foodCategory === cat
                        ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                        : undefined
                    }
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.06] rounded-xl border border-white/10">
                {filteredFoods.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    No matching foods found. Try Quick or Custom tab.
                  </div>
                ) : (
                  filteredFoods.map((food) => (
                    <button
                      key={`${food.is_custom ? 'c' : 'p'}-${food.id}`}
                      type="button"
                      onClick={() => {
                        setSelectedFood(food);
                        setServingQty('1');
                      }}
                      className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{food.name}</p>
                        <p className="text-xs text-zinc-400 font-mono-num">
                          {food.serving_size} {food.serving_unit} · {food.calories} kcal · P{' '}
                          {food.protein_g}g · C {food.carbs_g}g · F {food.fat_g}g
                        </p>
                      </div>
                      <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {pickerTab === 'database' && selectedFood && (
            <form onSubmit={handleLogSelectedFood} className="space-y-4">
              <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.03]">
                <p className="text-xs text-zinc-400">{selectedFood.category}</p>
                <p className="text-base font-bold text-white mt-0.5">{selectedFood.name}</p>
                <p className="text-xs text-zinc-400 font-mono-num mt-1">
                  Per {selectedFood.serving_size} {selectedFood.serving_unit}:{' '}
                  {selectedFood.calories} kcal · P {selectedFood.protein_g}g · C{' '}
                  {selectedFood.carbs_g}g · F {selectedFood.fat_g}g
                </p>
              </div>

              <FormField label="Servings / Quantity Multiplier">
                <input
                  type="number"
                  step="0.25"
                  min="0.1"
                  required
                  value={servingQty}
                  onChange={(e) => setServingQty(e.target.value)}
                  className={INPUT_CLASS}
                />
              </FormField>

              <div className="flex gap-3">
                <SecondaryButton onClick={() => setSelectedFood(null)}>Back</SecondaryButton>
                <PrimaryButton type="submit" loading={savingFood} className="flex-1">
                  Log {Math.round(selectedFood.calories * (parseFloat(servingQty) || 0))} kcal
                </PrimaryButton>
              </div>
            </form>
          )}

          {pickerTab === 'quick' && (
            <form onSubmit={handleQuickMacrosSubmit} className="space-y-3">
              <FormField label="Entry Label (Optional)">
                <input
                  type="text"
                  value={qmLabel}
                  onChange={(e) => setQmLabel(e.target.value)}
                  placeholder="e.g. Restaurant Thali / Cafe Meal"
                  className={INPUT_CLASS}
                />
              </FormField>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <FormField label="Protein (g)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={qmPro}
                    onChange={(e) => setQmPro(e.target.value)}
                    placeholder="0"
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Carbs (g)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={qmCarb}
                    onChange={(e) => setQmCarb(e.target.value)}
                    placeholder="0"
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Fat (g)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={qmFat}
                    onChange={(e) => setQmFat(e.target.value)}
                    placeholder="0"
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField label="Calories (auto from P/C/F if blank)">
                  <input
                    type="number"
                    min="0"
                    value={qmCal}
                    onChange={(e) => setQmCal(e.target.value)}
                    placeholder={String(
                      Math.round(
                        (parseFloat(qmPro) || 0) * 4 +
                          (parseFloat(qmCarb) || 0) * 4 +
                          (parseFloat(qmFat) || 0) * 9
                      )
                    )}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Fibre (g)">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={qmFibre}
                    onChange={(e) => setQmFibre(e.target.value)}
                    placeholder="0"
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <PrimaryButton type="submit" loading={savingFood} className="w-full">
                Quick Log Macros
              </PrimaryButton>
            </form>
          )}

          {pickerTab === 'favorites' && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {favorites.length === 0 ? (
                <EmptyState
                  icon={<Heart className="w-5 h-5" />}
                  title="No favourites yet"
                  description="Tap the heart icon on any logged food to save it here for rapid logging."
                />
              ) : (
                favorites.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => void handleLogFavorite(fav)}
                    className="w-full p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{fav.food_name}</p>
                      <p className="text-xs text-zinc-400 font-mono-num">
                        {fav.quantity} × {fav.serving_unit} · {Math.round(fav.calories)} kcal · P{' '}
                        {Math.round(fav.protein_g)}g
                      </p>
                    </div>
                    <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  </button>
                ))
              )}
            </div>
          )}

          {pickerTab === 'meals' && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {savedMeals.length === 0 ? (
                <EmptyState
                  icon={<Utensils className="w-5 h-5" />}
                  title="No saved meals yet"
                  description="Tap the bookmark icon on any meal card to save that combination of foods."
                />
              ) : (
                savedMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => void handleLogSavedMeal(meal)}
                      className="flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-white">{meal.name}</p>
                      <p className="text-xs text-zinc-400 font-mono-num">
                        {meal.items.length} items · {Math.round(meal.total_calories)} kcal · P{' '}
                        {Math.round(meal.total_protein_g)}g
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        await deleteSavedMeal(user.id, meal.id);
                        setSavedMeals((prev) => prev.filter((m) => m.id !== meal.id));
                      }}
                      aria-label={`Delete saved meal ${meal.name}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {pickerTab === 'custom' && (
            <form onSubmit={handleCreateAndLogCustomFood} className="space-y-3">
              <FormField label="Food Name">
                <input
                  type="text"
                  required
                  value={cfName}
                  onChange={(e) => setCfName(e.target.value)}
                  placeholder="e.g. Homemade Besan Chilla"
                  className={INPUT_CLASS}
                />
              </FormField>
              <div className="grid grid-cols-3 gap-2">
                <FormField label="Category">
                  <select
                    value={cfCat}
                    onChange={(e) => setCfCat(e.target.value as FoodCategory)}
                    className={INPUT_CLASS}
                  >
                    {FOOD_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Serving Size">
                  <input
                    type="number"
                    step="0.1"
                    value={cfSize}
                    onChange={(e) => setCfSize(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Unit">
                  <input
                    type="text"
                    value={cfUnit}
                    onChange={(e) => setCfUnit(e.target.value)}
                    placeholder="g / piece"
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <FormField label="Kcal">
                  <input
                    type="number"
                    value={cfCal}
                    onChange={(e) => setCfCal(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Prot (g)">
                  <input
                    type="number"
                    step="0.1"
                    value={cfPro}
                    onChange={(e) => setCfPro(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Carb (g)">
                  <input
                    type="number"
                    step="0.1"
                    value={cfCarb}
                    onChange={(e) => setCfCarb(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Fat (g)">
                  <input
                    type="number"
                    step="0.1"
                    value={cfFat}
                    onChange={(e) => setCfFat(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Fibre">
                  <input
                    type="number"
                    step="0.1"
                    value={cfFibre}
                    onChange={(e) => setCfFibre(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <PrimaryButton type="submit" loading={savingFood} className="w-full">
                Create & Log Food
              </PrimaryButton>
            </form>
          )}
        </div>
      </ModalSheet>

      {/* Edit Food Entry Modal */}
      <ModalSheet
        open={Boolean(editingLog)}
        onClose={() => setEditingLog(null)}
        title="Edit Food Quantity"
      >
        {editingLog && (
          <form onSubmit={handleSaveEditedLog} className="space-y-4">
            <p className="text-sm font-semibold text-white">{editingLog.food_name}</p>
            <FormField label={`Quantity (${editingLog.serving_unit})`}>
              <input
                type="number"
                step="0.25"
                min="0.1"
                required
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <PrimaryButton type="submit" className="w-full">
              Update Entry
            </PrimaryButton>
          </form>
        )}
      </ModalSheet>

      {/* Save Meal Combo Modal */}
      <ModalSheet
        open={Boolean(saveMealOpen)}
        onClose={() => setSaveMealOpen(null)}
        title="Save Meal Combo"
      >
        <form onSubmit={handleSaveMealCombo} className="space-y-4">
          <FormField label="Meal Name">
            <input
              type="text"
              required
              value={saveMealName}
              onChange={(e) => setSaveMealName(e.target.value)}
              placeholder="e.g. Post-Workout Paneer & Rice"
              className={INPUT_CLASS}
            />
          </FormField>
          <PrimaryButton type="submit" className="w-full">
            Save Meal Combo
          </PrimaryButton>
        </form>
      </ModalSheet>

      {/* Nutrition Targets Modal */}
      <ModalSheet
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        title="Daily Nutrition Targets"
      >
        <form onSubmit={handleSaveGoals} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Calories (kcal)">
              <input
                type="number"
                required
                value={gCal}
                onChange={(e) => setGCal(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Water Goal (ml)">
              <input
                type="number"
                required
                value={gWater}
                onChange={(e) => setGWater(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormField label="Protein (g)">
              <input
                type="number"
                required
                value={gPro}
                onChange={(e) => setGPro(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Carbs (g)">
              <input
                type="number"
                required
                value={gCarb}
                onChange={(e) => setGCarb(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Fat (g)">
              <input
                type="number"
                required
                value={gFat}
                onChange={(e) => setGFat(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Fibre (g)">
              <input
                type="number"
                required
                value={gFibre}
                onChange={(e) => setGFibre(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>
          <PrimaryButton type="submit" loading={savingGoals} className="w-full">
            Save Targets
          </PrimaryButton>
        </form>
      </ModalSheet>
    </AppShell>
  );
}
