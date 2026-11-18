import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Info,
  Scale,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  FormField,
  INPUT_CLASS,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
} from '../ui/Primitives';
import {
  computeAdaptiveExpenditure,
  computeWeightTrendSeries,
  generateMacroRecommendation,
  getDefaultWeeklyRatePct,
} from '../../lib/adaptiveNutrition';
import {
  formatWeight,
  getLocalDateString,
  toCanonicalWeightKg,
  toDisplayWeight,
} from '../../lib/units';
import type {
  BiologicalSex,
  FitnessGoal,
  FoodLogRecord,
  MacroStyle,
  NutritionCheckinRecord,
  NutritionCoachPrefs,
  NutritionGoals,
  Profile,
  UserSettings,
  WeightLogRecord,
} from '../../types/database';

interface NutritionCoachPanelProps {
  profile: Profile | null;
  settings: UserSettings;
  nutritionGoals: NutritionGoals;
  foodLogsRange: FoodLogRecord[];
  weightLogs: WeightLogRecord[];
  coachPrefs: NutritionCoachPrefs;
  checkins: NutritionCheckinRecord[];
  selectedDate: string;
  onUpdatePrefs: (
    updates: Partial<
      Pick<
        NutritionCoachPrefs,
        'biological_sex' | 'macro_style' | 'weekly_rate_pct' | 'auto_apply_checkins'
      >
    >
  ) => Promise<void>;
  onQuickWeighIn: (weightKg: number, dateStr: string) => Promise<void>;
  onApplyCheckin: (params: {
    checkin: Omit<NutritionCheckinRecord, 'id' | 'user_id' | 'created_at'>;
    goals: Omit<NutritionGoals, 'id' | 'user_id'>;
  }) => Promise<void>;
}

const MACRO_STYLES: Array<{ id: MacroStyle; label: string; hint: string }> = [
  { id: 'balanced', label: 'Balanced', hint: '27% fat · even carb fuel' },
  { id: 'high_protein', label: 'High Protein', hint: '2.25 g/kg protein priority' },
  { id: 'high_carb', label: 'High Carb', hint: '22% fat · training glycogen' },
  { id: 'low_carb', label: 'Low Carb', hint: '38% fat · controlled carbs' },
];

