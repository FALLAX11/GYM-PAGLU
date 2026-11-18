export type FitnessGoal =
  | 'muscle_gain'
  | 'fat_loss'
  | 'strength'
  | 'recomposition'
  | 'endurance';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';

export type DietaryPreference =
  | 'omnivore'
  | 'vegetarian'
  | 'eggetarian'
  | 'vegan'
  | 'pescatarian';

export type ThemePreset = 'obsidian' | 'carbon' | 'midnight';
export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ft';
export type AITone = 'direct' | 'encouraging' | 'scientific';
export type AIProviderPref = 'auto' | 'groq' | 'openrouter';

export type ExerciseCategory =
  | 'Back'
  | 'Biceps'
  | 'Chest'
  | 'Triceps'
  | 'Legs'
  | 'Shoulders'
  | 'Abs'
  | 'Forearms'
  | 'Traps'
  | 'Neck'
  | 'Cardio'
  | 'Glutes'
  | 'Full Body'
  | 'Calisthenics'
  | 'Mobility'
  // Legacy aliases kept compatible with existing DB rows
  | 'Quadriceps'
  | 'Hamstrings'
  | 'Calves'
  | 'Abs and Core'
  | 'Full body';

export type ExerciseMovementType = 'Compound' | 'Isolation' | 'Cardio' | 'Mobility';
export type ExerciseDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type SplitType =
  | 'Push/Pull/Legs'
  | 'Upper/Lower'
  | 'Arnold split'
  | 'Full body'
  | 'Custom';

export type FoodCategory =
  | 'Rice'
  | 'Roti'
  | 'Dal'
  | 'Vegetables'
  | 'Eggs'
  | 'Milk'
  | 'Paneer'
  | 'Chicken'
  | 'Fish'
  | 'Oats'
  | 'Fruits'
  | 'Nuts'
  | 'Whey protein'
  | 'Other Indian foods';

export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  age: number | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  fitness_goal: FitnessGoal;
  activity_level: ActivityLevel;
  dietary_preference: DietaryPreference;
  workout_preference: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  theme_name: ThemePreset;
  accent_color: string;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  notifications_enabled: boolean;
  default_rest_seconds: number;
  ai_tone: AITone;
  ai_include_context: boolean;
  ai_preferred_provider: AIProviderPref;
  created_at: string;
  updated_at: string;
}

export interface UserWidget {
  id: string;
  user_id: string;
  widget_key: string;
  title: string;
  is_visible: boolean;
  sort_order: number;
}

export interface UserReminder {
  id: string;
  user_id: string;
  title: string;
  reminder_type: 'workout' | 'hydration' | 'meal' | 'weigh_in' | 'custom';
  schedule_time: string;
  days_of_week: string[];
  is_enabled: boolean;
}

export interface ExerciseItem {
  id: string;
  name: string;
  category: ExerciseCategory;
  categories?: ExerciseCategory[];
  primary_muscle?: string;
  secondary_muscles?: string[];
  equipment: string;
  exercise_type?: ExerciseMovementType;
  difficulty?: ExerciseDifficulty;
  target_muscle?: string;
  aliases?: string[];
  instructions?: string;
  common_mistakes?: string;
  media_url?: string | null;
  notes?: string;
  is_compound?: boolean;
  is_custom: boolean;
}

export interface WorkoutPlanExercise {
  id: string;
  plan_id: string;
  exercise_id: string | null;
  custom_exercise_id: string | null;
  exercise_name: string;
  exercise_category: string;
  day_label: string;
  sort_order: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
}

export interface WorkoutPlan {
  id: string;
  user_id: string | null;
  name: string;
  split_type: SplitType;
  description: string;
  is_system_template: boolean;
  workout_plan_exercises?: WorkoutPlanExercise[];
}

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSetRecord {
  id: string;
  user_id: string;
  session_exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  rest_seconds: number;
  set_type?: SetType;
  rpe?: number | null;
}

export interface WorkoutSessionExerciseRecord {
  id: string;
  user_id: string;
  session_id: string;
  exercise_id: string | null;
  custom_exercise_id: string | null;
  exercise_name: string;
  exercise_category: string;
  sort_order: number;
  rest_seconds: number;
  exercise_notes: string;
  superset_group?: string | null;
  workout_sets?: WorkoutSetRecord[];
}

export interface WorkoutSessionRecord {
  id: string;
  user_id: string;
  client_request_id: string;
  plan_id: string | null;
  workout_name: string;
  workout_date: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  total_volume_kg: number;
  session_notes: string;
  status: 'in_progress' | 'completed';
  created_at: string;
  workout_session_exercises?: WorkoutSessionExerciseRecord[];
}

export interface ExercisePRBaseline {
  exerciseName: string;
  maxWeightKg: number;
  best1RMKg: number;
  maxSetVolumeKg: number;
  sessionsLogged: number;
}

export interface PreviousExercisePerformance {
  exerciseName: string;
  lastDate: string;
  bestSet: { weight_kg: number; reps: number };
  sets: Array<{
    set_number: number;
    weight_kg: number;
    reps: number;
    set_type?: SetType;
    rpe?: number | null;
  }>;
  totalVolumeKg: number;
}

export interface FoodItem {
  id: string;
  name: string;
  category: FoodCategory;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  aliases?: string[];
  is_custom: boolean;
  is_favorite?: boolean;
}

export interface FoodLogRecord {
  id: string;
  user_id: string;
  food_id: string | null;
  custom_food_id: string | null;
  food_name: string;
  quantity: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  meal_category: MealCategory;
  logged_date: string;
  logged_at: string;
  is_favorite: boolean;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  meal_category: MealCategory;
  items: Array<{
    food_name: string;
    quantity: number;
    serving_unit: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fibre_g: number;
  }>;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fibre_g: number;
}

export interface NutritionGoals {
  id: string;
  user_id: string;
  calories_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  fibre_target_g: number;
  water_target_ml: number;
}

export interface WaterLogRecord {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_date: string;
  logged_at: string;
}

export interface WeightLogRecord {
  id: string;
  user_id: string;
  weight_kg: number;
  logged_date: string;
  notes: string;
}

export interface BodyMeasurementRecord {
  id: string;
  user_id: string;
  logged_date: string;
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  shoulders_cm: number | null;
  notes: string;
}

export interface ProgressPhotoRecord {
  id: string;
  user_id: string;
  storage_path: string;
  pose_tag: 'front' | 'side' | 'back';
  weight_kg: number | null;
  taken_date: string;
  notes: string;
  signedUrl?: string;
}

export interface AIConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  model: string | null;
  fallback_used: boolean;
  created_at: string;
}

export type BiologicalSex = 'male' | 'female' | 'unspecified';
export type MacroStyle = 'balanced' | 'high_protein' | 'high_carb' | 'low_carb';
export type ExpenditureConfidence = 'formula' | 'calibrating' | 'adaptive';

export interface NutritionCoachPrefs {
  id: string;
  user_id: string;
  biological_sex: BiologicalSex;
  macro_style: MacroStyle;
  weekly_rate_pct: number;
  auto_apply_checkins: boolean;
  updated_at: string;
}

export interface NutritionCheckinRecord {
  id: string;
  user_id: string;
  checkin_date: string;
  trend_weight_kg: number | null;
  estimated_tdee: number;
  baseline_tdee: number;
  confidence: ExpenditureConfidence;
  paired_days: number;
  recommended_calories: number;
  recommended_protein_g: number;
  recommended_carbs_g: number;
  recommended_fat_g: number;
  recommended_fibre_g: number;
  notes: string;
  created_at: string;
}

