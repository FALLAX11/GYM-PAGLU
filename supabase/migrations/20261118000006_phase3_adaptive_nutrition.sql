-- ============================================================================
-- GYM PAGLU: Phase 3 Adaptive Nutrition Coach & Check-Ins Migration (Additive)
-- Safe to run on top of 20261118000001..20261118000005.
-- ============================================================================

create table if not exists public.nutrition_coach_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  biological_sex text not null default 'unspecified'
    check (biological_sex in ('male', 'female', 'unspecified')),
  macro_style text not null default 'balanced'
    check (macro_style in ('balanced', 'high_protein', 'high_carb', 'low_carb')),
  weekly_rate_pct numeric not null default -0.5
    check (weekly_rate_pct >= -1.5 and weekly_rate_pct <= 1.0),
  auto_apply_checkins boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null default current_date,
  trend_weight_kg numeric,
  estimated_tdee integer not null check (estimated_tdee > 0),
  baseline_tdee integer not null check (baseline_tdee > 0),
  confidence text not null default 'formula'
    check (confidence in ('formula', 'calibrating', 'adaptive')),
  paired_days integer not null default 0,
  recommended_calories integer not null check (recommended_calories > 0),
  recommended_protein_g integer not null check (recommended_protein_g >= 0),
  recommended_carbs_g integer not null check (recommended_carbs_g >= 0),
  recommended_fat_g integer not null check (recommended_fat_g >= 0),
  recommended_fibre_g integer not null default 30,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_nutrition_checkins_user_date
  on public.nutrition_checkins (user_id, checkin_date desc);

alter table public.nutrition_coach_prefs enable row level security;
alter table public.nutrition_checkins enable row level security;

drop policy if exists "nutrition_coach_prefs_owner_all" on public.nutrition_coach_prefs;
create policy "nutrition_coach_prefs_owner_all" on public.nutrition_coach_prefs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "nutrition_checkins_owner_all" on public.nutrition_checkins;
create policy "nutrition_checkins_owner_all" on public.nutrition_checkins
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists trg_nutrition_coach_prefs_updated_at on public.nutrition_coach_prefs;
    create trigger trg_nutrition_coach_prefs_updated_at
      before update on public.nutrition_coach_prefs
      for each row execute function public.set_updated_at();
  end if;
end $$;
