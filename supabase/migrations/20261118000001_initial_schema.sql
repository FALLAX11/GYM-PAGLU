-- GYM PAGLU: Complete PostgreSQL Schema, Indexes, Triggers, and Row Level Security
-- Target: Supabase PostgreSQL 15+

create extension if not exists "pgcrypto";

-- ============================================================================
-- HELPER FUNCTION: updated_at trigger
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ============================================================================
-- 1. PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  age integer check (age is null or (age >= 13 and age <= 110)),
  height_cm numeric(6,2) check (height_cm is null or (height_cm >= 80 and height_cm <= 260)),
  current_weight_kg numeric(6,2) check (current_weight_kg is null or (current_weight_kg >= 25 and current_weight_kg <= 350)),
  target_weight_kg numeric(6,2) check (target_weight_kg is null or (target_weight_kg >= 25 and target_weight_kg <= 350)),
  fitness_goal text not null default 'muscle_gain' check (fitness_goal in ('muscle_gain', 'fat_loss', 'strength', 'recomposition', 'endurance')),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  dietary_preference text not null default 'omnivore' check (dietary_preference in ('omnivore', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian')),
  workout_preference text not null default 'hypertrophy',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can delete own profile" on public.profiles for delete using (auth.uid() = id);

-- ============================================================================
-- 2. USER SETTINGS
-- ============================================================================
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme_name text not null default 'obsidian' check (theme_name in ('obsidian', 'carbon', 'midnight')),
  accent_color text not null default '#C4F82A',
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  height_unit text not null default 'cm' check (height_unit in ('cm', 'ft')),
  notifications_enabled boolean not null default true,
  default_rest_seconds integer not null default 90 check (default_rest_seconds >= 15 and default_rest_seconds <= 600),
  ai_tone text not null default 'direct' check (ai_tone in ('direct', 'encouraging', 'scientific')),
  ai_include_context boolean not null default true,
  ai_preferred_provider text not null default 'auto' check (ai_preferred_provider in ('auto', 'groq', 'openrouter')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
create policy "Users manage own settings" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 3. EXERCISES (PUBLIC CATALOG) & CUSTOM EXERCISES (USER-OWNED)
-- ============================================================================
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in (
    'Back', 'Biceps', 'Chest', 'Triceps', 'Legs', 'Shoulders', 'Abs',
    'Forearms', 'Traps', 'Neck', 'Cardio', 'Glutes', 'Full Body',
    'Calisthenics', 'Mobility',
    'Quadriceps', 'Hamstrings', 'Calves', 'Abs and Core', 'Full body'
  )),
  categories text[] not null default '{}',
  primary_muscle text not null default '',
  secondary_muscles text[] not null default '{}',
  equipment text not null default 'Barbell',
  exercise_type text not null default 'Compound' check (exercise_type in ('Compound', 'Isolation', 'Cardio', 'Mobility')),
  difficulty text not null default 'Intermediate' check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  target_muscle text not null default '',
  aliases text[] not null default '{}',
  instructions text not null default '',
  common_mistakes text not null default '',
  media_url text,
  is_compound boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_exercises_category on public.exercises(category);
create index if not exists idx_exercises_equipment on public.exercises(equipment);
create index if not exists idx_exercises_name_lower on public.exercises(lower(name));

grant select on public.exercises to authenticated;
alter table public.exercises enable row level security;
drop policy if exists "Public exercises are readable by authenticated users" on public.exercises;
create policy "Public exercises are readable by authenticated users" on public.exercises for select to authenticated using (true);

create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in (
    'Back', 'Biceps', 'Chest', 'Triceps', 'Legs', 'Shoulders', 'Abs',
    'Forearms', 'Traps', 'Neck', 'Cardio', 'Glutes', 'Full Body',
    'Calisthenics', 'Mobility',
    'Quadriceps', 'Hamstrings', 'Calves', 'Abs and Core', 'Full body'
  )),
  equipment text not null default 'Other',
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create index if not exists idx_custom_exercises_user on public.custom_exercises(user_id);
create trigger trg_custom_exercises_updated_at
before update on public.custom_exercises
for each row execute function public.set_updated_at();

alter table public.custom_exercises enable row level security;
drop policy if exists "Users manage own custom exercises" on public.custom_exercises;
create policy "Users manage own custom exercises" on public.custom_exercises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 4. WORKOUT PLANS & WORKOUT PLAN EXERCISES
-- ============================================================================
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  split_type text not null check (split_type in ('Push/Pull/Legs', 'Upper/Lower', 'Arnold split', 'Full body', 'Custom')),
  description text not null default '',
  is_system_template boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workout_plans_user on public.workout_plans(user_id);
create trigger trg_workout_plans_updated_at
before update on public.workout_plans
for each row execute function public.set_updated_at();

alter table public.workout_plans enable row level security;
create policy "Users read system templates or own workout plans" on public.workout_plans
  for select using (is_system_template = true or auth.uid() = user_id);
create policy "Users insert own workout plans" on public.workout_plans
  for insert with check (auth.uid() = user_id and is_system_template = false);
create policy "Users update own workout plans" on public.workout_plans
  for update using (auth.uid() = user_id and is_system_template = false);
create policy "Users delete own workout plans" on public.workout_plans
  for delete using (auth.uid() = user_id and is_system_template = false);

create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  custom_exercise_id uuid references public.custom_exercises(id) on delete set null,
  exercise_name text not null,
  exercise_category text not null default 'Full body',
  day_label text not null default 'Day 1',
  sort_order integer not null default 0,
  target_sets integer not null default 3 check (target_sets >= 1 and target_sets <= 20),
  target_reps text not null default '8-12',
  rest_seconds integer not null default 90,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_plan_exercises_plan on public.workout_plan_exercises(plan_id);
alter table public.workout_plan_exercises enable row level security;
create policy "Users read exercises for accessible workout plans" on public.workout_plan_exercises
  for select using (
    exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and (p.is_system_template = true or p.user_id = auth.uid())
    )
  );
