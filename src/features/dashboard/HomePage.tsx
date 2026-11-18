import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Calendar,
  ChevronRight,
  Droplets,
  Dumbbell,
  Eye,
  EyeOff,
  Flame,
  Plus,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Utensils,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  ModalSheet,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { isSchemaMissingError } from '../../lib/supabase';
import { formatDuration, formatWeight, getLocalDateString } from '../../lib/units';
import { addWaterLog, fetchFoodLogsByDate, fetchWaterLogsRange } from '../../services/nutritionService';
import { DEFAULT_WIDGETS, saveUserWidgets } from '../../services/profileService';
import { fetchWorkoutSessions } from '../../services/workoutService';
import type {
  FoodLogRecord,
  UserWidget,
  WaterLogRecord,
  WorkoutSessionRecord,
} from '../../types/database';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function computeWeeklyStreak(sessions: WorkoutSessionRecord[]): {
  thisWeekCount: number;
  streakDays: number;
  weekDays: Array<{ label: string; date: string; trained: boolean }>;
} {
  const today = new Date();
  const trainedDates = new Set(sessions.map((s) => s.workout_date));
  const weekDays: Array<{ label: string; date: string; trained: boolean }> = [];

  for (let i = 6; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const dateStr = getLocalDateString(dt);
    weekDays.push({
      label: dt.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
      date: dateStr,
      trained: trainedDates.has(dateStr),
    });
  }

  let streakDays = 0;
  for (let i = 0; i < 30; i++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const dStr = getLocalDateString(dt);
    if (trainedDates.has(dStr)) {
      streakDays++;
    } else if (i > 0) {
      break;
    }
  }

  return {
    thisWeekCount: weekDays.filter((d) => d.trained).length,
    streakDays,
    weekDays,
  };
}

