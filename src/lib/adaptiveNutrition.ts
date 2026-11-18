import { getLocalDateString } from './units';
import type {
  ActivityLevel,
  BiologicalSex,
  DietaryPreference,
  ExpenditureConfidence,
  FitnessGoal,
  FoodLogRecord,
  MacroStyle,
  Profile,
  WeightLogRecord,
} from '../types/database';

const KCAL_PER_KG_TISSUE = 7700;

export interface WeightTrendPoint {
  date: string;
  scaleKg: number | null;
  trendKg: number;
}

export interface WeightTrendSummary {
  points: WeightTrendPoint[];
  latestScaleKg: number | null;
  latestTrendKg: number | null;
  weeklyTrendChangeKg: number | null;
  weeklyTrendPct: number | null;
  weighInCount: number;
}

export interface ExpenditureEstimate {
  baselineTdee: number;
  estimatedTdee: number;
  avgLoggedCalories: number | null;
  pairedDays: number;
  weightSpanDays: number;
  weeklyTrendChangeKg: number | null;
  confidence: ExpenditureConfidence;
  confidenceLabel: string;
  explanation: string;
  disclaimer: string;
  usedProfileDefaults: boolean;
}

export interface MacroRecommendation {
  caloriesTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  fibreTargetG: number;
  waterTargetMl: number;
  dailyEnergyDelta: number;
  weeklyRatePct: number;
  projectedWeeklyKg: number;
  proteinPerKg: number;
}

