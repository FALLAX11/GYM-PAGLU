import type { WeightUnit } from '../types/database';

export interface PlateCalculatorConfig {
  barWeightKg: number;
  barWeightLb: number;
  enabledPlatesKg: number[];
  enabledPlatesLb: number[];
}

export interface PlateBreakdownItem {
  weight: number;
  countPerSide: number;
}

export interface PlateCalculationResult {
  unit: WeightUnit;
  targetWeight: number;
  barWeight: number;
  achievableWeight: number;
  perSideWeightTarget: number;
  perSideWeightLoaded: number;
  remainderTotal: number;
  platesPerSide: PlateBreakdownItem[];
  belowBarWeight: boolean;
}

export interface WarmupSetRecommendation {
  stepLabel: string;
  percentageLabel: string;
  weightDisplay: number;
  weightKg: number;
  reps: number;
}

export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES_LB = [45, 35, 25, 10, 5, 2.5];

export const BARBELL_PRESETS_KG = [
  { label: 'Olympic 20 kg', weight: 20 },
  { label: 'Women/Tech 15 kg', weight: 15 },
  { label: 'EZ / Short 10 kg', weight: 10 },
  { label: 'Machine / No Bar (0)', weight: 0 },
];

export const BARBELL_PRESETS_LB = [
  { label: 'Olympic 45 lb', weight: 45 },
  { label: 'Women/Tech 35 lb', weight: 35 },
  { label: 'EZ / Short 25 lb', weight: 25 },
  { label: 'Machine / No Bar (0)', weight: 0 },
];

const PLATE_CONFIG_STORAGE_KEY = (userId: string) =>
  `gympaglu_plate_config_v1_${userId || 'default'}`;

export function getDefaultPlateConfig(): PlateCalculatorConfig {
  return {
    barWeightKg: 20,
    barWeightLb: 45,
    enabledPlatesKg: [...DEFAULT_PLATES_KG],
    enabledPlatesLb: [...DEFAULT_PLATES_LB],
  };
}

export function loadPlateCalculatorConfig(userId: string): PlateCalculatorConfig {
  const defaults = getDefaultPlateConfig();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(PLATE_CONFIG_STORAGE_KEY(userId));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PlateCalculatorConfig>;
    return {
      barWeightKg:
        typeof parsed.barWeightKg === 'number' && parsed.barWeightKg >= 0
          ? parsed.barWeightKg
          : defaults.barWeightKg,
      barWeightLb:
        typeof parsed.barWeightLb === 'number' && parsed.barWeightLb >= 0
          ? parsed.barWeightLb
          : defaults.barWeightLb,
      enabledPlatesKg:
        Array.isArray(parsed.enabledPlatesKg) && parsed.enabledPlatesKg.length > 0
          ? parsed.enabledPlatesKg.filter((n) => typeof n === 'number' && n > 0)
          : defaults.enabledPlatesKg,
      enabledPlatesLb:
        Array.isArray(parsed.enabledPlatesLb) && parsed.enabledPlatesLb.length > 0
          ? parsed.enabledPlatesLb.filter((n) => typeof n === 'number' && n > 0)
          : defaults.enabledPlatesLb,
    };
  } catch {
    return defaults;
  }
}

