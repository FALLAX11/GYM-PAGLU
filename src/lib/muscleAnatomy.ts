import type { ExerciseCategory, ExerciseItem } from '../types/database';

export type MuscleRegionId =
  | 'chest'
  | 'front_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'traps'
  | 'neck'
  | 'lats'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

export interface MuscleRegionMeta {
  id: MuscleRegionId;
  label: string;
  shortLabel: string;
  view: 'front' | 'back' | 'both';
  defaultWeeklyTarget: number;
  filterCategory: ExerciseCategory;
  anatomyNote: string;
}

export const ALL_MUSCLE_REGION_IDS: MuscleRegionId[] = [
  'chest',
  'front_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'traps',
  'neck',
  'lats',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

export const MUSCLE_REGION_META: Record<MuscleRegionId, MuscleRegionMeta> = {
  chest: {
    id: 'chest',
    label: 'Chest (Pectorals)',
    shortLabel: 'Chest',
    view: 'front',
    defaultWeeklyTarget: 14,
    filterCategory: 'Chest',
    anatomyNote: 'Clavicular & sternal pectoralis major',
  },
  front_delts: {
    id: 'front_delts',
    label: 'Front & Side Shoulders',
    shortLabel: 'Delts',
    view: 'both',
    defaultWeeklyTarget: 12,
    filterCategory: 'Shoulders',
    anatomyNote: 'Anterior and lateral deltoid heads',
  },
  rear_delts: {
    id: 'rear_delts',
    label: 'Rear Shoulders',
    shortLabel: 'Rear Delts',
    view: 'back',
    defaultWeeklyTarget: 8,
    filterCategory: 'Shoulders',
    anatomyNote: 'Posterior deltoid & external rotators',
  },
  biceps: {
    id: 'biceps',
    label: 'Biceps & Brachialis',
    shortLabel: 'Biceps',
    view: 'front',
    defaultWeeklyTarget: 10,
    filterCategory: 'Biceps',
    anatomyNote: 'Biceps long/short head & brachialis',
  },
  triceps: {
    id: 'triceps',
    label: 'Triceps',
    shortLabel: 'Triceps',
    view: 'back',
    defaultWeeklyTarget: 12,
    filterCategory: 'Triceps',
    anatomyNote: 'Long, lateral & medial triceps heads',
  },
  forearms: {
    id: 'forearms',
    label: 'Forearms & Grip',
    shortLabel: 'Forearms',
    view: 'both',
    defaultWeeklyTarget: 8,
    filterCategory: 'Forearms',
    anatomyNote: 'Wrist flexors, extensors & brachioradialis',
  },
  abs: {
    id: 'abs',
    label: 'Abs & Obliques',
    shortLabel: 'Abs',
    view: 'front',
    defaultWeeklyTarget: 10,
    filterCategory: 'Abs',
    anatomyNote: 'Rectus abdominis, obliques & transverse core',
  },
  traps: {
    id: 'traps',
    label: 'Trapezius',
    shortLabel: 'Traps',
    view: 'both',
    defaultWeeklyTarget: 8,
    filterCategory: 'Traps',
    anatomyNote: 'Upper, middle & lower trapezius',
  },
  neck: {
    id: 'neck',
    label: 'Neck',
    shortLabel: 'Neck',
    view: 'both',
    defaultWeeklyTarget: 4,
    filterCategory: 'Neck',
    anatomyNote: 'Sternocleidomastoid & cervical extensors',
  },
  lats: {
    id: 'lats',
    label: 'Lats & Upper Back',
    shortLabel: 'Lats',
    view: 'back',
    defaultWeeklyTarget: 16,
    filterCategory: 'Back',
    anatomyNote: 'Latissimus dorsi, teres major & rhomboids',
  },
  lower_back: {
    id: 'lower_back',
    label: 'Lower Back (Erectors)',
    shortLabel: 'Lower Back',
    view: 'back',
    defaultWeeklyTarget: 8,
    filterCategory: 'Back',
    anatomyNote: 'Spinal erectors & lumbar stabilizers',
  },
  glutes: {
    id: 'glutes',
    label: 'Glutes',
    shortLabel: 'Glutes',
    view: 'back',
    defaultWeeklyTarget: 12,
    filterCategory: 'Glutes',
    anatomyNote: 'Gluteus maximus, medius & minimus',
  },
  quads: {
    id: 'quads',
    label: 'Quadriceps & Adductors',
    shortLabel: 'Quads',
    view: 'front',
    defaultWeeklyTarget: 14,
    filterCategory: 'Legs',
    anatomyNote: 'Rectus femoris, vastus lateralis/medialis & adductors',
  },
  hamstrings: {
    id: 'hamstrings',
    label: 'Hamstrings',
    shortLabel: 'Hamstrings',
    view: 'back',
    defaultWeeklyTarget: 10,
    filterCategory: 'Legs',
    anatomyNote: 'Biceps femoris, semitendinosus & semimembranosus',
  },
  calves: {
    id: 'calves',
    label: 'Calves & Tibialis',
    shortLabel: 'Calves',
    view: 'both',
    defaultWeeklyTarget: 8,
    filterCategory: 'Legs',
    anatomyNote: 'Gastrocnemius, soleus & tibialis anterior',
  },
};

export interface ExerciseMuscleMapping {
  primary: MuscleRegionId[];
  secondary: MuscleRegionId[];
}

function addUnique(list: MuscleRegionId[], item: MuscleRegionId): void {
  if (!list.includes(item)) list.push(item);
}

/**
 * Parses an anatomical muscle label or description phrase into matching SVG regions.
 */
function parseRegionsFromText(raw: string): MuscleRegionId[] {
  const t = raw.toLowerCase();
  const out: MuscleRegionId[] = [];

  if (
    t.includes('pectoral') ||
    t.includes('chest') ||
    t.includes('push-up') ||
    t.includes('pushup')
  ) {
    addUnique(out, 'chest');
  }
  if (
    t.includes('posterior delt') ||
    t.includes('rear delt') ||
    t.includes('scapular retractor')
  ) {
    addUnique(out, 'rear_delts');
  }
  if (
    t.includes('anterior delt') ||
    t.includes('front delt') ||
    t.includes('lateral delt') ||
    t.includes('side delt') ||
    t.includes('shoulder') ||
    t.includes('deltoid') ||
    t.includes('rotator cuff')
  ) {
    // Only add front_delts if it wasn't exclusively mentioning rear/posterior delts
    if (
      !t.includes('posterior delt') &&
      !t.includes('rear delt')
    ) {
      addUnique(out, 'front_delts');
    } else if (t.includes('anterior') || t.includes('lateral') || t.includes('deltoids')) {
      addUnique(out, 'front_delts');
    }
  }
  if (
    t.includes('bicep') ||
    t.includes('brachialis') ||
    (t.includes('arms') && !t.includes('forearm'))
  ) {
    addUnique(out, 'biceps');
  }
  if (t.includes('tricep')) {
    addUnique(out, 'triceps');
  }
  if (
    t.includes('forearm') ||
    t.includes('brachioradialis') ||
    t.includes('wrist') ||
    t.includes('grip') ||
    t.includes('finger') ||
    t.includes('pronator') ||
    t.includes('supinator')
  ) {
    addUnique(out, 'forearms');
  }
  if (
    t.includes('abs') ||
    t.includes('abdom') ||
    t.includes('oblique') ||
    t.includes('core') ||
    t.includes('serratus') ||
    t.includes('quadratus lumborum')
  ) {
    addUnique(out, 'abs');
  }
  if (t.includes('trap')) {
    addUnique(out, 'traps');
  }
  if (
    t.includes('neck') ||
    t.includes('cervical') ||
    t.includes('sternocleidomastoid')
  ) {
    addUnique(out, 'neck');
  }
  if (
    t.includes('lat') ||
    t.includes('latissimus') ||
    t.includes('teres') ||
    t.includes('rhomboid') ||
    t.includes('upper back') ||
    t.includes('middle back') ||
    t.includes('mid-back') ||
    t.includes('mid back') ||
    (t.includes('back') && !t.includes('lower back') && !t.includes('back extension'))
  ) {
    addUnique(out, 'lats');
  }
  if (
    t.includes('lower back') ||
    t.includes('erector') ||
    t.includes('multifidus') ||
    t.includes('lumbar') ||
    t.includes('back extension')
  ) {
    addUnique(out, 'lower_back');
  }
  if (t.includes('glute') || t.includes('piriformis') || t.includes('hip')) {
    // Hip flexors involve anterior thigh/core; glutes cover hip extensors/abductors
    if (t.includes('hip flexor') || t.includes('iliopsoas')) {
      addUnique(out, 'quads');
      addUnique(out, 'abs');
    } else {
      addUnique(out, 'glutes');
    }
  }
  if (
    t.includes('quad') ||
    t.includes('rectus femoris') ||
    t.includes('vmo') ||
    t.includes('adductor') ||
    t.includes('inner thigh') ||
    t.includes('thigh')
  ) {
    addUnique(out, 'quads');
  }
  if (t.includes('hamstring') || t.includes('posterior chain')) {
    addUnique(out, 'hamstrings');
    if (t.includes('posterior chain') && !t.includes('biceps tendon')) {
      addUnique(out, 'glutes');
    }
  }
  if (
    t.includes('calv') ||
    t.includes('calf') ||
    t.includes('gastrocnemius') ||
    t.includes('soleus') ||
    t.includes('tibialis') ||
    t.includes('ankle')
  ) {
    addUnique(out, 'calves');
  }
  if (t.includes('legs') || t.includes('lower-body') || t.includes('lower body')) {
    addUnique(out, 'quads');
    addUnique(out, 'hamstrings');
    addUnique(out, 'calves');
  }

  return out;
}

/**
 * Resolves exact primary & secondary SVG anatomical regions for any exercise
 * across all 348 master exercises and custom user exercises.
 */
export function resolveExerciseMuscles(
  exercise: Pick<
    ExerciseItem,
    'name' | 'category' | 'primary_muscle' | 'secondary_muscles' | 'target_muscle'
  >
): ExerciseMuscleMapping {
  const primary: MuscleRegionId[] = [];
  const secondary: MuscleRegionId[] = [];

  const category = (exercise.category || '').toLowerCase();
  const nameLower = (exercise.name || '').toLowerCase();
  const target = exercise.target_muscle ?? '';
  const targetLower = target.toLowerCase();
  const primRaw = (exercise.primary_muscle ?? '').toLowerCase();

  // 1. Parse target_muscle & exercise name nuance first for multi-muscle categories
  const fromTarget = parseRegionsFromText(target);
  const fromPrimaryRaw = parseRegionsFromText(primRaw);

  if (category === 'chest') {
    addUnique(primary, 'chest');
  } else if (category === 'biceps') {
    addUnique(primary, 'biceps');
    if (targetLower.includes('brachioradialis') || targetLower.includes('forearm')) {
      addUnique(secondary, 'forearms');
    }
  } else if (category === 'triceps') {
    addUnique(primary, 'triceps');
    if (targetLower.includes('lower chest')) addUnique(secondary, 'chest');
  } else if (category === 'abs' || category === 'abs and core') {
    addUnique(primary, 'abs');
  } else if (category === 'forearms') {
    addUnique(primary, 'forearms');
    if (targetLower.includes('upper trap')) addUnique(secondary, 'traps');
  } else if (category === 'traps') {
    addUnique(primary, 'traps');
  } else if (category === 'neck') {
    addUnique(primary, 'neck');
  } else if (category === 'glutes') {
    addUnique(primary, 'glutes');
  } else if (category === 'shoulders') {
    if (fromTarget.includes('rear_delts')) {
      addUnique(primary, 'rear_delts');
    }
    if (fromTarget.includes('front_delts') || primary.length === 0) {
      addUnique(primary, 'front_delts');
    }
  } else if (category === 'back') {
    if (fromTarget.includes('lower_back')) addUnique(primary, 'lower_back');
    if (fromTarget.includes('lats')) addUnique(primary, 'lats');
    if (fromTarget.includes('hamstrings') && nameLower.includes('good morning')) {
      addUnique(primary, 'hamstrings');
    }
    if (primary.length === 0) addUnique(primary, 'lats');
  } else if (category === 'legs' || category === 'quadriceps') {
    for (const r of fromTarget) addUnique(primary, r);
    if (primary.length === 0) addUnique(primary, 'quads');
  } else if (category === 'hamstrings') {
    addUnique(primary, 'hamstrings');
  } else if (category === 'calves') {
    addUnique(primary, 'calves');
  } else if (category === 'calisthenics' || category === 'mobility') {
    for (const r of fromTarget) addUnique(primary, r);
    // Thoracic mobility fallback
    if (primary.length === 0 && (targetLower.includes('thoracic') || nameLower.includes('thoracic'))) {
      addUnique(primary, 'lats');
      addUnique(primary, 'lower_back');
    }
    if (primary.length === 0) {
      for (const s of exercise.secondary_muscles ?? []) {
        for (const r of parseRegionsFromText(s)) addUnique(primary, r);
      }
    }
    if (primary.length === 0) addUnique(primary, 'abs');
  } else if (category === 'full body' || category === 'full body') {
    for (const r of fromTarget) addUnique(primary, r);
    if (nameLower.includes('thruster') || nameLower.includes('clean & press') || nameLower.includes('push press')) {
      addUnique(primary, 'quads');
      addUnique(primary, 'front_delts');
    } else if (nameLower.includes('kettlebell swing')) {
      addUnique(primary, 'glutes');
      addUnique(primary, 'hamstrings');
    } else if (nameLower.includes('turkish get-up') || nameLower.includes('man maker') || nameLower.includes('burpee')) {
      addUnique(primary, 'chest');
      addUnique(primary, 'front_delts');
      addUnique(primary, 'quads');
      addUnique(primary, 'abs');
    } else if (nameLower.includes('farmer') || nameLower.includes('sled')) {
      addUnique(primary, 'quads');
      addUnique(primary, 'forearms');
      addUnique(primary, 'traps');
    }
    if (primary.length === 0) {
      addUnique(primary, 'quads');
      addUnique(primary, 'glutes');
      addUnique(primary, 'front_delts');
      addUnique(primary, 'lats');
    }
  } else if (category === 'cardio') {
    if (nameLower.includes('row') || nameLower.includes('ski')) {
      addUnique(primary, 'lats');
      addUnique(primary, 'quads');
    } else if (nameLower.includes('battle rope') || nameLower.includes('shadowbox')) {
      addUnique(primary, 'front_delts');
      addUnique(primary, 'abs');
    } else if (nameLower.includes('jump rope') || nameLower.includes('box jump')) {
      addUnique(primary, 'calves');
      addUnique(primary, 'quads');
    } else {
      addUnique(primary, 'quads');
      addUnique(primary, 'calves');
    }
  } else {
    for (const r of fromTarget) addUnique(primary, r);
    for (const r of fromPrimaryRaw) addUnique(primary, r);
    if (primary.length === 0) {
      addUnique(primary, 'chest');
    }
  }

  // 2. Parse secondary muscles from explicit secondary_muscles[] + extra target/name hints
  for (const sec of exercise.secondary_muscles ?? []) {
    for (const r of parseRegionsFromText(sec)) {
      if (!primary.includes(r)) addUnique(secondary, r);
    }
  }
  for (const r of fromTarget) {
    if (!primary.includes(r)) addUnique(secondary, r);
  }

  return { primary, secondary };
}

/**
 * Checks whether an exercise matches a clicked anatomical SVG muscle region.
 */
export function exerciseMatchesMuscleRegion(
  exercise: ExerciseItem,
  regionId: MuscleRegionId,
  scope: 'all' | 'primary' = 'all'
): boolean {
  const { primary, secondary } = resolveExerciseMuscles(exercise);
  if (primary.includes(regionId)) return true;
  if (scope === 'all' && secondary.includes(regionId)) return true;
  return false;
}

/**
 * Resolves muscle mapping for a logged session exercise by looking up its catalog metadata
 * first, falling back to its logged `exercise_name` and `exercise_category`.
 */
export function resolveLoggedExerciseMuscles(
  exerciseName: string,
  exerciseCategory: string,
  catalogIndex: Map<string, ExerciseItem>
): ExerciseMuscleMapping {
  const matched = catalogIndex.get(exerciseName.trim().toLowerCase());
  if (matched) {
    return resolveExerciseMuscles(matched);
  }
  return resolveExerciseMuscles({
    name: exerciseName,
    category: exerciseCategory as ExerciseCategory,
    primary_muscle: exerciseCategory,
    secondary_muscles: [],
    target_muscle: '',
  });
}