export interface DailyNutritionPoint {
  date: string;
  label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  hasLogs: boolean;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

function parseDateMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function diffDays(a: string, b: string): number {
  return Math.round((parseDateMs(b) - parseDateMs(a)) / 86_400_000);
}

function addDays(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return getLocalDateString(dt);
}

export function getDefaultWeeklyRatePct(goal: FitnessGoal): number {
  switch (goal) {
    case 'fat_loss':
      return -0.6;
    case 'recomposition':
      return -0.1;
    case 'muscle_gain':
      return 0.25;
    case 'strength':
      return 0.2;
    case 'endurance':
      return 0;
  }
}

/**
 * Exponentially Weighted Moving Average (EWMA) over daily scale weight logs.
 * Smooths water-weight / glycogen swings into a reliable trend weight curve.
 */
export function computeWeightTrendSeries(
  weightLogs: WeightLogRecord[],
  fallbackWeightKg?: number | null
): WeightTrendSummary {
  const validLogs = weightLogs
    .filter((w) => Number.isFinite(Number(w.weight_kg)) && Number(w.weight_kg) > 20 && Boolean(w.logged_date))
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date));

  if (validLogs.length === 0) {
    const base =
      fallbackWeightKg && Number.isFinite(fallbackWeightKg) && fallbackWeightKg > 20
        ? Math.round(fallbackWeightKg * 100) / 100
        : null;
    return {
      points: [],
      latestScaleKg: base,
      latestTrendKg: base,
      weeklyTrendChangeKg: null,
      weeklyTrendPct: null,
      weighInCount: 0,
    };
  }

  // Collapse multiple entries on the same date to their mean
  const byDate = new Map<string, number[]>();
  for (const log of validLogs) {
    const list = byDate.get(log.logged_date) ?? [];
    list.push(Number(log.weight_kg));
    byDate.set(log.logged_date, list);
  }

  const dailyEntries = Array.from(byDate.entries())
    .map(([date, vals]) => ({
      date,
      scaleKg: vals.reduce((s, v) => s + v, 0) / vals.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const firstDate = dailyEntries[0].date;
  const lastDate = dailyEntries[dailyEntries.length - 1].date;
  const entryMap = new Map(dailyEntries.map((d) => [d.date, d.scaleKg]));

  const totalSpan = Math.max(0, diffDays(firstDate, lastDate));
  // Cap dense timeline backfill to 180 days max for mobile rendering performance
  const startDate = totalSpan > 180 ? addDays(lastDate, -180) : firstDate;

  let seedScale = dailyEntries[0].scaleKg;
  if (totalSpan > 180) {
    const prior = dailyEntries.filter((d) => d.date <= startDate);
    if (prior.length > 0) {
      seedScale = prior[prior.length - 1].scaleKg;
    }
  }

  const points: WeightTrendPoint[] = [];
  let trend = seedScale;
  const dailyAlpha = 0.14; // ~13-day effective time constant, responsive without whiplash

  const daysToIterate = Math.max(0, diffDays(startDate, lastDate));
  for (let i = 0; i <= daysToIterate; i++) {
    const date = addDays(startDate, i);
    const scaleVal = entryMap.get(date) ?? null;
    if (scaleVal !== null) {
      trend = i === 0 ? scaleVal : trend + dailyAlpha * (scaleVal - trend);
    }
    points.push({
      date,
      scaleKg: scaleVal !== null ? Math.round(scaleVal * 100) / 100 : null,
      trendKg: Math.round(trend * 100) / 100,
    });
  }

  const latestPoint = points[points.length - 1];
  const latestScaleKg = dailyEntries[dailyEntries.length - 1].scaleKg;
  const latestTrendKg = latestPoint.trendKg;

  let weeklyTrendChangeKg: number | null = null;
  let weeklyTrendPct: number | null = null;

  if (dailyEntries.length >= 2 && points.length >= 4) {
    const lookbackIdx = Math.max(0, points.length - 8);
    const refPoint = points[lookbackIdx];
    const span = Math.max(1, diffDays(refPoint.date, latestPoint.date));
    const rawDelta = latestPoint.trendKg - refPoint.trendKg;
    weeklyTrendChangeKg = Math.round(((rawDelta / span) * 7) * 100) / 100;
    if (refPoint.trendKg > 0) {
      weeklyTrendPct = Math.round(((weeklyTrendChangeKg / refPoint.trendKg) * 100) * 100) / 100;
    }
  }

  return {
    points,
    latestScaleKg: Math.round(latestScaleKg * 100) / 100,
    latestTrendKg,
    weeklyTrendChangeKg,
    weeklyTrendPct,
    weighInCount: validLogs.length,
  };
}

/**
 * Mifflin-St Jeor baseline BMR & TDEE estimate from user profile.
 */
export function computeBaselineTDEE(
  profile: Profile | null,
  biologicalSex: BiologicalSex = 'unspecified',
  overrideWeightKg?: number | null
): { bmr: number; tdee: number; usedDefaults: boolean; weightKg: number } {
  const weightKg =
    overrideWeightKg && overrideWeightKg > 20
      ? overrideWeightKg
      : profile?.current_weight_kg && profile.current_weight_kg > 20
      ? Number(profile.current_weight_kg)
      : 72;
  const heightCm =
    profile?.height_cm && profile.height_cm > 100 ? Number(profile.height_cm) : 173;
  const age = profile?.age && profile.age >= 13 && profile.age <= 100 ? Number(profile.age) : 26;
  const activity: ActivityLevel = profile?.activity_level ?? 'moderate';

  const usedDefaults =
    !(overrideWeightKg && overrideWeightKg > 20) &&
    (!profile?.current_weight_kg || !profile?.height_cm || !profile?.age);

  const sexOffset = biologicalSex === 'male' ? 5 : biologicalSex === 'female' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const multiplier = ACTIVITY_MULTIPLIERS[activity] ?? 1.55;
  const tdee = Math.max(1200, Math.round(bmr * multiplier));

  return {
    bmr: Math.round(bmr),
    tdee,
    usedDefaults,
    weightKg,
  };
}

/**
 * MacroFactor-style adaptive expenditure estimation:
 * Combines trailing logged calorie intake + EWMA weight trend rate to refine
 * TDEE away from static formula assumptions once >= 7 paired days exist.
 */
export function computeAdaptiveExpenditure(params: {
  profile: Profile | null;
  weightLogs: WeightLogRecord[];
  foodLogs: FoodLogRecord[];
  biologicalSex?: BiologicalSex;
  referenceDate?: string;
  windowDays?: number;
}): ExpenditureEstimate {
  const {
    profile,
    weightLogs,
    foodLogs,
    biologicalSex = 'unspecified',
    referenceDate = getLocalDateString(),
    windowDays = 21,
  } = params;

  const weightSummary = computeWeightTrendSeries(weightLogs, profile?.current_weight_kg);
  const { tdee: baselineTdee, usedDefaults } = computeBaselineTDEE(
    profile,
    biologicalSex,
    weightSummary.latestTrendKg ?? weightSummary.latestScaleKg
  );

  const startWindowDate = addDays(referenceDate, -(windowDays - 1));

  // Aggregate daily calories within analysis window
  const caloriesByDate = new Map<string, number>();
  for (const log of foodLogs) {
    if (log.logged_date >= startWindowDate && log.logged_date <= referenceDate) {
      caloriesByDate.set(
        log.logged_date,
        (caloriesByDate.get(log.logged_date) ?? 0) + Number(log.calories || 0)
      );
    }
  }

  // Filter out partial/stub days (< 400 kcal) so forgetting to log dinner doesn't distort TDEE
  const completeIntakeDays = Array.from(caloriesByDate.entries())
    .filter(([, kcal]) => kcal >= 400)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const pairedDays = completeIntakeDays.length;
  const avgLoggedCalories =
    pairedDays > 0
      ? Math.round(completeIntakeDays.reduce((s, [, k]) => s + k, 0) / pairedDays)
      : null;

  const windowTrendPoints = weightSummary.points.filter(
    (p) => p.date >= startWindowDate && p.date <= referenceDate
  );

  const weightSpanDays =
    windowTrendPoints.length >= 2
      ? diffDays(
          windowTrendPoints[0].date,
          windowTrendPoints[windowTrendPoints.length - 1].date
        )
      : 0;

  const disclaimer =
    'Estimated from your logged intake and smoothed weight trend (Mifflin-St Jeor + energy balance model). Fitness guidance only — not medical advice.';

  if (pairedDays < 7 || weightSpanDays < 6 || avgLoggedCalories === null) {
    return {
      baselineTdee,
      estimatedTdee: baselineTdee,
      avgLoggedCalories,
      pairedDays,
      weightSpanDays,
      weeklyTrendChangeKg: weightSummary.weeklyTrendChangeKg,
      confidence: 'formula',
      confidenceLabel: 'Formula Baseline',
      explanation: `Log at least 7 nutrition days + weigh-ins spanning 7+ days (${pairedDays}/7 food days, ${weightSpanDays}/7 weight days) to unlock adaptive expenditure.`,
      disclaimer,
      usedProfileDefaults: usedDefaults,
    };
  }

  const startTrend = windowTrendPoints[0].trendKg;
  const endTrend = windowTrendPoints[windowTrendPoints.length - 1].trendKg;
  const trendDeltaKg = endTrend - startTrend;

  // Energy balance equation: TDEE = Intake - (WeightChangeKg * 7700 / Days)
  const rawObservedTdee =
    avgLoggedCalories - (trendDeltaKg * KCAL_PER_KG_TISSUE) / Math.max(1, weightSpanDays);

  // Guard against extreme sensor/logging noise
  const clampedObserved = Math.min(
    baselineTdee + 950,
    Math.max(Math.max(1150, baselineTdee - 950), rawObservedTdee)
  );

  // Adaptive blend increases smoothly with paired days (7..14+ days)
  const isFullAdaptive = pairedDays >= 14 && weightSpanDays >= 12;
  const blendWeight = isFullAdaptive
    ? 0.85
    : 0.35 + ((Math.min(14, pairedDays) - 7) / 7) * 0.4;

  const estimatedTdee = Math.round(
    baselineTdee * (1 - blendWeight) + clampedObserved * blendWeight
  );

  const weeklyChangeRate = Math.round(((trendDeltaKg / weightSpanDays) * 7) * 100) / 100;

  return {
    baselineTdee,
    estimatedTdee,
    avgLoggedCalories,
    pairedDays,
    weightSpanDays,
    weeklyTrendChangeKg: weeklyChangeRate,
    confidence: isFullAdaptive ? 'adaptive' : 'calibrating',
    confidenceLabel: isFullAdaptive ? 'Adaptive Data-Driven' : 'Calibrating',
    explanation: `Calculated from ${pairedDays} logged food days (avg ${avgLoggedCalories} kcal/d) and ${weightSpanDays}-day trend change (${weeklyChangeRate >= 0 ? '+' : ''}${weeklyChangeRate.toFixed(2)} kg/wk).`,
    disclaimer,
    usedProfileDefaults: usedDefaults,
  };
}

/**
 * Generates goal-aligned calorie, protein, carb, fat, fibre, and hydration targets.
 * Guarantees exact calorie consistency: P*4 + C*4 + F*9 == caloriesTarget.
 */
export function generateMacroRecommendation(params: {
  estimatedTdee: number;
  weightKg: number;
  fitnessGoal: FitnessGoal;
  weeklyRatePct: number;
  macroStyle: MacroStyle;
  dietaryPreference?: DietaryPreference;
}): MacroRecommendation {
  const {
    estimatedTdee,
    weightKg,
    fitnessGoal,
    weeklyRatePct,
    macroStyle,
    dietaryPreference = 'omnivore',
  } = params;

  const safeWeight = Math.max(35, Math.min(220, weightKg || 72));
  const clampedRate = Math.max(-1.25, Math.min(0.75, weeklyRatePct));

  const projectedWeeklyKg = Math.round((safeWeight * (clampedRate / 100)) * 100) / 100;
  const dailyEnergyDelta = Math.round((projectedWeeklyKg * KCAL_PER_KG_TISSUE) / 7);
  const rawTargetCal = Math.max(1200, Math.round(estimatedTdee + dailyEnergyDelta));

  // Protein factor per kg body weight
  let proteinPerKg = 2.0;
  if (macroStyle === 'high_protein') {
    proteinPerKg = 2.25;
  } else if (macroStyle === 'high_carb') {
    proteinPerKg = fitnessGoal === 'endurance' ? 1.75 : 1.9;
  } else if (macroStyle === 'low_carb') {
    proteinPerKg = 2.15;
  } else {
    proteinPerKg = fitnessGoal === 'fat_loss' ? 2.15 : fitnessGoal === 'endurance' ? 1.8 : 2.0;
  }

  // Slightly moderate vegan protein multiplier when carbs/legumes naturally carry higher share
  if (dietaryPreference === 'vegan' && macroStyle === 'balanced') {
    proteinPerKg = Math.max(1.75, proteinPerKg - 0.15);
  }

  let proteinTargetG = Math.round(safeWeight * proteinPerKg);
  // Keep protein under 45% of total calories so fat & carbs remain viable
  const maxProteinG = Math.floor((rawTargetCal * 0.45) / 4);
  proteinTargetG = Math.max(60, Math.min(proteinTargetG, maxProteinG));

  // Fat target share
  const fatPct =
    macroStyle === 'low_carb'
      ? 0.38
      : macroStyle === 'high_carb'
      ? 0.22
      : 0.27;
  const minFatG = Math.max(35, Math.round(safeWeight * 0.6));
  const maxFatG = Math.floor(((rawTargetCal - proteinTargetG * 4) * 0.75) / 9);
  const fatTargetG = Math.max(
    minFatG,
    Math.min(maxFatG, Math.round((rawTargetCal * fatPct) / 9))
  );

  // Remaining energy allocated to carbs
  const remainingKcal = Math.max(120, rawTargetCal - proteinTargetG * 4 - fatTargetG * 9);
  const carbsTargetG = Math.max(30, Math.round(remainingKcal / 4));

  // Exact macro-consistent total energy
  const caloriesTarget = proteinTargetG * 4 + carbsTargetG * 4 + fatTargetG * 9;
  const fibreTargetG = Math.max(24, Math.min(55, Math.round((caloriesTarget / 1000) * 14)));
  const waterTargetMl = Math.max(2500, Math.round((safeWeight * 40) / 100) * 100);

  return {
    caloriesTarget,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    fibreTargetG,
    waterTargetMl,
    dailyEnergyDelta,
    weeklyRatePct: clampedRate,
    projectedWeeklyKg,
    proteinPerKg: Math.round((proteinTargetG / safeWeight) * 100) / 100,
  };
}

/**
 * Builds daily nutrition rollup series for a date range (for 7-Day Insights).
 */
export function computeDailyNutritionSeries(
  foodLogs: FoodLogRecord[],
  fromDate: string,
  toDate: string
): DailyNutritionPoint[] {
  const byDate = new Map<
    string,
    { calories: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; count: number }
  >();

  for (const log of foodLogs) {
    if (log.logged_date < fromDate || log.logged_date > toDate) continue;
    const prev = byDate.get(log.logged_date) ?? {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fibre_g: 0,
      count: 0,
    };
    prev.calories += Number(log.calories || 0);
    prev.protein_g += Number(log.protein_g || 0);
    prev.carbs_g += Number(log.carbs_g || 0);
    prev.fat_g += Number(log.fat_g || 0);
    prev.fibre_g += Number(log.fibre_g || 0);
    prev.count += 1;
    byDate.set(log.logged_date, prev);
  }

  const days = Math.max(0, diffDays(fromDate, toDate));
  const series: DailyNutritionPoint[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(fromDate, i);
    const agg = byDate.get(date);
    series.push({
      date,
      label: date.slice(5),
      calories: Math.round(agg?.calories ?? 0),
      protein_g: Math.round(agg?.protein_g ?? 0),
      carbs_g: Math.round(agg?.carbs_g ?? 0),
      fat_g: Math.round(agg?.fat_g ?? 0),
      fibre_g: Math.round(agg?.fibre_g ?? 0),
      hasLogs: Boolean(agg && agg.count > 0),
    });
  }
  return series;
}