create policy "Users manage exercises on own workout plans" on public.workout_plan_exercises
  for all using (
    exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and p.user_id = auth.uid() and p.is_system_template = false
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and p.user_id = auth.uid() and p.is_system_template = false
    )
  );

-- ============================================================================
-- 5. WORKOUT SESSIONS, SESSION EXERCISES & SETS (PERMANENT CLOUD HISTORY)
-- ============================================================================
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  plan_id uuid references public.workout_plans(id) on delete set null,
  workout_name text not null,
  workout_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  total_volume_kg numeric(12,2) not null default 0 check (total_volume_kg >= 0),
  session_notes text not null default '',
  status text not null default 'completed' check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, client_request_id)
);

create index if not exists idx_workout_sessions_user_date on public.workout_sessions(user_id, workout_date desc);
create trigger trg_workout_sessions_updated_at
before update on public.workout_sessions
for each row execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;
create policy "Users manage own workout sessions" on public.workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  custom_exercise_id uuid references public.custom_exercises(id) on delete set null,
  exercise_name text not null,
  exercise_category text not null default 'Full body',
  sort_order integer not null default 0,
  rest_seconds integer not null default 90,
  exercise_notes text not null default '',
  superset_group text default null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_session_exercises_session on public.workout_session_exercises(session_id);
create index if not exists idx_session_exercises_user_name on public.workout_session_exercises(user_id, exercise_name);
create trigger trg_workout_session_exercises_updated_at
before update on public.workout_session_exercises
for each row execute function public.set_updated_at();

alter table public.workout_session_exercises enable row level security;
create policy "Users manage own workout session exercises" on public.workout_session_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_exercise_id uuid not null references public.workout_session_exercises(id) on delete cascade,
  set_number integer not null check (set_number >= 1 and set_number <= 100),
  weight_kg numeric(7,2) not null default 0 check (weight_kg >= 0 and weight_kg <= 1000),
  reps integer not null default 0 check (reps >= 0 and reps <= 500),
  is_completed boolean not null default true,
  rest_seconds integer not null default 90,
  set_type text not null default 'normal' check (set_type in ('normal', 'warmup', 'drop', 'failure')),
  rpe numeric(3,1) default null check (rpe is null or (rpe >= 1 and rpe <= 10)),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workout_sets_session_ex on public.workout_sets(session_exercise_id, set_number);
create index if not exists idx_workout_sets_user on public.workout_sets(user_id);
create trigger trg_workout_sets_updated_at
before update on public.workout_sets
for each row execute function public.set_updated_at();

