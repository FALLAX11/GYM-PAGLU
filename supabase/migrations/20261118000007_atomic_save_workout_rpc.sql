-- GYM PAGLU: Atomic & Idempotent Workout Session Save RPC
-- Fixes partial-save and retry-idempotency bug where workout_sessions could be
-- committed without all workout_session_exercises and workout_sets records.
--
-- Security model:
--   - SECURITY INVOKER (default): respects all PostgreSQL Row Level Security policies.
--   - Authenticates caller via auth.uid() and verifies p_user_id = auth.uid().
--   - Never uses service-role credentials or bypasses RLS.

-- Ensure Phase 1 columns exist on databases that may not have run 000004 yet
alter table public.workout_session_exercises
  add column if not exists superset_group text default null;

alter table public.workout_sets
  add column if not exists set_type text not null default 'normal';

alter table public.workout_sets
  add column if not exists rpe numeric(3,1) default null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_sets_set_type_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_set_type_check
      check (set_type in ('normal', 'warmup', 'drop', 'failure'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_sets_rpe_check'
  ) then
    alter table public.workout_sets
      add constraint workout_sets_rpe_check
      check (rpe is null or (rpe >= 1 and rpe <= 10));
  end if;
end $$;

create or replace function public.save_workout_session_atomic(
  p_user_id uuid,
  p_client_request_id uuid,
  p_plan_id uuid default null,
  p_workout_name text default 'Training Session',
  p_workout_date date default current_date,
  p_started_at timestamptz default timezone('utc', now()),
  p_ended_at timestamptz default timezone('utc', now()),
  p_duration_seconds integer default 0,
  p_session_notes text default '',
  p_exercises jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_auth_uid uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_ex_count integer := 0;
  v_existing_set_count integer := 0;
  v_expected_ex_count integer := 0;
  v_expected_set_count integer := 0;
  v_existing_has_incomplete_ex boolean := false;

  v_valid_plan_id uuid := null;
  v_session_id uuid;
  v_total_volume_kg numeric(12,2) := 0;

  v_ex record;
  v_st record;
  v_ex_id uuid;
  v_raw_exercise_id text;
  v_raw_custom_exercise_id text;
  v_resolved_exercise_id uuid;
  v_resolved_custom_exercise_id uuid;
  v_ex_name text;
  v_ex_category text;
  v_ex_sort_order integer;
  v_ex_rest_seconds integer;
  v_ex_notes text;
  v_ex_superset text;

  v_set_number integer;
  v_weight_kg numeric(7,2);
  v_reps integer;
  v_is_completed boolean;
  v_set_rest_seconds integer;
  v_set_type text;
  v_rpe numeric(3,1);

  v_result jsonb;
begin
  -- 1. Authenticate caller and enforce strict user ownership
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Authentication required to save workout session.'
      using errcode = '28000';
  end if;

  if p_user_id is null or p_user_id <> v_auth_uid then
    raise exception 'Forbidden: requested user_id does not match authenticated user.'
      using errcode = '42501';
  end if;

  if p_client_request_id is null then
    raise exception 'client_request_id is required for idempotent workout saves.'
      using errcode = '22004';
  end if;

  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' or jsonb_array_length(p_exercises) = 0 then
    raise exception 'At least one exercise is required to save a workout session.'
      using errcode = '22023';
  end if;

  v_expected_ex_count := jsonb_array_length(p_exercises);

  select coalesce(
    sum(
      case
        when jsonb_typeof(elem->'sets') = 'array' then jsonb_array_length(elem->'sets')
        else 0
      end
    ),
    0
  )::integer
  into v_expected_set_count
  from jsonb_array_elements(p_exercises) as elem;

  if v_expected_set_count <= 0 then
    raise exception 'At least one set is required to save a workout session.'
      using errcode = '22023';
  end if;

  -- 2. Serialize concurrent retries for the same (user_id, client_request_id) within this transaction
  perform pg_advisory_xact_lock(
    hashtext(v_auth_uid::text),
    hashtext(p_client_request_id::text)
  );

  -- 3. Check for existing session with this client_request_id
  select ws.id, ws.status
  into v_existing_id, v_existing_status
  from public.workout_sessions ws
  where ws.user_id = v_auth_uid
    and ws.client_request_id = p_client_request_id;

  if v_existing_id is not null then
    select
      count(distinct wse.id)::integer,
      count(wst.id)::integer
    into v_existing_ex_count, v_existing_set_count
    from public.workout_session_exercises wse
    left join public.workout_sets wst
      on wst.session_exercise_id = wse.id
      and wst.user_id = v_auth_uid
    where wse.session_id = v_existing_id
      and wse.user_id = v_auth_uid;

    -- Verify every existing exercise that expected sets actually has sets persisted
    select exists (
      select 1
      from jsonb_array_elements(p_exercises) with ordinality as pex(elem, ord)
      left join public.workout_session_exercises wse
        on wse.session_id = v_existing_id
        and wse.user_id = v_auth_uid
        and wse.sort_order = coalesce(nullif(btrim(pex.elem->>'sort_order'), '')::integer, pex.ord::integer)
      where (
        case
          when jsonb_typeof(pex.elem->'sets') = 'array' then jsonb_array_length(pex.elem->'sets')
          else 0
        end
      ) > 0
      and (
        wse.id is null
        or (
          select count(*)
          from public.workout_sets wst
          where wst.session_exercise_id = wse.id
            and wst.user_id = v_auth_uid
        ) < jsonb_array_length(pex.elem->'sets')
      )
    )
    into v_existing_has_incomplete_ex;

    -- Only return existing record if it is truly completed and structurally complete
    if v_existing_status = 'completed'
       and v_existing_ex_count >= v_expected_ex_count
       and v_existing_set_count >= v_expected_set_count
       and not v_existing_has_incomplete_ex then

      select jsonb_build_object(
        'id', ws.id,
        'user_id', ws.user_id,
        'client_request_id', ws.client_request_id,
        'plan_id', ws.plan_id,
        'workout_name', ws.workout_name,
        'workout_date', ws.workout_date,
        'started_at', ws.started_at,
        'ended_at', ws.ended_at,
        'duration_seconds', ws.duration_seconds,
        'total_volume_kg', ws.total_volume_kg,
        'session_notes', ws.session_notes,
        'status', ws.status,
        'created_at', ws.created_at,
        'updated_at', ws.updated_at,
        'workout_session_exercises', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', wse.id,
                'user_id', wse.user_id,
                'session_id', wse.session_id,
                'exercise_id', wse.exercise_id,
                'custom_exercise_id', wse.custom_exercise_id,
                'exercise_name', wse.exercise_name,
                'exercise_category', wse.exercise_category,
                'sort_order', wse.sort_order,
                'rest_seconds', wse.rest_seconds,
                'exercise_notes', wse.exercise_notes,
                'superset_group', wse.superset_group,
                'created_at', wse.created_at,
                'updated_at', wse.updated_at,
                'workout_sets', coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', wst.id,
                        'user_id', wst.user_id,
                        'session_exercise_id', wst.session_exercise_id,
                        'set_number', wst.set_number,
                        'weight_kg', wst.weight_kg,
                        'reps', wst.reps,
                        'is_completed', wst.is_completed,
                        'rest_seconds', wst.rest_seconds,
                        'set_type', wst.set_type,
                        'rpe', wst.rpe,
                        'created_at', wst.created_at,
                        'updated_at', wst.updated_at
                      )
                      order by wst.set_number asc
                    )
                    from public.workout_sets wst
                    where wst.session_exercise_id = wse.id
                      and wst.user_id = v_auth_uid
                  ),
                  '[]'::jsonb
                )
              )
              order by wse.sort_order asc
            )
            from public.workout_session_exercises wse
            where wse.session_id = ws.id
              and wse.user_id = v_auth_uid
          ),
          '[]'::jsonb
        )
      )
      into v_result
      from public.workout_sessions ws
      where ws.id = v_existing_id
        and ws.user_id = v_auth_uid;

      return v_result;
    end if;

    -- Clean up any legacy incomplete partial parent before atomically re-saving.
    -- If anything below fails, this delete also rolls back cleanly.
    delete from public.workout_sessions
    where id = v_existing_id
      and user_id = v_auth_uid;
  end if;

  -- 4. Validate optional plan_id ownership/accessibility
  if p_plan_id is not null then
    select wp.id
    into v_valid_plan_id
    from public.workout_plans wp
    where wp.id = p_plan_id
      and (wp.is_system_template = true or wp.user_id = v_auth_uid);
  end if;

  -- 5. Compute total volume from completed sets accurately on the server
  select coalesce(
    round(
      sum(
        case
          when coalesce((st.elem->>'is_completed')::boolean, false)
               and coalesce((st.elem->>'weight_kg')::numeric, 0) >= 0
               and coalesce(round((st.elem->>'reps')::numeric)::integer, 0) > 0
            then coalesce((st.elem->>'weight_kg')::numeric, 0)
                 * coalesce(round((st.elem->>'reps')::numeric)::integer, 0)
          else 0
        end
      )::numeric,
      2
    ),
    0
  )::numeric(12,2)
  into v_total_volume_kg
  from jsonb_array_elements(p_exercises) as ex(elem)
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(ex.elem->'sets') = 'array' then ex.elem->'sets'
      else '[]'::jsonb
    end
  ) as st(elem);

  -- 6. Insert workout_sessions parent record
  insert into public.workout_sessions (
    user_id,
    client_request_id,
    plan_id,
    workout_name,
    workout_date,
    started_at,
    ended_at,
    duration_seconds,
    total_volume_kg,
    session_notes,
    status
  )
  values (
    v_auth_uid,
    p_client_request_id,
    v_valid_plan_id,
    coalesce(nullif(btrim(p_workout_name), ''), 'Training Session'),
    coalesce(p_workout_date, current_date),
    coalesce(p_started_at, timezone('utc', now())),
    p_ended_at,
    greatest(0, coalesce(p_duration_seconds, 0)),
    coalesce(v_total_volume_kg, 0),
    btrim(coalesce(p_session_notes, '')),
    'completed'
  )
  returning id into v_session_id;

  -- 7. Insert every exercise and every child set within the same transaction
  for v_ex in
    select elem, ord
    from jsonb_array_elements(p_exercises) with ordinality as t(elem, ord)
    order by ord asc
  loop
    v_ex_name := nullif(btrim(coalesce(v_ex.elem->>'exercise_name', '')), '');
    if v_ex_name is null then
      raise exception 'Each workout exercise must include a non-empty exercise_name.'
        using errcode = '22023';
    end if;

    v_ex_category := coalesce(nullif(btrim(coalesce(v_ex.elem->>'exercise_category', '')), ''), 'Full body');
    v_ex_sort_order := coalesce(nullif(btrim(coalesce(v_ex.elem->>'sort_order', '')), '')::integer, v_ex.ord::integer);
    v_ex_rest_seconds := greatest(0, coalesce(nullif(btrim(coalesce(v_ex.elem->>'rest_seconds', '')), '')::integer, 90));
    v_ex_notes := btrim(coalesce(v_ex.elem->>'exercise_notes', ''));
    v_ex_superset := nullif(btrim(coalesce(v_ex.elem->>'superset_group', '')), '');

    -- Safely resolve exercise_id & custom_exercise_id without failing on synthetic local IDs
    v_resolved_exercise_id := null;
    v_resolved_custom_exercise_id := null;

    v_raw_exercise_id := nullif(btrim(coalesce(v_ex.elem->>'exercise_id', '')), '');
    if v_raw_exercise_id is not null
       and v_raw_exercise_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_raw_exercise_id not ilike 'a0000000-%' then
      select e.id into v_resolved_exercise_id
      from public.exercises e
      where e.id = v_raw_exercise_id::uuid;
    end if;

    v_raw_custom_exercise_id := nullif(btrim(coalesce(v_ex.elem->>'custom_exercise_id', '')), '');
    if v_raw_custom_exercise_id is not null
       and v_raw_custom_exercise_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select ce.id into v_resolved_custom_exercise_id
      from public.custom_exercises ce
      where ce.id = v_raw_custom_exercise_id::uuid
        and ce.user_id = v_auth_uid;
    end if;

    -- Fall back to matching public exercise by exact case-insensitive name if no custom/UUID match
    if v_resolved_exercise_id is null and v_resolved_custom_exercise_id is null then
      select e.id into v_resolved_exercise_id
      from public.exercises e
      where lower(e.name) = lower(v_ex_name)
      limit 1;
    end if;

    insert into public.workout_session_exercises (
      user_id,
      session_id,
      exercise_id,
      custom_exercise_id,
      exercise_name,
      exercise_category,
      sort_order,
      rest_seconds,
      exercise_notes,
      superset_group
    )
    values (
      v_auth_uid,
      v_session_id,
      v_resolved_exercise_id,
      v_resolved_custom_exercise_id,
      v_ex_name,
      v_ex_category,
      v_ex_sort_order,
      v_ex_rest_seconds,
      v_ex_notes,
      v_ex_superset
    )
    returning id into v_ex_id;

    if jsonb_typeof(v_ex.elem->'sets') <> 'array' then
      raise exception 'Exercise "%" must contain a valid sets array.', v_ex_name
        using errcode = '22023';
    end if;

    for v_st in
      select elem, ord
      from jsonb_array_elements(v_ex.elem->'sets') with ordinality as s(elem, ord)
      order by ord asc
    loop
      v_set_number := coalesce(nullif(btrim(coalesce(v_st.elem->>'set_number', '')), '')::integer, v_st.ord::integer);
      v_weight_kg := coalesce(nullif(btrim(coalesce(v_st.elem->>'weight_kg', '')), '')::numeric, 0)::numeric(7,2);
      v_reps := coalesce(round(nullif(btrim(coalesce(v_st.elem->>'reps', '')), '')::numeric)::integer, 0);
      v_is_completed := coalesce((v_st.elem->>'is_completed')::boolean, false);
      v_set_rest_seconds := greatest(
        0,
        coalesce(nullif(btrim(coalesce(v_st.elem->>'rest_seconds', '')), '')::integer, v_ex_rest_seconds, 90)
      );
      v_set_type := coalesce(nullif(btrim(coalesce(v_st.elem->>'set_type', '')), ''), 'normal');

      if v_st.elem ? 'rpe' and nullif(btrim(coalesce(v_st.elem->>'rpe', '')), '') is not null then
        v_rpe := (v_st.elem->>'rpe')::numeric(3,1);
      else
        v_rpe := null;
      end if;

      insert into public.workout_sets (
        user_id,
        session_exercise_id,
        set_number,
        weight_kg,
        reps,
        is_completed,
        rest_seconds,
        set_type,
        rpe
      )
      values (
        v_auth_uid,
        v_ex_id,
        v_set_number,
        v_weight_kg,
        v_reps,
        v_is_completed,
        v_set_rest_seconds,
        v_set_type,
        v_rpe
      );
    end loop;
  end loop;

  -- 8. Return the complete saved workout hierarchy atomically
  select jsonb_build_object(
    'id', ws.id,
    'user_id', ws.user_id,
    'client_request_id', ws.client_request_id,
    'plan_id', ws.plan_id,
    'workout_name', ws.workout_name,
    'workout_date', ws.workout_date,
    'started_at', ws.started_at,
    'ended_at', ws.ended_at,
    'duration_seconds', ws.duration_seconds,
    'total_volume_kg', ws.total_volume_kg,
    'session_notes', ws.session_notes,
    'status', ws.status,
    'created_at', ws.created_at,
    'updated_at', ws.updated_at,
    'workout_session_exercises', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', wse.id,
            'user_id', wse.user_id,
            'session_id', wse.session_id,
            'exercise_id', wse.exercise_id,
            'custom_exercise_id', wse.custom_exercise_id,
            'exercise_name', wse.exercise_name,
            'exercise_category', wse.exercise_category,
            'sort_order', wse.sort_order,
            'rest_seconds', wse.rest_seconds,
            'exercise_notes', wse.exercise_notes,
            'superset_group', wse.superset_group,
            'created_at', wse.created_at,
            'updated_at', wse.updated_at,
            'workout_sets', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', wst.id,
                    'user_id', wst.user_id,
                    'session_exercise_id', wst.session_exercise_id,
                    'set_number', wst.set_number,
                    'weight_kg', wst.weight_kg,
                    'reps', wst.reps,
                    'is_completed', wst.is_completed,
                    'rest_seconds', wst.rest_seconds,
                    'set_type', wst.set_type,
                    'rpe', wst.rpe,
                    'created_at', wst.created_at,
                    'updated_at', wst.updated_at
                  )
                  order by wst.set_number asc
                )
                from public.workout_sets wst
                where wst.session_exercise_id = wse.id
                  and wst.user_id = v_auth_uid
              ),
              '[]'::jsonb
            )
          )
          order by wse.sort_order asc
        )
        from public.workout_session_exercises wse
        where wse.session_id = ws.id
          and wse.user_id = v_auth_uid
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.workout_sessions ws
  where ws.id = v_session_id
    and ws.user_id = v_auth_uid;

  return v_result;
end;
$$;

revoke all on function public.save_workout_session_atomic(
  uuid, uuid, uuid, text, date, timestamptz, timestamptz, integer, text, jsonb
) from public;

grant execute on function public.save_workout_session_atomic(
  uuid, uuid, uuid, text, date, timestamptz, timestamptz, integer, text, jsonb
) to authenticated;
