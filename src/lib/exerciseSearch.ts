import type {
  ExerciseCategory,
  ExerciseDifficulty,
  ExerciseItem,
  ExerciseMovementType,
} from '../types/database';

export const EXERCISE_CATEGORIES: Array<'All' | ExerciseCategory> = [
  'All',
  'Back',
  'Biceps',
  'Chest',
  'Triceps',
  'Legs',
  'Shoulders',
  'Abs',
  'Forearms',
  'Traps',
  'Neck',
  'Cardio',
  'Glutes',
  'Full Body',
  'Calisthenics',
  'Mobility',
];

export const CUSTOM_EXERCISE_CATEGORIES: ExerciseCategory[] = [
  'Back',
  'Biceps',
  'Chest',
  'Triceps',
  'Legs',
  'Shoulders',
  'Abs',
  'Forearms',
  'Traps',
  'Neck',
  'Cardio',
  'Glutes',
  'Full Body',
  'Calisthenics',
  'Mobility',
];

export const EXERCISE_EQUIPMENT_FILTERS: string[] = [
  'All',
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Bodyweight',
  'Smith Machine',
  'EZ Bar',
  'Kettlebell',
  'Band',
  'Landmine',
  'Plate',
  'Trap Bar',
  'Cardio Machine',
  'Other',
];

export const EXERCISE_DIFFICULTY_FILTERS: Array<'All' | ExerciseDifficulty> = [
  'All',
  'Beginner',
  'Intermediate',
  'Advanced',
];

export const EXERCISE_TYPE_FILTERS: Array<'All' | ExerciseMovementType> = [
  'All',
  'Compound',
  'Isolation',
  'Cardio',
  'Mobility',
];

export function normalizeExerciseSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/'’.,()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactExerciseSearch(value: string): string {
  return normalizeExerciseSearch(value).replace(/\s+/g, '');
}

const LEGACY_TO_CANONICAL_CATEGORY: Record<string, ExerciseCategory> = {
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  calves: 'Legs',
  'abs and core': 'Abs',
  'full body': 'Full Body',
};

function canonicalizeCategory(cat: string): string {
  const lower = cat.trim().toLowerCase();
  return LEGACY_TO_CANONICAL_CATEGORY[lower] ?? cat.trim();
}

export function matchesExerciseCategory(
  exercise: Pick<ExerciseItem, 'category' | 'categories'>,
  selectedCategory: 'All' | ExerciseCategory
): boolean {
  if (selectedCategory === 'All') return true;
  const target = canonicalizeCategory(selectedCategory).toLowerCase();
  const memberships = [
    exercise.category,
    ...(exercise.categories ?? []),
  ];
  return memberships.some((m) => canonicalizeCategory(m).toLowerCase() === target);
}

export function matchesExerciseEquipment(
  exerciseEquipment: string,
  selectedEquipment: string
): boolean {
  if (!selectedEquipment || selectedEquipment === 'All') return true;
  return (
    normalizeExerciseSearch(exerciseEquipment) === normalizeExerciseSearch(selectedEquipment)
  );
}

export function matchesExerciseDifficulty(
  exerciseDifficulty: ExerciseDifficulty | undefined,
  selectedDifficulty: 'All' | ExerciseDifficulty
): boolean {
  if (selectedDifficulty === 'All') return true;
  return (exerciseDifficulty ?? 'Intermediate') === selectedDifficulty;
}

export function matchesExerciseType(
  exercise: Pick<ExerciseItem, 'exercise_type' | 'is_compound' | 'category'>,
  selectedType: 'All' | ExerciseMovementType
): boolean {
  if (selectedType === 'All') return true;
  const resolved: ExerciseMovementType =
    exercise.exercise_type ??
    (exercise.category === 'Cardio'
      ? 'Cardio'
      : exercise.category === 'Mobility'
        ? 'Mobility'
        : exercise.is_compound
          ? 'Compound'
          : 'Isolation');
  return resolved === selectedType;
}

export function matchesExerciseQuery(exercise: ExerciseItem, rawQuery: string): boolean {
  const normQuery = normalizeExerciseSearch(rawQuery);
  if (!normQuery) return true;

  const compactQuery = normQuery.replace(/\s+/g, '');
  const tokens = normQuery.split(' ').filter(Boolean);

  const candidates = [
    exercise.name,
    exercise.category,
    ...(exercise.categories ?? []),
    exercise.primary_muscle ?? '',
    ...(exercise.secondary_muscles ?? []),
    exercise.target_muscle ?? '',
    exercise.equipment,
    ...(exercise.aliases ?? []),
  ];

  for (const field of candidates) {
    const normField = normalizeExerciseSearch(field);
    if (!normField) continue;
    if (normField.includes(normQuery)) return true;
    if (compactQuery.length >= 2 && normField.replace(/\s+/g, '').includes(compactQuery)) {
      return true;
    }
  }

  if (tokens.length > 0) {
    const combined = normalizeExerciseSearch(candidates.join(' '));
    const combinedCompact = combined.replace(/\s+/g, '');
    const tokenMatches = (t: string) => {
      if (combined.includes(t) || combinedCompact.includes(t)) return true;
      if (t.length > 4 && t.endsWith('es')) {
        const stem = t.slice(0, -2);
        if (combined.includes(stem) || combinedCompact.includes(stem)) return true;
      }
      if (t.length > 3 && t.endsWith('s')) {
        const stem = t.slice(0, -1);
        if (combined.includes(stem) || combinedCompact.includes(stem)) return true;
      }
      return false;
    };
    if (tokens.every(tokenMatches)) {
      return true;
    }
  }

  return false;
}

export function filterExercises(
  exercises: ExerciseItem[],
  options: {
    query?: string;
    category?: 'All' | ExerciseCategory;
    equipment?: string;
    difficulty?: 'All' | ExerciseDifficulty;
    exerciseType?: 'All' | ExerciseMovementType;
  }
): ExerciseItem[] {
  const query = options.query ?? '';
  const category = options.category ?? 'All';
  const equipment = options.equipment ?? 'All';
  const difficulty = options.difficulty ?? 'All';
  const exerciseType = options.exerciseType ?? 'All';

  return exercises.filter(
    (ex) =>
      matchesExerciseCategory(ex, category) &&
      matchesExerciseEquipment(ex.equipment, equipment) &&
      matchesExerciseDifficulty(ex.difficulty, difficulty) &&
      matchesExerciseType(ex, exerciseType) &&
      matchesExerciseQuery(ex, query)
  );
}