export function HomePage() {
  const navigate = useNavigate();
  const { user, profile, settings, nutritionGoals, widgets, setWidgetsState, schemaMissing } =
    useAuth();
  const { showToast } = useToast();

  const todayStr = getLocalDateString();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todayFoods, setTodayFoods] = useState<FoodLogRecord[]>([]);
  const [todayWater, setTodayWater] = useState<WaterLogRecord[]>([]);
  const [recentSessions, setRecentSessions] = useState<WorkoutSessionRecord[]>([]);
  const [waterSaving, setWaterSaving] = useState(false);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftWidgets, setDraftWidgets] = useState<UserWidget[]>([]);
  const [savingLayout, setSavingLayout] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    if (schemaMissing) {
      try {
        const [localFoods, localWater, localSessions] = await Promise.all([
          fetchFoodLogsByDate(user.id, todayStr).catch(() => []),
          fetchWaterLogsRange(user.id, todayStr, todayStr).catch(() => []),
          fetchWorkoutSessions(user.id, { limit: 14 }).catch(() => []),
        ]);
        setTodayFoods(localFoods);
        setTodayWater(localWater);
        setRecentSessions(localSessions);
      } catch {
        setTodayFoods([]);
        setTodayWater([]);
        setRecentSessions([]);
      }
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [foods, water, sessions] = await Promise.all([
        fetchFoodLogsByDate(user.id, todayStr),
        fetchWaterLogsRange(user.id, todayStr, todayStr),
        fetchWorkoutSessions(user.id, { limit: 14 }),
      ]);
      setTodayFoods(foods);
      setTodayWater(water);
      setRecentSessions(sessions);
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [schemaMissing, todayStr, user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totals = useMemo(() => {
    return todayFoods.reduce(
      (acc, f) => ({
        calories: acc.calories + Number(f.calories || 0),
        protein: acc.protein + Number(f.protein_g || 0),
        carbs: acc.carbs + Number(f.carbs_g || 0),
        fat: acc.fat + Number(f.fat_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayFoods]);

  const totalWaterMl = useMemo(
    () => todayWater.reduce((sum, w) => sum + Number(w.amount_ml || 0), 0),
    [todayWater]
  );

  const todaySessions = useMemo(
    () => recentSessions.filter((s) => s.workout_date === todayStr),
    [recentSessions, todayStr]
  );

  const weeklyStats = useMemo(() => computeWeeklyStreak(recentSessions), [recentSessions]);

  const handleQuickWater = async (ml: number) => {
    if (!user || waterSaving) return;
    setWaterSaving(true);
    try {
      const row = await addWaterLog(user.id, ml, todayStr);
      setTodayWater((prev) => [...prev, row]);
      showToast(`Logged +${ml} ml water to cloud.`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setWaterSaving(false);
    }
  };

  const openCustomizer = () => {
    const base =
      widgets.length > 0
        ? [...widgets].sort((a, b) => a.sort_order - b.sort_order)
        : DEFAULT_WIDGETS.map((w, idx) => ({
            id: `w-${idx}`,
            user_id: user?.id ?? '',
            widget_key: w.widget_key,
            title: w.title,
            is_visible: true,
            sort_order: w.sort_order,
          }));
    setDraftWidgets(base);
    setCustomizeOpen(true);
  };

  const moveDraftWidget = (index: number, dir: -1 | 1) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= draftWidgets.length) return;
    const copy = [...draftWidgets];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    setDraftWidgets(copy);
  };

  const handleSaveWidgets = async () => {
    if (!user) return;
    setSavingLayout(true);
    try {
      const saved = await saveUserWidgets(user.id, draftWidgets);
      setWidgetsState(saved);
      setCustomizeOpen(false);
      showToast('Dashboard layout saved to cloud.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingLayout(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!user) return;
    setSavingLayout(true);
    try {
      const defaults = DEFAULT_WIDGETS.map((w) => ({
        ...w,
        is_visible: true,
      }));
      const saved = await saveUserWidgets(user.id, defaults);
      setWidgetsState(saved);
      setDraftWidgets(saved);
      showToast('Default layout restored and saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingLayout(false);
    }
  };

  const orderedVisibleWidgets = useMemo(() => {
    const list =
      widgets.length > 0
        ? widgets
        : DEFAULT_WIDGETS.map((w, idx) => ({
            id: `w-${idx}`,
            user_id: '',
            widget_key: w.widget_key,
            title: w.title,
            is_visible: true,
            sort_order: w.sort_order,
          }));
    return [...list].filter((w) => w.is_visible).sort((a, b) => a.sort_order - b.sort_order);
  }, [widgets]);

  const formattedToday = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const firstName = profile?.full_name?.trim().split(' ')[0] || 'Athlete';

  const renderWidget = (key: string) => {
    switch (key) {
      case 'quick_actions':
        return (
          <div key={key} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => navigate('/workout/active')}
              className="min-h-[56px] p-3.5 rounded-2xl border border-white/10 flex items-center gap-3 text-left transition-transform active:scale-[0.98]"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }}
            >
              <Dumbbell className="w-5 h-5 shrink-0" />
              <span className="text-sm font-bold leading-tight">Start Workout</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/nutrition')}
              className="min-h-[56px] p-3.5 rounded-2xl border border-white/10 bg-[#111318] hover:border-white/20 flex items-center gap-3 text-left text-white transition-colors"
            >
              <Utensils className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold leading-tight">Log Meal</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/progress')}
              className="min-h-[56px] p-3.5 rounded-2xl border border-white/10 bg-[#111318] hover:border-white/20 flex items-center gap-3 text-left text-white transition-colors"
            >
              <Scale className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold leading-tight">Log Weight</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/coach')}
              className="min-h-[56px] p-3.5 rounded-2xl border border-white/10 bg-[#111318] hover:border-white/20 flex items-center gap-3 text-left text-white transition-colors"
            >
              <Bot className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="text-sm font-semibold leading-tight">Ask AI Coach</span>
            </button>
          </div>
        );

      case 'calories_macros': {
        const remainingCal = Math.max(0, nutritionGoals.calories_target - Math.round(totals.calories));
        return (
          <Card key={key}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-zinc-400">Daily Calories & Macros</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-mono-num text-3xl font-bold text-white">
                    {Math.round(totals.calories)}
                  </span>
                  <span className="font-mono-num text-sm text-zinc-400">
                    / {nutritionGoals.calories_target} kcal
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400">
                  <Flame className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  Remaining
                </span>
                <p className="font-mono-num text-base font-bold text-white mt-0.5">
                  {remainingCal} kcal
                </p>
              </div>
            </div>

            <ProgressBar
              value={totals.calories}
              max={nutritionGoals.calories_target}
              heightClass="h-2.5"
            />

            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-white/[0.06]">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">Protein</span>
                  <span className="font-mono-num font-semibold text-white">
                    {Math.round(totals.protein)}/{nutritionGoals.protein_target_g}g
                  </span>
                </div>
                <ProgressBar
                  value={totals.protein}
                  max={nutritionGoals.protein_target_g}
                  color="#C4F82A"
                  heightClass="h-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">Carbs</span>
                  <span className="font-mono-num font-semibold text-white">
                    {Math.round(totals.carbs)}/{nutritionGoals.carbs_target_g}g
                  </span>
                </div>
                <ProgressBar
                  value={totals.carbs}
                  max={nutritionGoals.carbs_target_g}
                  color="#38BDF8"
                  heightClass="h-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">Fats</span>
                  <span className="font-mono-num font-semibold text-white">
                    {Math.round(totals.fat)}/{nutritionGoals.fat_target_g}g
                  </span>
                </div>
                <ProgressBar
                  value={totals.fat}
                  max={nutritionGoals.fat_target_g}
                  color="#F59E0B"
                  heightClass="h-1.5"
                />
              </div>
            </div>
          </Card>
        );
      }

      case 'body_weight': {
        const cur = profile?.current_weight_kg;
        const tgt = profile?.target_weight_kg;
        const diff =
          cur !== null && cur !== undefined && tgt !== null && tgt !== undefined
            ? Math.round((tgt - cur) * 10) / 10
            : null;
        return (
          <Card key={key} onClick={() => navigate('/progress')}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-zinc-400">Body Weight</p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="font-mono-num text-2xl font-bold text-white">
                    {formatWeight(cur, settings.weight_unit)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    Target {formatWeight(tgt, settings.weight_unit)}
                  </span>
                </div>
                {diff !== null && (
                  <p className="text-xs text-zinc-400 mt-1 font-mono-num">
                    {diff === 0
                      ? 'At target weight'
                      : `${diff > 0 ? '+' : ''}${formatWeight(diff, settings.weight_unit)} to goal`}
                  </p>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" />
            </div>
          </Card>
        );
      }

      case 'hydration':
        return (
          <Card key={key}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-medium text-zinc-400">Water Intake</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-mono-num text-2xl font-bold text-white">
                    {totalWaterMl} ml
                  </span>
                  <span className="font-mono-num text-xs text-zinc-400">
                    / {nutritionGoals.water_target_ml} ml
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={waterSaving}
                  onClick={() => void handleQuickWater(250)}
                  className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  250 ml
                </button>
                <button
                  type="button"
                  disabled={waterSaving}
                  onClick={() => void handleQuickWater(500)}
                  className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  500 ml
                </button>
              </div>
            </div>
            <ProgressBar
              value={totalWaterMl}
              max={nutritionGoals.water_target_ml}
              color="#38BDF8"
              heightClass="h-2"
            />
          </Card>
        );

      case 'today_workout':
        return (
          <Card key={key}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-400">Today&apos;s Workout</p>
                {todaySessions.length > 0 ? (
                  <>
                    <h3 className="font-display text-base font-bold text-white mt-1 truncate">
                      {todaySessions[0].workout_name}
                    </h3>
                    <p className="font-mono-num text-xs text-zinc-400 mt-1">
                      {formatDuration(todaySessions[0].duration_seconds)} ·{' '}
                      {formatWeight(todaySessions[0].total_volume_kg, settings.weight_unit)} total
                      volume
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-display text-base font-bold text-white mt-1">
                      No session logged yet today
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Start from a split template or build a custom workout.
                    </p>
                  </>
                )}
              </div>
              <PrimaryButton
                onClick={() =>
                  todaySessions.length > 0
                    ? navigate(`/workout/session/${todaySessions[0].id}`)
                    : navigate('/workout/active')
                }
              >
                {todaySessions.length > 0 ? 'View' : 'Train'}
              </PrimaryButton>
            </div>
          </Card>
        );

      case 'weekly_streak':
        return (
          <Card key={key}>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-zinc-400">Weekly Activity & Streak</p>
                <p className="font-mono-num text-xl font-bold text-white mt-1">
                  {weeklyStats.thisWeekCount} workouts{' '}
                  <span className="text-sm font-normal text-zinc-400">
                    in last 7 days · {weeklyStats.streakDays}d streak
                  </span>
                </p>
              </div>
              <Calendar className="w-5 h-5 text-zinc-500 shrink-0" />
            </div>

            <div className="grid grid-cols-7 gap-2">
              {weeklyStats.weekDays.map((day) => (
                <div key={day.date} className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-full h-9 rounded-xl border flex items-center justify-center text-xs font-mono-num font-semibold"
                    style={{
                      backgroundColor: day.trained ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: day.trained ? 'var(--accent-primary)' : 'var(--border-subtle)',
                      color: day.trained ? 'var(--accent-primary)' : '#71717A',
                    }}
                  >
                    {day.trained ? '✓' : '—'}
                  </div>
                  <span className="text-[11px] text-zinc-400">{day.label}</span>
                </div>
              ))}
            </div>
          </Card>
        );

      case 'recent_workouts':
        return (
          <Card key={key}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-medium text-zinc-400">Recent Workout History</p>
              <button
                type="button"
                onClick={() => navigate('/workout/history')}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                View all
              </button>
            </div>
            {recentSessions.length === 0 ? (
              <EmptyState
                icon={<Dumbbell className="w-5 h-5" />}
                title="No workouts recorded yet"
                description="Completed workouts are stored permanently in your cloud account."
                action={
                  <SecondaryButton onClick={() => navigate('/workout/active')}>
                    Log First Workout
                  </SecondaryButton>
                }
              />
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentSessions.slice(0, 4).map((sess) => (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => navigate(`/workout/session/${sess.id}`)}
                    className="w-full min-h-[56px] py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] rounded-xl px-2 -mx-2 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {sess.workout_name}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono-num mt-0.5">
                        {sess.workout_date} · {sess.workout_session_exercises?.length ?? 0} exercises
                        · {formatWeight(sess.total_volume_kg, settings.weight_unit)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <AppShell
      title="Home"
      headerAction={
        <button
          type="button"
          onClick={openCustomizer}
          className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Customize</span>
        </button>
      }
    >
      <div className="space-y-5">
        {/* Greeting Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <p className="text-xs text-zinc-400">{formattedToday}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mt-0.5">
              {getGreeting()}, {firstName}
            </h1>
          </div>
          <p className="text-xs text-zinc-400 capitalize">
            Goal: {(profile?.fitness_goal ?? 'muscle_gain').replace('_', ' ')}
          </p>
        </div>

        {error && <ErrorBanner message={error} onRetry={loadDashboard} />}

        {loading ? (
          <LoadingBlock label="Syncing dashboard from cloud..." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {orderedVisibleWidgets.map((w) => {
              const fullSpan =
                w.widget_key === 'quick_actions' ||
                w.widget_key === 'calories_macros' ||
                w.widget_key === 'recent_workouts';
              return (
                <div key={w.widget_key} className={fullSpan ? 'lg:col-span-12' : 'lg:col-span-6'}>
                  {renderWidget(w.widget_key)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Widget Customizer Sheet */}
      <ModalSheet
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize Dashboard Layout"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Show, hide, and reorder dashboard widgets. Changes are saved to your cloud account.
          </p>

          <div className="space-y-2">
            {draftWidgets.map((w, idx) => (
              <div
                key={w.widget_key}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02]"
              >
                <span className="text-sm font-medium text-white truncate">{w.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveDraftWidget(idx, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${w.title} up`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDraftWidget(idx, 1)}
                    disabled={idx === draftWidgets.length - 1}
                    aria-label={`Move ${w.title} down`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftWidgets((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, is_visible: !item.is_visible } : item
                        )
                      )
                    }
                    aria-label={`Toggle ${w.title} visibility`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-white/5"
                    style={{ color: w.is_visible ? 'var(--accent-primary)' : '#71717A' }}
                  >
                    {w.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryButton onClick={handleSaveWidgets} loading={savingLayout} className="flex-1">
              Save Layout
            </PrimaryButton>
            <SecondaryButton onClick={handleRestoreDefaults} disabled={savingLayout}>
              <RotateCcw className="w-4 h-4" />
              Restore Default
            </SecondaryButton>
          </div>
        </div>
      </ModalSheet>
    </AppShell>
  );
}