alter table public.workout_sets enable row level security;
create policy "Users manage own workout sets" on public.workout_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 6. FOODS, CUSTOM FOODS, SAVED MEALS, FOOD LOGS, NUTRITION GOALS, WATER LOGS
-- ============================================================================
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in (
    'Rice', 'Roti', 'Dal', 'Vegetables', 'Eggs', 'Milk', 'Paneer',
    'Chicken', 'Fish', 'Oats', 'Fruits', 'Nuts', 'Whey protein', 'Other Indian foods'
  )),
  serving_size numeric(8,2) not null default 100,
  serving_unit text not null default 'g',
  calories numeric(8,2) not null default 0,
  protein_g numeric(8,2) not null default 0,
  carbs_g numeric(8,2) not null default 0,
  fat_g numeric(8,2) not null default 0,
  fibre_g numeric(8,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_foods_category on public.foods(category);
alter table public.foods enable row level security;
create policy "Public foods readable by authenticated users" on public.foods for select to authenticated using (true);

create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other Indian foods',
  serving_size numeric(8,2) not null default 100,
  serving_unit text not null default 'g',
  calories numeric(8,2) not null default 0,
  protein_g numeric(8,2) not null default 0,
  carbs_g numeric(8,2) not null default 0,
  fat_g numeric(8,2) not null default 0,
  fibre_g numeric(8,2) not null default 0,
  is_favorite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_custom_foods_user on public.custom_foods(user_id);
create trigger trg_custom_foods_updated_at
before update on public.custom_foods
for each row execute function public.set_updated_at();

alter table public.custom_foods enable row level security;
create policy "Users manage own custom foods" on public.custom_foods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  meal_category text not null default 'lunch' check (meal_category in ('breakfast', 'lunch', 'dinner', 'snacks')),
  items jsonb not null default '[]'::jsonb,
  total_calories numeric(8,2) not null default 0,
  total_protein_g numeric(8,2) not null default 0,
  total_carbs_g numeric(8,2) not null default 0,
  total_fat_g numeric(8,2) not null default 0,
  total_fibre_g numeric(8,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_saved_meals_user on public.saved_meals(user_id);
create trigger trg_saved_meals_updated_at
before update on public.saved_meals
for each row execute function public.set_updated_at();

alter table public.saved_meals enable row level security;
create policy "Users manage own saved meals" on public.saved_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  custom_food_id uuid references public.custom_foods(id) on delete set null,
  food_name text not null,
  quantity numeric(8,2) not null check (quantity > 0),
  serving_unit text not null default 'serving',
  calories numeric(8,2) not null default 0 check (calories >= 0),
  protein_g numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8,2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8,2) not null default 0 check (fat_g >= 0),
  fibre_g numeric(8,2) not null default 0 check (fibre_g >= 0),
  meal_category text not null check (meal_category in ('breakfast', 'lunch', 'dinner', 'snacks')),
  logged_date date not null,
  logged_at timestamptz not null default timezone('utc', now()),
  is_favorite boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_food_logs_user_date on public.food_logs(user_id, logged_date desc);
create trigger trg_food_logs_updated_at
before update on public.food_logs
for each row execute function public.set_updated_at();

alter table public.food_logs enable row level security;
create policy "Users manage own food logs" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  calories_target integer not null default 2400 check (calories_target >= 800 and calories_target <= 10000),
  protein_target_g integer not null default 160 check (protein_target_g >= 20 and protein_target_g <= 500),
  carbs_target_g integer not null default 260 check (carbs_target_g >= 0 and carbs_target_g <= 1200),
  fat_target_g integer not null default 70 check (fat_target_g >= 10 and fat_target_g <= 400),
  fibre_target_g integer not null default 32 check (fibre_target_g >= 0 and fibre_target_g <= 150),
  water_target_ml integer not null default 3500 check (water_target_ml >= 500 and water_target_ml <= 12000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger trg_nutrition_goals_updated_at
before update on public.nutrition_goals
for each row execute function public.set_updated_at();

alter table public.nutrition_goals enable row level security;
create policy "Users manage own nutrition goals" on public.nutrition_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml integer not null check (amount_ml > 0 and amount_ml <= 5000),
  logged_date date not null,
  logged_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_water_logs_user_date on public.water_logs(user_id, logged_date desc);
create trigger trg_water_logs_updated_at
before update on public.water_logs
for each row execute function public.set_updated_at();

alter table public.water_logs enable row level security;
create policy "Users manage own water logs" on public.water_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 7. BODY WEIGHT, MEASUREMENTS & PROGRESS PHOTOS
-- ============================================================================
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(6,2) not null check (weight_kg >= 25 and weight_kg <= 350),
  logged_date date not null,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_weight_logs_user_date on public.weight_logs(user_id, logged_date desc);
create trigger trg_weight_logs_updated_at
before update on public.weight_logs
for each row execute function public.set_updated_at();

alter table public.weight_logs enable row level security;
create policy "Users manage own weight logs" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  chest_cm numeric(6,2),
  waist_cm numeric(6,2),
  arms_cm numeric(6,2),
  thighs_cm numeric(6,2),
  shoulders_cm numeric(6,2),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_body_measurements_user_date on public.body_measurements(user_id, logged_date desc);
create trigger trg_body_measurements_updated_at
before update on public.body_measurements
for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;
create policy "Users manage own body measurements" on public.body_measurements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  pose_tag text not null default 'front' check (pose_tag in ('front', 'side', 'back')),
  weight_kg numeric(6,2),
  taken_date date not null,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_progress_photos_user_date on public.progress_photos(user_id, taken_date desc);
create trigger trg_progress_photos_updated_at
before update on public.progress_photos
for each row execute function public.set_updated_at();

alter table public.progress_photos enable row level security;
create policy "Users manage own progress photos" on public.progress_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private Storage bucket for progress photos
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "Users can upload own progress photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own progress photos"
on storage.objects for select to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own progress photos"
on storage.objects for delete to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 8. AI CONVERSATIONS, AI MESSAGES & USAGE LIMITS
-- ============================================================================
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Coaching Session',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_conversations_user on public.ai_conversations(user_id, updated_at desc);
create trigger trg_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;
create policy "Users manage own AI conversations" on public.ai_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider text,
  model text,
  fallback_used boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_ai_messages_convo on public.ai_messages(conversation_id, created_at asc);
alter table public.ai_messages enable row level security;
create policy "Users manage own AI messages" on public.ai_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, usage_date)
);

