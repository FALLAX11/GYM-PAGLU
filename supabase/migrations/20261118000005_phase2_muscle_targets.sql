-- GYM PAGLU Phase 2: Configurable Weekly Muscle Set Targets
-- Stores per-user weekly working-set targets per anatomical muscle region in JSONB.

create table if not exists public.user_muscle_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  targets jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_user_muscle_targets_updated_at on public.user_muscle_targets;
create trigger trg_user_muscle_targets_updated_at
before update on public.user_muscle_targets
for each row execute function public.set_updated_at();

alter table public.user_muscle_targets enable row level security;

drop policy if exists "Users manage own muscle targets" on public.user_muscle_targets;
create policy "Users manage own muscle targets"
  on public.user_muscle_targets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
