-- GYM PAGLU: Atomic & Idempotent Workout Session Save RPC
-- Fixes partial-save and retry-idempotency bug where workout_sessions could be
-- committed without all workout_session_exercises and workout_sets records.
--
-- Security model:
--   - SECURITY INVOKER: respects all PostgreSQL Row Level Security policies.
--   - Authenticates caller via auth.uid() and verifies p_user_id = auth.uid().
--   - Never uses service-role credentials or bypasses RLS.

-- Ensure Phase 1 columns and payload_hash exist idempotently on existing databases
alter table public.workout_sessions
  add column if not exists payload_hash text default null;

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
  v_workout_name text;
  v_workout_date date;
  v_started_at timestamptz;
  v_session_notes text;
  v_duration_seconds integer;

  v_expected_ex_count integer := 0;
  v_expected_set_count integer := 0;
  v_seen_ex_orders integer[] := '{}'::integer[];
  v_seen_set_numbers integer[];

  v_canonical_exercises jsonb := '[]'::jsonb;
  v_canonical_sets jsonb;
  v_payload_hash text;

  v_existing_id uuid;
  v_existing_status text;
  v_existing_payload_hash text;
  v_existing_ex_count integer := 0;
  v_existing_set_count integer := 0;
  v_existing_structurally_complete boolean := false;
  v_existing_matches_payload boolean := false;

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
  v_name_match_count integer := 0;
  v_matched_ex_id uuid;
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

  -- 2. Normalize parent fields and validate complete payload BEFORE any database writes
  v_workout_name := coalesce(nullif(btrim(p_workout_name), ''), 'Training Session');
  v_workout_date := coalesce(p_workout_date, current_date);
  v_started_at := coalesce(p_started_at, timezone('utc', now()));
  v_session_notes := btrim(coalesce(p_session_notes, ''));
  v_duration_seconds := greatest(0, coalesce(p_duration_seconds, 0));

  if p_exercises is null
     or jsonb_typeof(p_exercises) is distinct from 'array'
     or jsonb_array_length(p_exercises) = 0 then
    raise exception 'At least one exercise is required to save a workout session.'
      using errcode = '22023';
  end if;

  v_expected_ex_count := jsonb_array_length(p_exercises);

  -- Validate plan_id strictly if supplied (never silently replace invalid/inaccessible plan_id with NULL)
  if p_plan_id is not null then
    select wp.id
    into v_valid_plan_id
    from public.workout_plans wp
    where wp.id = p_plan_id
      and (wp.is_system_template = true or wp.user_id = v_auth_uid);

    if v_valid_plan_id is null then
      raise exception 'Invalid or inaccessible workout plan_id (%).', p_plan_id
        using errcode = '22023';
    end if;
  end if;

  -- Validate every exercise, every sets array, and every set field, and build canonical fingerprint
  for v_ex in
    select elem, ord
    from jsonb_array_elements(p_exercises) with ordinality as t(elem, ord)
    order by ord asc
  loop
    if v_ex.elem is null or jsonb_typeof(v_ex.elem) is distinct from 'object' then
      raise exception 'Workout exercise entry at position % must be a JSON object.', v_ex.ord
        using errcode = '22023';
    end if;

    v_ex_name := nullif(btrim(coalesce(v_ex.elem->>'exercise_name', '')), '');
    if v_ex_name is null then
      raise exception 'Each workout exercise must include a non-empty exercise_name (position %).', v_ex.ord
        using errcode = '22023';
    end if;

    if not (v_ex.elem ? 'sets')
       or v_ex.elem->'sets' is null
       or jsonb_typeof(v_ex.elem->'sets') is distinct from 'array' then
      raise exception 'Exercise "%" must contain a valid sets JSON array.', v_ex_name
        using errcode = '22023';
    end if;

    if jsonb_array_length(v_ex.elem->'sets') <= 0 then
      raise exception 'Exercise "%" must contain at least one set.', v_ex_name
        using errcode = '22023';
    end if;

    v_ex_category := coalesce(nullif(btrim(coalesce(v_ex.elem->>'exercise_category', '')), ''), 'Full body');
    v_ex_sort_order := coalesce(nullif(btrim(coalesce(v_ex.elem->>'sort_order', '')), '')::integer, v_ex.ord::integer);
    if v_ex_sort_order < 1 then
      raise exception 'Exercise "%" has invalid sort_order (%).', v_ex_name, v_ex_sort_order
        using errcode = '22023';
    end if;
    if v_ex_sort_order = any(v_seen_ex_orders) then
      raise exception 'Duplicate exercise sort_order (%) for "%".', v_ex_sort_order, v_ex_name
        using errcode = '22023';
    end if;
    v_seen_ex_orders := array_append(v_seen_ex_orders, v_ex_sort_order);

    v_ex_rest_seconds := greatest(0, coalesce(nullif(btrim(coalesce(v_ex.elem->>'rest_seconds', '')), '')::integer, 90));
    v_ex_notes := btrim(coalesce(v_ex.elem->>'exercise_notes', ''));
    v_ex_superset := nullif(btrim(coalesce(v_ex.elem->>'superset_group', '')), '');

    v_seen_set_numbers := '{}'::integer[];
    v_canonical_sets := '[]'::jsonb;

    for v_st in
      select elem, ord
      from jsonb_array_elements(v_ex.elem->'sets') with ordinality as s(elem, ord)
      order by ord asc
    loop
      if v_st.elem is null or jsonb_typeof(v_st.elem) is distinct from 'object' then
        raise exception 'Set entry % for exercise "%" must be a JSON object.', v_st.ord, v_ex_name
          using errcode = '22023';
      end if;

      v_set_number := coalesce(nullif(btrim(coalesce(v_st.elem->>'set_number', '')), '')::integer, v_st.ord::integer);
      if v_set_number < 1 or v_set_number > 100 then
        raise exception 'Set number (%) for "%" must be between 1 and 100.', v_set_number, v_ex_name
          using errcode = '22023';
      end if;
      if v_set_number = any(v_seen_set_numbers) then
        raise exception 'Duplicate set_number (%) in exercise "%".', v_set_number, v_ex_name
          using errcode = '22023';
      end if;
      v_seen_set_numbers := array_append(v_seen_set_numbers, v_set_number);

      v_weight_kg := coalesce(nullif(btrim(coalesce(v_st.elem->>'weight_kg', '')), '')::numeric, 0)::numeric(7,2);
      if v_weight_kg < 0 or v_weight_kg > 1000 then
        raise exception 'Set % weight (%) for "%" must be between 0 and 1000 kg.', v_set_number, v_weight_kg, v_ex_name
          using errcode = '22023';
      end if;

      v_reps := coalesce(round(nullif(btrim(coalesce(v_st.elem->>'reps', '')), '')::numeric)::integer, 0);
      if v_reps < 0 or v_reps > 500 then
        raise exception 'Set % reps (%) for "%" must be between 0 and 500.', v_set_number, v_reps, v_ex_name
          using errcode = '22023';
      end if;

      v_is_completed := coalesce((v_st.elem->>'is_completed')::boolean, false);
      v_set_rest_seconds := greatest(
        0,
        coalesce(nullif(btrim(coalesce(v_st.elem->>'rest_seconds', '')), '')::integer, v_ex_rest_seconds, 90)
      );
      v_set_type := coalesce(nullif(btrim(coalesce(v_st.elem->>'set_type', '')), ''), 'normal');
      if v_set_type not in ('normal', 'warmup', 'drop', 'failure') then
        raise exception 'Invalid set_type "%" on set % of "%".', v_set_type, v_set_number, v_ex_name
          using errcode = '22023';
      end if;

      if v_st.elem ? 'rpe' and nullif(btrim(coalesce(v_st.elem->>'rpe', '')), '') is not null then
        v_rpe := (v_st.elem->>'rpe')::numeric(3,1);
        if v_rpe < 1 or v_rpe > 10 then
          raise exception 'RPE (%) on set % of "%" must be between 1 and 10.', v_rpe, v_set_number, v_ex_name
            using errcode = '22023';
        end if;
      else
        v_rpe := null;
      end if;

      v_expected_set_count := v_expected_set_count + 1;

      if v_is_completed and v_weight_kg >= 0 and v_reps > 0 then
        v_total_volume_kg := v_total_volume_kg + (v_weight_kg * v_reps);
      end if;

      v_canonical_sets := v_canonical_sets || jsonb_build_array(
        jsonb_build_object(
          'set_number', v_set_number,
          'weight_kg', v_weight_kg,
          'reps', v_reps,
          'is_completed', v_is_completed,
          'rest_seconds', v_set_rest_seconds,
          'set_type', v_set_type,
          'rpe', v_rpe
        )
      );
    end loop;

    v_canonical_exercises := v_canonical_exercises || jsonb_build_array(
      jsonb_build_object(
        'sort_order', v_ex_sort_order,
        'exercise_name', v_ex_name,
        'exercise_category', v_ex_category,
        'rest_seconds', v_ex_rest_seconds,
        'exercise_notes', v_ex_notes,
        'superset_group', v_ex_superset,
        'sets', v_canonical_sets
      )
    );
  end loop;

  v_total_volume_kg := round(coalesce(v_total_volume_kg, 0)::numeric, 2)::numeric(12,2);

  -- Deterministic SHA-256 fingerprint of the canonical workout content
  v_payload_hash := encode(
    sha256(
      convert_to(
        jsonb_build_object(
          'user_id', v_auth_uid,
          'client_request_id', p_client_request_id,
          'plan_id', v_valid_plan_id,
          'workout_name', v_workout_name,
          'workout_date', v_workout_date,
          'started_at', v_started_at,
          'session_notes', v_session_notes,
          'exercises', v_canonical_exercises
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  -- 3. Serialize concurrent requests for the same (user_id, client_request_id)
  perform pg_advisory_xact_lock(
    hashtext(v_auth_uid::text),
    hashtext(p_client_request_id::text)
  );

  -- 4. Inspect any existing session for this client_request_id
  select ws.id, ws.status, ws.payload_hash
  into v_existing_id, v_existing_status, v_existing_payload_hash
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

    -- Determine whether the existing DB record is structurally complete on its own
    v_existing_structurally_complete := (
      v_existing_status = 'completed'
      and v_existing_ex_count > 0
      and v_existing_set_count > 0
      and not exists (
        select 1
        from public.workout_session_exercises wse
        where wse.session_id = v_existing_id
          and wse.user_id = v_auth_uid
          and not exists (
            select 1
            from public.workout_sets wst
            where wst.session_exercise_id = wse.id
              and wst.user_id = v_auth_uid
          )
      )
    );

    -- If payload_hash exists and differs, reject conflicting reuse of client_request_id
    if v_existing_payload_hash is not null and v_existing_payload_hash <> v_payload_hash then
      if v_existing_structurally_complete then
        raise exception 'Idempotency conflict: client_request_id (%) already belongs to a different completed workout.', p_client_request_id
          using errcode = '23505';
      else
        raise exception 'Idempotency conflict: client_request_id (%) does not match the payload of the existing session.', p_client_request_id
          using errcode = '23505';
      end if;
    end if;

    -- Strict structural verification against the submitted payload:
    -- exact exercise count, exact total set count, exact sort_order & exercise_name,
    -- exact per-exercise set count, exact set_number sequence & values, no missing or extra rows.
    v_existing_matches_payload := (
      v_existing_status = 'completed'
      and v_existing_ex_count = v_expected_ex_count
      and v_existing_set_count = v_expected_set_count
      and not exists (
        -- Any expected exercise missing or mismatched in DB
        select 1
        from jsonb_array_elements(v_canonical_exercises) as pex(elem)
        left join public.workout_session_exercises wse
          on wse.session_id = v_existing_id
          and wse.user_id = v_auth_uid
          and wse.sort_order = (pex.elem->>'sort_order')::integer
        where wse.id is null
          or wse.exercise_name <> (pex.elem->>'exercise_name')
          or (
            select count(*)
            from public.workout_sets wst
            where wst.session_exercise_id = wse.id
              and wst.user_id = v_auth_uid
          ) <> jsonb_array_length(pex.elem->'sets')
          or exists (
            -- Any expected set missing or mismatched
            select 1
            from jsonb_array_elements(pex.elem->'sets') as pst(elem)
            left join public.workout_sets wst
              on wst.session_exercise_id = wse.id
              and wst.user_id = v_auth_uid
              and wst.set_number = (pst.elem->>'set_number')::integer
            where wst.id is null
              or wst.weight_kg <> (pst.elem->>'weight_kg')::numeric(7,2)
              or wst.reps <> (pst.elem->>'reps')::integer
              or wst.is_completed <> (pst.elem->>'is_completed')::boolean
              or wst.set_type <> (pst.elem->>'set_type')
              or wst.rpe is distinct from (
                case
                  when pst.elem->>'rpe' is not null then (pst.elem->>'rpe')::numeric(3,1)
                  else null
                end
              )
          )
          or exists (
            -- Any unexpected extra set_number on this exercise
            select 1
            from public.workout_sets wst
            where wst.session_exercise_id = wse.id
              and wst.user_id = v_auth_uid
              and not exists (
                select 1
                from jsonb_array_elements(pex.elem->'sets') as pst(elem)
                where (pst.elem->>'set_number')::integer = wst.set_number
              )
          )
      )
      and not exists (
        -- Any unexpected extra exercise on this session
        select 1
        from public.workout_session_exercises wse
        where wse.session_id = v_existing_id
          and wse.user_id = v_auth_uid
          and not exists (
            select 1
            from jsonb_array_elements(v_canonical_exercises) as pex(elem)
            where (pex.elem->>'sort_order')::integer = wse.sort_order
          )
      )
    );

    if v_existing_matches_payload then
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

    -- Never delete a structurally complete existing workout when a different payload is submitted
    if v_existing_structurally_complete and v_existing_ex_count >= v_expected_ex_count then
      raise exception 'Idempotency conflict: client_request_id (%) already belongs to a completed workout with different content.', p_client_request_id
        using errcode = '23505';
    end if;

    if v_existing_structurally_complete and v_existing_payload_hash is null then
      -- Legacy completed row whose exercises/sets do not match the submitted payload:
      -- only treat as an incomplete legacy save if existing exercises and sets are a strict subset
      -- (i.e. missing trailing exercises/sets from a mid-loop crash); otherwise reject.
      if exists (
        select 1
        from public.workout_session_exercises wse
        where wse.session_id = v_existing_id
          and wse.user_id = v_auth_uid
          and not exists (
            select 1
            from jsonb_array_elements(v_canonical_exercises) as pex(elem)
            where (pex.elem->>'sort_order')::integer = wse.sort_order
              and (pex.elem->>'exercise_name') = wse.exercise_name
              and not exists (
                select 1
                from public.workout_sets wst
                where wst.session_exercise_id = wse.id
                  and wst.user_id = v_auth_uid
                  and not exists (
                    select 1
                    from jsonb_array_elements(pex.elem->'sets') as pst(elem)
                    where (pst.elem->>'set_number')::integer = wst.set_number
                      and wst.weight_kg = (pst.elem->>'weight_kg')::numeric(7,2)
                      and wst.reps = (pst.elem->>'reps')::integer
                      and wst.is_completed = (pst.elem->>'is_completed')::boolean
                  )
              )
          )
      ) then
        raise exception 'Idempotency conflict: client_request_id (%) already belongs to a different completed workout.', p_client_request_id
          using errcode = '23505';
      end if;
    end if;

    -- Safe cleanup of incomplete legacy session: delete child sets -> exercises -> parent explicitly
    -- without relying on ON DELETE CASCADE, inside this same atomic transaction.
    delete from public.workout_sets wst
    using public.workout_session_exercises wse
    where wst.session_exercise_id = wse.id
      and wse.session_id = v_existing_id
      and wse.user_id = v_auth_uid
      and wst.user_id = v_auth_uid;

    delete from public.workout_session_exercises
    where session_id = v_existing_id
      and user_id = v_auth_uid;

    delete from public.workout_sessions
    where id = v_existing_id
      and user_id = v_auth_uid;
  end if;

  -- 5. Insert workout_sessions parent record
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
    status,
    payload_hash
  )
  values (
    v_auth_uid,
    p_client_request_id,
    v_valid_plan_id,
    v_workout_name,
    v_workout_date,
    v_started_at,
    p_ended_at,
    v_duration_seconds,
    v_total_volume_kg,
    v_session_notes,
    'completed',
    v_payload_hash
  )
  returning id into v_session_id;

  -- 6. Insert every validated exercise and every child set within the same transaction
  for v_ex in
    select elem, ord
    from jsonb_array_elements(p_exercises) with ordinality as t(elem, ord)
    order by ord asc
  loop
    v_ex_name := nullif(btrim(coalesce(v_ex.elem->>'exercise_name', '')), '');
    v_ex_category := coalesce(nullif(btrim(coalesce(v_ex.elem->>'exercise_category', '')), ''), 'Full body');
    v_ex_sort_order := coalesce(nullif(btrim(coalesce(v_ex.elem->>'sort_order', '')), '')::integer, v_ex.ord::integer);
    v_ex_rest_seconds := greatest(0, coalesce(nullif(btrim(coalesce(v_ex.elem->>'rest_seconds', '')), '')::integer, 90));
    v_ex_notes := btrim(coalesce(v_ex.elem->>'exercise_notes', ''));
    v_ex_superset := nullif(btrim(coalesce(v_ex.elem->>'superset_group', '')), '');

    -- Deterministic exercise_id / custom_exercise_id resolution
    v_resolved_exercise_id := null;
    v_resolved_custom_exercise_id := null;

    v_raw_custom_exercise_id := nullif(btrim(coalesce(v_ex.elem->>'custom_exercise_id', '')), '');
    if v_raw_custom_exercise_id is not null
       and v_raw_custom_exercise_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select ce.id into v_resolved_custom_exercise_id
      from public.custom_exercises ce
      where ce.id = v_raw_custom_exercise_id::uuid
        and ce.user_id = v_auth_uid;
    end if;

    v_raw_exercise_id := nullif(btrim(coalesce(v_ex.elem->>'exercise_id', '')), '');
    if v_resolved_custom_exercise_id is null
       and v_raw_exercise_id is not null
       and v_raw_exercise_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and v_raw_exercise_id not ilike 'a0000000-%' then
      select e.id into v_resolved_exercise_id
      from public.exercises e
      where e.id = v_raw_exercise_id::uuid;
    end if;

    -- Deterministic name resolution when no direct DB UUID matched (e.g. synthetic a0000000-... catalog ID):
    -- Only associate when an exact match is unambiguous (count = 1). Never pick an arbitrary row on duplicates.
    if v_resolved_exercise_id is null and v_resolved_custom_exercise_id is null then
      select count(*)::integer, min(e.id::text)::uuid
      into v_name_match_count, v_matched_ex_id
      from public.exercises e
      where lower(btrim(e.name)) = lower(v_ex_name);

      if v_name_match_count = 1 then
        v_resolved_exercise_id := v_matched_ex_id;
      elsif v_name_match_count > 1 then
        -- Disambiguate using exact case-sensitive trimmed match if unique
        select count(*)::integer, min(e.id::text)::uuid
        into v_name_match_count, v_matched_ex_id
        from public.exercises e
        where btrim(e.name) = v_ex_name;

        if v_name_match_count = 1 then
          v_resolved_exercise_id := v_matched_ex_id;
        end if;
      end if;

      if v_resolved_exercise_id is null then
        select count(*)::integer, min(ce.id::text)::uuid
        into v_name_match_count, v_matched_ex_id
        from public.custom_exercises ce
        where ce.user_id = v_auth_uid
          and lower(btrim(ce.name)) = lower(v_ex_name);

        if v_name_match_count = 1 then
          v_resolved_custom_exercise_id := v_matched_ex_id;
        end if;
      end if;
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

  -- 7. Return the complete saved workout hierarchy atomically
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