export function savePlateCalculatorConfig(
  userId: string,
  config: PlateCalculatorConfig
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      PLATE_CONFIG_STORAGE_KEY(userId),
      JSON.stringify(config)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function calculatePlatesPerSide(params: {
  targetWeight: number;
  barWeight: number;
  availablePlates: number[];
  unit: WeightUnit;
}): PlateCalculationResult {
  const targetWeight = Math.max(0, Number(params.targetWeight) || 0);
  const barWeight = Math.max(0, Number(params.barWeight) || 0);
  const sortedPlates = [...params.availablePlates]
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => b - a);

  if (targetWeight < barWeight) {
    return {
      unit: params.unit,
      targetWeight,
      barWeight,
      achievableWeight: barWeight,
      perSideWeightTarget: 0,
      perSideWeightLoaded: 0,
      remainderTotal: Math.round((targetWeight - barWeight) * 100) / 100,
      platesPerSide: [],
      belowBarWeight: true,
    };
  }

  const perSideTarget = Math.max(0, (targetWeight - barWeight) / 2);
  let remaining = perSideTarget + 1e-6;
  const platesPerSide: PlateBreakdownItem[] = [];
  let loadedPerSide = 0;

  for (const plate of sortedPlates) {
    const count = Math.floor(remaining / plate);
    if (count > 0) {
      platesPerSide.push({ weight: plate, countPerSide: count });
      loadedPerSide += plate * count;
      remaining -= plate * count;
    }
  }

  loadedPerSide = Math.round(loadedPerSide * 100) / 100;
  const achievableWeight = Math.round((barWeight + loadedPerSide * 2) * 100) / 100;
  const remainderTotal = Math.round((targetWeight - achievableWeight) * 100) / 100;

  return {
    unit: params.unit,
    targetWeight,
    barWeight,
    achievableWeight,
    perSideWeightTarget: Math.round(perSideTarget * 100) / 100,
    perSideWeightLoaded: loadedPerSide,
    remainderTotal,
    platesPerSide,
    belowBarWeight: false,
  };
}

const KG_TO_LB = 2.20462262;

function roundToIncrement(val: number, step: number): number {
  if (step <= 0) return Math.round(val * 10) / 10;
  return Math.round(val / step) * step;
}

export function generateWarmupSets(params: {
  workingWeightDisplay: number;
  barWeightDisplay: number;
  availablePlates: number[];
  unit: WeightUnit;
}): WarmupSetRecommendation[] {
  const { workingWeightDisplay, barWeightDisplay, availablePlates, unit } = params;
  if (!Number.isFinite(workingWeightDisplay) || workingWeightDisplay <= 0) {
    return [];
  }

  const smallestPlate =
    availablePlates.length > 0 ? Math.min(...availablePlates) : unit === 'kg' ? 2.5 : 2.5;
  const step = Math.max(0.5, smallestPlate * 2);

  const toKg = (val: number) =>
    unit === 'lb'
      ? Math.round((val / KG_TO_LB) * 100) / 100
      : Math.round(val * 100) / 100;

  if (workingWeightDisplay <= barWeightDisplay * 1.15) {
    const w = Math.max(0, roundToIncrement(workingWeightDisplay * 0.6, step));
    return [
      {
        stepLabel: 'Warm-up 1',
        percentageLabel: '60%',
        weightDisplay: w,
        weightKg: toKg(w),
        reps: 10,
      },
    ];
  }

  const stages = [
    {
      label: barWeightDisplay > 0 ? 'Empty Bar' : 'Light Warm-up',
      pctLabel: barWeightDisplay > 0 ? 'Bar' : '40%',
      rawWeight: barWeightDisplay > 0 ? barWeightDisplay : workingWeightDisplay * 0.4,
      reps: 10,
    },
    {
      label: 'Warm-up 2',
      pctLabel: '50%',
      rawWeight: Math.max(barWeightDisplay, workingWeightDisplay * 0.5),
      reps: 6,
    },
    {
      label: 'Warm-up 3',
      pctLabel: '70%',
      rawWeight: Math.max(barWeightDisplay, workingWeightDisplay * 0.7),
      reps: 4,
    },
    {
      label: 'Warm-up 4',
      pctLabel: '85%',
      rawWeight: Math.max(barWeightDisplay, workingWeightDisplay * 0.85),
      reps: 2,
    },
  ];

  const seenWeights = new Set<number>();
  const out: WarmupSetRecommendation[] = [];

  for (const st of stages) {
    const rounded =
      st.pctLabel === 'Bar'
        ? barWeightDisplay
        : Math.max(barWeightDisplay, roundToIncrement(st.rawWeight, step));
    if (rounded >= workingWeightDisplay) continue;
    if (seenWeights.has(rounded)) continue;
    seenWeights.add(rounded);
    out.push({
      stepLabel: st.label,
      percentageLabel: st.pctLabel,
      weightDisplay: Math.round(rounded * 10) / 10,
      weightKg: toKg(rounded),
      reps: st.reps,
    });
  }

  return out;
}