const SEX_OPTIONS: Array<{ id: BiologicalSex; label: string }> = [
  { id: 'unspecified', label: 'Neutral' },
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

const GOAL_LABELS: Record<FitnessGoal, string> = {
  fat_loss: 'Fat Loss',
  muscle_gain: 'Muscle Gain',
  recomposition: 'Recomposition',
  strength: 'Strength',
  endurance: 'Endurance',
};

export function NutritionCoachPanel({
  profile,
  settings,
  nutritionGoals,
  foodLogsRange,
  weightLogs,
  coachPrefs,
  checkins,
  selectedDate,
  onUpdatePrefs,
  onQuickWeighIn,
  onApplyCheckin,
}: NutritionCoachPanelProps) {
  const [weighInInput, setWeighInInput] = useState('');
  const [weighInSaving, setWeighInSaving] = useState(false);
  const [applyingCheckin, setApplyingCheckin] = useState(false);

  const fitnessGoal: FitnessGoal = profile?.fitness_goal ?? 'fat_loss';
  const weightUnit = settings.weight_unit;

  const weightSummary = useMemo(
    () => computeWeightTrendSeries(weightLogs, profile?.current_weight_kg),
    [weightLogs, profile?.current_weight_kg]
  );

  const expenditure = useMemo(
    () =>
      computeAdaptiveExpenditure({
        profile,
        weightLogs,
        foodLogs: foodLogsRange,
        biologicalSex: coachPrefs.biological_sex,
        referenceDate: selectedDate,
        windowDays: 21,
      }),
    [profile, weightLogs, foodLogsRange, coachPrefs.biological_sex, selectedDate]
  );

  const activeWeightKg =
    weightSummary.latestTrendKg ??
    weightSummary.latestScaleKg ??
    profile?.current_weight_kg ??
    72;

  const recommendation = useMemo(
    () =>
      generateMacroRecommendation({
        estimatedTdee: expenditure.estimatedTdee,
        weightKg: activeWeightKg,
        fitnessGoal,
        weeklyRatePct: coachPrefs.weekly_rate_pct,
        macroStyle: coachPrefs.macro_style,
        dietaryPreference: profile?.dietary_preference,
      }),
    [
      expenditure.estimatedTdee,
      activeWeightKg,
      fitnessGoal,
      coachPrefs.weekly_rate_pct,
      coachPrefs.macro_style,
      profile?.dietary_preference,
    ]
  );

  const chartData = useMemo(() => {
    const recent = weightSummary.points.slice(-30);
    return recent.map((p) => ({
      date: p.date.slice(5),
      scale: p.scaleKg !== null ? toDisplayWeight(p.scaleKg, weightUnit) : null,
      trend: toDisplayWeight(p.trendKg, weightUnit),
    }));
  }, [weightSummary.points, weightUnit]);

  const handleWeighInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = parseFloat(weighInInput);
    if (!Number.isFinite(raw) || raw <= 20) return;
    setWeighInSaving(true);
    try {
      const canonicalKg = toCanonicalWeightKg(raw, weightUnit);
      await onQuickWeighIn(canonicalKg, getLocalDateString());
      setWeighInInput('');
    } finally {
      setWeighInSaving(false);
    }
  };

  const handleRunCheckin = async () => {
    setApplyingCheckin(true);
    try {
      await onApplyCheckin({
        checkin: {
          checkin_date: getLocalDateString(),
          trend_weight_kg: weightSummary.latestTrendKg,
          estimated_tdee: expenditure.estimatedTdee,
          baseline_tdee: expenditure.baselineTdee,
          confidence: expenditure.confidence,
          paired_days: expenditure.pairedDays,
          recommended_calories: recommendation.caloriesTarget,
          recommended_protein_g: recommendation.proteinTargetG,
          recommended_carbs_g: recommendation.carbsTargetG,
          recommended_fat_g: recommendation.fatTargetG,
          recommended_fibre_g: recommendation.fibreTargetG,
          notes: `${GOAL_LABELS[fitnessGoal]} · ${coachPrefs.macro_style.replace('_', ' ')} (${coachPrefs.weekly_rate_pct >= 0 ? '+' : ''}${coachPrefs.weekly_rate_pct.toFixed(2)}%/wk)`,
        },
        goals: {
          calories_target: recommendation.caloriesTarget,
          protein_target_g: recommendation.proteinTargetG,
          carbs_target_g: recommendation.carbsTargetG,
          fat_target_g: recommendation.fatTargetG,
          fibre_target_g: recommendation.fibreTargetG,
          water_target_ml: recommendation.waterTargetMl,
        },
      });
    } finally {
      setApplyingCheckin(false);
    }
  };

  const ratePresets = [
    { label: '-0.8% Cut', value: -0.8 },
    { label: '-0.5% Cut', value: -0.5 },
    { label: '0% Maintain', value: 0 },
    { label: '+0.25% Gain', value: 0.25 },
  ];

  const tdeeDiff = expenditure.estimatedTdee - expenditure.baselineTdee;

  return (
    <div className="space-y-4">
      {/* Expenditure Summary Card */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Estimated Daily Expenditure (TDEE)</span>
            </p>
            <div className="flex items-baseline gap-2.5 mt-1">
              <p className="font-mono-num text-3xl font-bold text-white">
                {expenditure.estimatedTdee}
              </p>
              <span className="text-xs text-zinc-400">kcal / day</span>
              {expenditure.confidence !== 'formula' && tdeeDiff !== 0 && (
                <span className="font-mono-num text-xs text-zinc-300">
                  ({tdeeDiff > 0 ? `+${tdeeDiff}` : tdeeDiff} vs formula)
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold text-white">{expenditure.confidenceLabel}</p>
            <p className="font-mono-num text-[11px] text-zinc-400">
              {expenditure.pairedDays} logged days · {expenditure.weightSpanDays}d weight span
            </p>
          </div>
        </div>

        <ProgressBar
          value={Math.min(14, expenditure.pairedDays)}
          max={14}
          heightClass="h-1.5"
        />

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[11px] text-zinc-400">Formula Baseline</p>
            <p className="font-mono-num text-sm font-bold text-white mt-0.5">
              {expenditure.baselineTdee} kcal
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[11px] text-zinc-400">21d Avg Intake</p>
            <p className="font-mono-num text-sm font-bold text-white mt-0.5">
              {expenditure.avgLoggedCalories !== null ? `${expenditure.avgLoggedCalories} kcal` : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[11px] text-zinc-400">Trend Rate / Wk</p>
            <p className="font-mono-num text-sm font-bold text-white mt-0.5 flex items-center gap-1">
              {expenditure.weeklyTrendChangeKg !== null ? (
                <>
                  {expenditure.weeklyTrendChangeKg < 0 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {expenditure.weeklyTrendChangeKg >= 0 ? '+' : ''}
                    {toDisplayWeight(expenditure.weeklyTrendChangeKg, weightUnit)}{' '}
                    {weightUnit.toUpperCase()}
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
          </div>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">{expenditure.explanation}</p>
        <div className="flex items-start gap-2 rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2 text-[11px] text-zinc-400">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
          <span>{expenditure.disclaimer}</span>
        </div>
      </Card>

      {/* Weight Trend & Quick Weigh-In */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-sky-400" />
              <span>Scale vs Trend Weight</span>
            </h3>
            <p className="font-mono-num text-xs text-zinc-400 mt-0.5">
              Trend:{' '}
              <span className="text-white font-semibold">
                {weightSummary.latestTrendKg !== null
                  ? formatWeight(weightSummary.latestTrendKg, weightUnit)
                  : 'No weigh-ins yet'}
              </span>
              {weightSummary.latestScaleKg !== null && (
                <span> · Latest scale: {formatWeight(weightSummary.latestScaleKg, weightUnit)}</span>
              )}
            </p>
          </div>

          <form onSubmit={handleWeighInSubmit} className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="25"
              max="350"
              value={weighInInput}
              onChange={(e) => setWeighInInput(e.target.value)}
              placeholder={`Today (${weightUnit})`}
              aria-label="Quick weigh-in weight"
              className={`${INPUT_CLASS} w-32`}
            />
            <SecondaryButton type="submit" disabled={weighInSaving || !weighInInput.trim()}>
              {weighInSaving ? 'Saving...' : 'Log Weight'}
            </SecondaryButton>
          </form>
        </div>

        {chartData.length >= 2 ? (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="date" stroke="#71717A" fontSize={10} />
                <YAxis
                  stroke="#71717A"
                  fontSize={10}
                  width={40}
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
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
                  dataKey="scale"
                  name={`Scale (${weightUnit})`}
                  stroke="#71717A"
                  strokeWidth={1}
                  dot={{ r: 3, fill: '#A1A1AA' }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="trend"
                  name={`EWMA Trend (${weightUnit})`}
                  stroke="#C4F82A"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-xs text-zinc-400 py-3">
            Log at least 2 weigh-ins across different days to visualize your smoothed EWMA weight trend against daily scale fluctuations.
          </p>
        )}
      </Card>

      {/* Macro Program Configurator & Weekly Check-In */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
              <span>Macro Coach & Weekly Check-In</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Goal: {GOAL_LABELS[fitnessGoal]} · Active targets: {nutritionGoals.calories_target} kcal
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Biological Sex (Mifflin-St Jeor BMR)">
            <div className="grid grid-cols-3 gap-1.5">
              {SEX_OPTIONS.map((opt) => {
                const active = coachPrefs.biological_sex === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void onUpdatePrefs({ biological_sex: opt.id })}
                    className={`min-h-[42px] rounded-xl text-xs font-semibold border transition-colors ${
                      active ? 'text-[#08090B] border-transparent' : 'border-white/10 text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                    style={
                      active
                        ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                        : undefined
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </FormField>

          <FormField label="Macro Distribution Style">
            <div className="grid grid-cols-2 gap-1.5">
              {MACRO_STYLES.map((style) => {
                const active = coachPrefs.macro_style === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => void onUpdatePrefs({ macro_style: style.id })}
                    className={`min-h-[44px] px-2.5 py-1.5 rounded-xl text-left border transition-colors ${
                      active
                        ? 'border-transparent text-[#08090B]'
                        : 'border-white/10 text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                    style={
                      active
                        ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                        : undefined
                    }
                  >
                    <p className="text-xs font-bold leading-tight">{style.label}</p>
                    <p
                      className={`text-[10px] leading-tight mt-0.5 ${
                        active ? 'text-[#08090B]/80' : 'text-zinc-400'
                      }`}
                    >
                      {style.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          </FormField>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-300">
              Target Weekly Weight Change Rate
            </span>
            <span className="font-mono-num text-xs font-bold text-white">
              {coachPrefs.weekly_rate_pct >= 0 ? '+' : ''}
              {coachPrefs.weekly_rate_pct.toFixed(2)}% / wk (
              {recommendation.projectedWeeklyKg >= 0 ? '+' : ''}
              {toDisplayWeight(recommendation.projectedWeeklyKg, weightUnit)} {weightUnit}/wk ·{' '}
              {recommendation.dailyEnergyDelta >= 0 ? '+' : ''}
              {recommendation.dailyEnergyDelta} kcal/d)
            </span>
          </div>

          <input
            type="range"
            min={-1.0}
            max={0.5}
            step={0.05}
            value={coachPrefs.weekly_rate_pct}
            onChange={(e) =>
              void onUpdatePrefs({ weekly_rate_pct: parseFloat(e.target.value) })
            }
            aria-label="Weekly weight change rate slider"
            className="w-full accent-[#C4F82A] cursor-pointer"
          />

          <div className="flex flex-wrap gap-1.5">
            {ratePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => void onUpdatePrefs({ weekly_rate_pct: p.value })}
                className="min-h-[34px] px-2.5 rounded-lg border border-white/10 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.05]"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                void onUpdatePrefs({ weekly_rate_pct: getDefaultWeeklyRatePct(fitnessGoal) })
              }
              className="min-h-[34px] px-2.5 rounded-lg border border-white/10 text-[11px] font-medium text-zinc-400 hover:text-white"
            >
              Reset to Goal Default
            </button>
          </div>
        </div>

        {/* Recommended Target Breakdown */}
        <div className="rounded-xl border border-white/10 bg-[#0D0F13] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Recommended Daily Program</span>
            </p>
            <p className="font-mono-num text-xs text-zinc-400">
              {recommendation.proteinPerKg} g/kg protein
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div>
              <p className="text-[11px] text-zinc-400">Calories</p>
              <p className="font-mono-num text-lg font-bold text-white">
                {recommendation.caloriesTarget}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">Protein</p>
              <p className="font-mono-num text-lg font-bold" style={{ color: '#C4F82A' }}>
                {recommendation.proteinTargetG}g
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">Carbs</p>
              <p className="font-mono-num text-lg font-bold text-sky-400">
                {recommendation.carbsTargetG}g
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">Fat</p>
              <p className="font-mono-num text-lg font-bold text-amber-400">
                {recommendation.fatTargetG}g
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400">Fibre / Water</p>
              <p className="font-mono-num text-sm font-bold text-white mt-1">
                {recommendation.fibreTargetG}g · {(recommendation.waterTargetMl / 1000).toFixed(1)}L
              </p>
            </div>
          </div>

          <PrimaryButton
            onClick={() => void handleRunCheckin()}
            loading={applyingCheckin}
            className="w-full"
          >
            <CheckCircle2 className="w-4 h-4" />
            Run Check-In & Apply Recommended Targets
          </PrimaryButton>
        </div>
      </Card>

      {/* Check-In History */}
      {checkins.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-display text-sm font-bold text-white">Recent Check-Ins</h3>
          <div className="divide-y divide-white/[0.06]">
            {checkins.slice(0, 8).map((c) => (
              <div
                key={c.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-white font-mono-num">
                    {c.checkin_date} · {c.recommended_calories} kcal
                  </p>
                  <p className="text-zinc-400 font-mono-num">
                    TDEE {c.estimated_tdee} kcal · P {c.recommended_protein_g}g · C{' '}
                    {c.recommended_carbs_g}g · F {c.recommended_fat_g}g
                  </p>
                </div>
                <div className="text-right font-mono-num text-zinc-400">
                  {c.trend_weight_kg !== null
                    ? formatWeight(c.trend_weight_kg, weightUnit)
                    : '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
