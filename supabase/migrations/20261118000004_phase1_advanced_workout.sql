-- GYM PAGLU Phase 1 Migration: Advanced Set Tracking & Supersets
-- Idempotent migration: safe to run multiple times on existing databases.

alter table public.workout_session_exercises
  add column if not exists superset_group text default null;

alter table public.workout_sets
  add column if not exists set_type text not null default 'normal';

alter table public.workout_sets
  add column if not exists rpe numeric(3,1) default null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_set_type_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_set_type_check
      check (set_type in ('normal', 'warmup', 'drop', 'failure'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workout_sets_rpe_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_rpe_check
      check (rpe is null or (rpe >= 1 and rpe <= 10));
  end if;
end $$;