alter table public.ai_usage_logs enable row level security;
create policy "Users can view own AI usage" on public.ai_usage_logs
  for select using (auth.uid() = user_id);

-- ============================================================================
-- 9. USER WIDGETS & REMINDERS
-- ============================================================================
create table if not exists public.user_widgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  widget_key text not null,
  title text not null,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, widget_key)
);

create index if not exists idx_user_widgets_user on public.user_widgets(user_id, sort_order);
create trigger trg_user_widgets_updated_at
before update on public.user_widgets
for each row execute function public.set_updated_at();

alter table public.user_widgets enable row level security;
create policy "Users manage own widgets" on public.user_widgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  reminder_type text not null check (reminder_type in ('workout', 'hydration', 'meal', 'weigh_in', 'custom')),
  schedule_time text not null default '07:30',
  days_of_week text[] not null default array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_reminders_user on public.user_reminders(user_id);
create trigger trg_user_reminders_updated_at
before update on public.user_reminders
for each row execute function public.set_updated_at();

alter table public.user_reminders enable row level security;
create policy "Users manage own reminders" on public.user_reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 10. AUTO-INITIALIZE USER ACCOUNT RECORDS ON SIGNUP
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.nutrition_goals (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_widgets (user_id, widget_key, title, is_visible, sort_order)
  values
    (new.id, 'quick_actions', 'Quick Actions', true, 1),
    (new.id, 'calories_macros', 'Daily Calories & Macros', true, 2),
    (new.id, 'body_weight', 'Weight & Goal', true, 3),
    (new.id, 'hydration', 'Water Intake', true, 4),
    (new.id, 'today_workout', 'Today''s Workout', true, 5),
    (new.id, 'weekly_streak', 'Weekly Streak & Activity', true, 6),
    (new.id, 'recent_workouts', 'Recent Workout History', true, 7)
  on conflict (user_id, widget_key) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
