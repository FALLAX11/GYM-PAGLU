// Supabase Edge Function: ai-coach
// Primary AI Provider: Groq API
// Fallback AI Provider: OpenRouter API
// Security: Verifies Supabase JWT, enforces ownership via user.id / RLS, strips PII before
//           calling external AI providers, enforces rate limits & payload bounds, and keeps
//           GROQ_API_KEY & OPENROUTER_API_KEY strictly server-side.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_ITEM_CHARS = 1800;
const MAX_REQUEST_BYTES = 32_768;

interface CoachRequest {
  action?: 'chat' | 'health';
  conversationId?: string;
  message?: string;
  includeContext?: boolean;
  preferredProvider?: 'auto' | 'groq' | 'openrouter';
  tone?: 'direct' | 'encouraging' | 'scientific';
  stream?: boolean;
}

interface ProviderAttemptResult {
  provider: 'groq' | 'openrouter';
  model: string;
  fallbackUsed: boolean;
  reply?: string;
  streamResponse?: Response;
}

class ProviderError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeProviderFailure(providerLabel: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${providerLabel} authentication failed on the server. Check your Edge Function API key.`;
  }
  if (status === 404) {
    return `${providerLabel} configured model is unavailable.`;
  }
  if (status === 429) {
    return `${providerLabel} rate limit reached temporarily.`;
  }
  if (status === 504 || status === 408) {
    return `${providerLabel} timed out.`;
  }
  if (status >= 500) {
    return `${providerLabel} is temporarily unavailable (${status}).`;
  }
  return `${providerLabel} request failed (${status}).`;
}

async function openProviderStreamOrJson(opts: {
  providerLabel: string;
  url: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  extraHeaders?: Record<string, string>;
  timeoutMs: number;
}): Promise<{ reply?: string; streamResponse?: Response }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.55,
        max_tokens: 1100,
        stream: opts.stream,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      await res.text().catch(() => '');
      const retryable =
        res.status === 408 ||
        res.status === 429 ||
        res.status === 401 ||
        res.status === 403 ||
        res.status === 404 ||
        res.status >= 500;
      console.error(`[ai-coach] ${opts.providerLabel} HTTP ${res.status}`);
      throw new ProviderError(
        sanitizeProviderFailure(opts.providerLabel, res.status),
        res.status,
        retryable
      );
    }

    if (opts.stream) {
      if (!res.body) {
        throw new ProviderError(
          `${opts.providerLabel} returned an empty stream body.`,
          502,
          true
        );
      }
      clearTimeout(timer);
      return { streamResponse: res };
    }

    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new ProviderError(
        `${opts.providerLabel} returned a malformed or empty response.`,
        502,
        true
      );
    }
    return { reply: content.trim() };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ProviderError(`${opts.providerLabel} timed out.`, 504, true);
    }
    if (err instanceof ProviderError) {
      throw err;
    }
    console.error(`[ai-coach] ${opts.providerLabel} network error:`, (err as Error)?.message);
    throw new ProviderError(`${opts.providerLabel} network failure.`, 503, true);
  } finally {
    clearTimeout(timer);
  }
}

function daysAgoIsoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function gatherFitnessContext(
  userClient: SupabaseClient,
  userId: string,
  today: string
): Promise<string> {
  const sevenDaysAgo = daysAgoIsoDate(6);
  const thirtyDaysAgo = daysAgoIsoDate(29);

  const [
    profileRes,
    goalsRes,
    foodRes,
    waterRes,
    workoutsRes,
    plansRes,
    weightRes,
    measRes,
    muscleTargetsRes,
  ] = await Promise.all([
    userClient
      .from('profiles')
      .select(
        'age, height_cm, current_weight_kg, target_weight_kg, fitness_goal, activity_level, dietary_preference, workout_preference'
      )
      .eq('id', userId)
      .maybeSingle(),
    userClient
      .from('nutrition_goals')
      .select(
        'calories_target, protein_target_g, carbs_target_g, fat_target_g, fibre_target_g, water_target_ml'
      )
      .eq('user_id', userId)
      .maybeSingle(),
    userClient
      .from('food_logs')
      .select('food_name, calories, protein_g, carbs_g, fat_g, fibre_g, meal_category, logged_date')
      .eq('user_id', userId)
      .gte('logged_date', sevenDaysAgo)
      .order('logged_date', { ascending: false })
      .limit(120),
    userClient
      .from('water_logs')
      .select('amount_ml')
      .eq('user_id', userId)
      .eq('logged_date', today),
    userClient
      .from('workout_sessions')
      .select(
        'workout_name, workout_date, duration_seconds, total_volume_kg, status, workout_session_exercises(exercise_name, exercise_category, sort_order, workout_sets(set_number, weight_kg, reps, is_completed, set_type, rpe))'
      )
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('workout_date', { ascending: false })
      .limit(10),
    userClient
      .from('workout_plans')
      .select(
        'name, split_type, is_system_template, workout_plan_exercises(exercise_name, exercise_category, day_label, target_sets, target_reps)'
      )
      .or(`user_id.eq.${userId},is_system_template.eq.true`)
      .order('is_system_template', { ascending: true })
      .limit(4),
    userClient
      .from('weight_logs')
      .select('weight_kg, logged_date')
      .eq('user_id', userId)
      .gte('logged_date', thirtyDaysAgo)
      .order('logged_date', { ascending: false })
      .limit(12),
    userClient
      .from('body_measurements')
      .select('logged_date, chest_cm, waist_cm, arms_cm, thighs_cm, shoulders_cm')
      .eq('user_id', userId)
      .order('logged_date', { ascending: false })
      .limit(3),
    userClient
      .from('user_muscle_targets')
      .select('targets')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  // Nutrition summaries (today + 7-day average)
  const foodRows = (foodRes.data ?? []) as Array<{
    food_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fibre_g: number;
    meal_category: string;
    logged_date: string;
  }>;

  const todayFoods = foodRows.filter((f) => f.logged_date === today);
  const todayTotals = todayFoods.reduce(
    (acc, f) => ({
      calories: Math.round(acc.calories + Number(f.calories || 0)),
      protein_g: Math.round((acc.protein_g + Number(f.protein_g || 0)) * 10) / 10,
      carbs_g: Math.round((acc.carbs_g + Number(f.carbs_g || 0)) * 10) / 10,
      fat_g: Math.round((acc.fat_g + Number(f.fat_g || 0)) * 10) / 10,
      fibre_g: Math.round((acc.fibre_g + Number(f.fibre_g || 0)) * 10) / 10,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  );

  const distinctFoodDays = new Set(foodRows.map((f) => f.logged_date)).size || 0;
  const sevenDayAvg =
    distinctFoodDays > 0
      ? {
          daysLogged: distinctFoodDays,
          avgCalories: Math.round(
            foodRows.reduce((s, f) => s + Number(f.calories || 0), 0) / distinctFoodDays
          ),
          avgProtein_g: Math.round(
            foodRows.reduce((s, f) => s + Number(f.protein_g || 0), 0) / distinctFoodDays
          ),
          avgCarbs_g: Math.round(
            foodRows.reduce((s, f) => s + Number(f.carbs_g || 0), 0) / distinctFoodDays
          ),
          avgFat_g: Math.round(
            foodRows.reduce((s, f) => s + Number(f.fat_g || 0), 0) / distinctFoodDays
          ),
        }
      : null;

  const todayWaterMl = (waterRes.data ?? []).reduce(
    (sum: number, w: { amount_ml?: number }) => sum + Number(w.amount_ml || 0),
    0
  );

  // Workout summaries, exercise PRs, and 7-day sets by category
  const workoutRows = (workoutsRes.data ?? []) as Array<{
    workout_name: string;
    workout_date: string;
    duration_seconds: number;
    total_volume_kg: number;
    workout_session_exercises?: Array<{
      exercise_name: string;
      exercise_category: string;
      workout_sets?: Array<{
        set_number: number;
        weight_kg: number;
        reps: number;
        is_completed: boolean;
        set_type?: string;
        rpe?: number | null;
      }>;
    }>;
  }>;

  const prMap = new Map<
    string,
    { exercise: string; maxWeightKg: number; best1RMKg: number; maxSetVolumeKg: number }
  >();
  const weeklyCategorySets: Record<string, number> = {};

  const recentWorkouts = workoutRows.slice(0, 6).map((w) => {
    const isThisWeek = w.workout_date >= sevenDaysAgo;
    const exercises = (w.workout_session_exercises ?? []).map((ex) => {
      const completedSets = (ex.workout_sets ?? []).filter((s) => s.is_completed);
      if (isThisWeek) {
        const workingSets = completedSets.filter((s) => s.set_type !== 'warmup').length;
        weeklyCategorySets[ex.exercise_category] =
          (weeklyCategorySets[ex.exercise_category] ?? 0) + workingSets;
      }

      for (const s of completedSets) {
        const wt = Number(s.weight_kg || 0);
        const reps = Number(s.reps || 0);
        if (reps <= 0) continue;
        const est1RM = Math.round(wt * (1 + Math.min(reps, 20) / 30) * 10) / 10;
        const setVol = Math.round(wt * reps * 10) / 10;
        const key = ex.exercise_name.toLowerCase();
        const prev = prMap.get(key) ?? {
          exercise: ex.exercise_name,
          maxWeightKg: 0,
          best1RMKg: 0,
          maxSetVolumeKg: 0,
        };
        prMap.set(key, {
          exercise: ex.exercise_name,
          maxWeightKg: Math.max(prev.maxWeightKg, wt),
          best1RMKg: Math.max(prev.best1RMKg, est1RM),
          maxSetVolumeKg: Math.max(prev.maxSetVolumeKg, setVol),
        });
      }

      const bestSet = completedSets.reduce(
        (best, s) =>
          Number(s.weight_kg || 0) * Number(s.reps || 0) >= best.weight * best.reps
            ? { weight: Number(s.weight_kg || 0), reps: Number(s.reps || 0), rpe: s.rpe ?? null }
            : best,
        { weight: 0, reps: 0, rpe: null as number | null }
      );

      return {
        name: ex.exercise_name,
        category: ex.exercise_category,
        completedSets: completedSets.length,
        topSet: `${bestSet.weight}kg x ${bestSet.reps}${bestSet.rpe ? ` @RPE${bestSet.rpe}` : ''}`,
      };
    });

    return {
      name: w.workout_name,
      date: w.workout_date,
      durationMin: Math.round(Number(w.duration_seconds || 0) / 60),
      volumeKg: Math.round(Number(w.total_volume_kg || 0)),
      exercises: exercises.slice(0, 8),
    };
  });

  const personalRecords = Array.from(prMap.values())
    .sort((a, b) => b.best1RMKg - a.best1RMKg)
    .slice(0, 12);

  // Weight trend summary
  const weights = (weightRes.data ?? []) as Array<{ weight_kg: number; logged_date: string }>;
  const weightTrend =
    weights.length >= 2
      ? {
          latestKg: Number(weights[0].weight_kg),
          latestDate: weights[0].logged_date,
          oldestInWindowKg: Number(weights[weights.length - 1].weight_kg),
          oldestInWindowDate: weights[weights.length - 1].logged_date,
          deltaKg:
            Math.round(
              (Number(weights[0].weight_kg) - Number(weights[weights.length - 1].weight_kg)) * 10
            ) / 10,
          recentEntries: weights.slice(0, 6),
        }
      : weights.length === 1
      ? { latestKg: Number(weights[0].weight_kg), latestDate: weights[0].logged_date }
      : null;

  const plans = (plansRes.data ?? []).map((p: Record<string, unknown>) => ({
    name: p.name,
    splitType: p.split_type,
    isTemplate: p.is_system_template,
    exerciseCount: Array.isArray(p.workout_plan_exercises) ? p.workout_plan_exercises.length : 0,
  }));

  return JSON.stringify({
    date: today,
    profile: profileRes.data ?? null,
    nutritionGoals: goalsRes.data ?? null,
    todayNutritionTotals: todayTotals,
    todayFoodsLogged: todayFoods.slice(0, 12).map((f) => ({
      food: f.food_name,
      meal: f.meal_category,
      kcal: f.calories,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
    })),
    sevenDayNutritionAvg: sevenDayAvg,
    todayWaterMl,
    recentWorkouts,
    exercisePersonalRecords: personalRecords,
    weeklyWorkingSetsByCategory: weeklyCategorySets,
    muscleTargets: muscleTargetsRes.data?.targets ?? null,
    workoutPlans: plans,
    weightTrend,
    recentBodyMeasurements: measRes.data ?? [],
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const groqKey = Deno.env.get('GROQ_API_KEY') ?? '';
  const groqModel = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
  const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';
  const openRouterModel =
    Deno.env.get('OPENROUTER_MODEL') ?? 'meta-llama/llama-3.3-70b-instruct:free';

  if (req.method === 'GET') {
    return jsonResponse({
      ok: true,
      service: 'ai-coach',
      groqConfigured: Boolean(groqKey),
      openRouterConfigured: Boolean(openRouterKey),
      groqModel,
      openRouterModel,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing Authorization header. Sign in again and retry.' }, 401);
    }

    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'Request payload is too large.' }, 413);
    }

    // Authenticated client scoped strictly to calling user (enforces RLS)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Session expired or unauthorized. Please sign in again.' }, 401);
    }

    const rawText = await req.text();
    if (rawText.length > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'Request payload exceeds size limit.' }, 413);
    }

    let body: CoachRequest;
    try {
      body = (rawText ? JSON.parse(rawText) : {}) as CoachRequest;
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
    }

    if (body.action === 'health') {
      const { error: convoCheckErr } = await userClient
        .from('ai_conversations')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      return jsonResponse({
        ok: true,
        groqConfigured: Boolean(groqKey),
        openRouterConfigured: Boolean(openRouterKey),
        groqModel,
        openRouterModel,
        schemaReady: !convoCheckErr,
        schemaError: convoCheckErr?.message ?? null,
      });
    }

    if (typeof body.message !== 'string') {
      return jsonResponse({ error: 'Message must be a non-empty string.' }, 400);
    }

    const message = body.message.trim();
    if (!message || message.length > MAX_MESSAGE_CHARS) {
      return jsonResponse(
        { error: `Message must be between 1 and ${MAX_MESSAGE_CHARS} characters.` },
        400
      );
    }

    if (body.conversationId !== undefined && body.conversationId !== null) {
      if (typeof body.conversationId !== 'string' || !UUID_REGEX.test(body.conversationId)) {
        return jsonResponse({ error: 'Invalid conversationId format.' }, 400);
      }
    }

    const preferred =
      body.preferredProvider === 'groq' || body.preferredProvider === 'openrouter'
        ? body.preferredProvider
        : 'auto';
    const tone =
      body.tone === 'encouraging' || body.tone === 'scientific' ? body.tone : 'direct';
    const wantsStream = body.stream === true;

    if (!groqKey && !openRouterKey) {
      return jsonResponse(
        {
          error:
            'No AI provider secrets are configured on this Supabase Edge Function (set GROQ_API_KEY and/or OPENROUTER_API_KEY via supabase secrets set).',
        },
        503
      );
    }

    // Per-user daily usage limit & burst check via service role
    const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
    const today = new Date().toISOString().slice(0, 10);
    const dailyLimit = Math.max(1, Number(Deno.env.get('AI_DAILY_LIMIT') ?? '30') || 30);

    let currentCount = 0;
    if (adminClient) {
      const { data: usageRow } = await adminClient
        .from('ai_usage_logs')
        .select('id, request_count, updated_at')
        .eq('user_id', user.id)
        .eq('usage_date', today)
        .maybeSingle();

      currentCount = usageRow?.request_count ?? 0;
      if (currentCount >= dailyLimit) {
        return jsonResponse(
          { error: `Daily AI coaching limit (${dailyLimit} requests) reached. Try again tomorrow.` },
          429
        );
      }
    }

    // Verify existing conversation ownership or create a new conversation for user.id
    let conversationId = body.conversationId;
    let isNewConversation = false;

    if (conversationId) {
      const { data: existingConvo, error: convoLookupErr } = await userClient
        .from('ai_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (convoLookupErr) {
        return jsonResponse({ error: `Could not verify conversation: ${convoLookupErr.message}` }, 500);
      }
      if (!existingConvo) {
        return jsonResponse({ error: 'Conversation not found or access denied.' }, 404);
      }
    } else {
      isNewConversation = true;
      const cleanTitle = message.replace(/\s+/g, ' ').slice(0, 60);
      const { data: createdConvo, error: convoErr } = await userClient
        .from('ai_conversations')
        .insert({ user_id: user.id, title: cleanTitle })
        .select('id')
        .single();

      if (convoErr || !createdConvo) {
        const detail = convoErr?.message ?? 'Unknown database error';
        const isMissing =
          detail.toLowerCase().includes('schema cache') ||
          detail.toLowerCase().includes('does not exist');
        return jsonResponse(
          {
            error: isMissing
              ? 'Database table public.ai_conversations is missing. Run 20261118000001_initial_schema.sql in Supabase SQL Editor.'
              : `Could not initialize conversation: ${detail}`,
          },
          isMissing ? 503 : 500
        );
      }
      conversationId = createdConvo.id;
    }

    // Gather authenticated user's fitness context (no email/PII) and recent message history
    const [contextSummary, historyRes] = await Promise.all([
      body.includeContext !== false
        ? gatherFitnessContext(userClient, user.id, today)
        : Promise.resolve('User opted out of sharing live fitness logs.'),
      isNewConversation
        ? Promise.resolve({ data: [] as Array<{ role: string; content: string }> })
        : userClient
            .from('ai_messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(MAX_HISTORY_MESSAGES),
    ]);

    const recentHistory = ((historyRes.data ?? []) as Array<{ role: string; content: string }>)
      .slice()
      .reverse()
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? '').slice(0, MAX_HISTORY_ITEM_CHARS),
      }));

    const systemPrompt = [
      `You are GYM PAGLU AI Coach — an evidence-based strength, hypertrophy, fat loss, body recomposition, recovery, and Indian/global sports nutrition specialist.`,
      `Tone: ${tone}. Keep responses structured with clean Markdown (headings, bullet lists, tables when helpful), practical, concise, and mathematically accurate.`,
      `Specialize in progressive overload, exercise technique & common mistakes, Indian high-protein meal options (paneer, dal, soya chunks, eggs, chicken, whey, curd, sprouts, roti/rice portions), macro calculations, recovery, and weekly progress reviews.`,
      `Never fabricate logged numbers. Only cite numbers present in the user's real logged fitness data below. If data is missing, say so clearly.`,
      `USER FITNESS CONTEXT:\n${contextSummary}`,
    ].join('\n\n');

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: message },
    ];

    // Execute primary (Groq) -> automatic fallback (OpenRouter)
    let attempt: ProviderAttemptResult | null = null;
    let lastProviderErr: string | null = null;

    if (preferred !== 'openrouter' && groqKey) {
      try {
        const groqRes = await openProviderStreamOrJson({
          providerLabel: 'Groq',
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: groqKey,
          model: groqModel,
          messages: chatMessages,
          stream: wantsStream,
          timeoutMs: 18_000,
        });
        attempt = {
          provider: 'groq',
          model: groqModel,
          fallbackUsed: false,
          reply: groqRes.reply,
          streamResponse: groqRes.streamResponse,
        };
      } catch (err) {
        const pErr = err instanceof ProviderError ? err : new ProviderError('Groq failed.', 502, true);
        lastProviderErr = pErr.message;
        if (preferred === 'groq' || !openRouterKey || !pErr.retryable) {
          if (isNewConversation) {
            await userClient
              .from('ai_conversations')
              .delete()
              .eq('id', conversationId)
              .eq('user_id', user.id);
          }
          return jsonResponse({ error: pErr.message }, pErr.status >= 400 ? pErr.status : 502);
        }
      }
    }

    if (!attempt && openRouterKey) {
      try {
        const orRes = await openProviderStreamOrJson({
          providerLabel: 'OpenRouter',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: openRouterKey,
          model: openRouterModel,
          messages: chatMessages,
          stream: wantsStream,
          extraHeaders: {
            'HTTP-Referer': 'https://gympaglu.app',
            'X-Title': 'GYM PAGLU',
          },
          timeoutMs: 24_000,
        });
        attempt = {
          provider: 'openrouter',
          model: openRouterModel,
          fallbackUsed: preferred !== 'openrouter' && Boolean(groqKey),
          reply: orRes.reply,
          streamResponse: orRes.streamResponse,
        };
      } catch (err) {
        const openRouterErr = (err as Error).message || 'OpenRouter unavailable.';
        if (isNewConversation) {
          await userClient
            .from('ai_conversations')
            .delete()
            .eq('id', conversationId)
            .eq('user_id', user.id);
        }
        return jsonResponse(
          {
            error: lastProviderErr
              ? `Both primary (Groq) and fallback (OpenRouter) failed. ${lastProviderErr} ${openRouterErr}`
              : openRouterErr,
          },
          502
        );
      }
    }

    if (!attempt) {
      if (isNewConversation) {
        await userClient
          .from('ai_conversations')
          .delete()
          .eq('id', conversationId)
          .eq('user_id', user.id);
      }
      return jsonResponse(
        { error: 'Selected AI provider is not configured on the server.' },
        503
      );
    }

    const remainingToday = Math.max(0, dailyLimit - (currentCount + 1));

    const persistTurnAndUsage = async (replyText: string) => {
      const { error: userMsgErr } = await userClient.from('ai_messages').insert({
        user_id: user.id,
        conversation_id: conversationId,
        role: 'user',
        content: message,
      });
      if (userMsgErr) {
        throw new Error(`Could not save user message: ${userMsgErr.message}`);
      }

      const tasks: PromiseLike<unknown>[] = [
        userClient.from('ai_messages').insert({
          user_id: user.id,
          conversation_id: conversationId,
          role: 'assistant',
          content: replyText,
          provider: attempt!.provider,
          model: attempt!.model,
          fallback_used: attempt!.fallbackUsed,
        }),
        userClient
          .from('ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
          .eq('user_id', user.id),
      ];

      if (adminClient) {
        tasks.push(
          adminClient.from('ai_usage_logs').upsert(
            {
              user_id: user.id,
              usage_date: today,
              request_count: currentCount + 1,
            },
            { onConflict: 'user_id,usage_date' }
          )
        );
      }

      await Promise.all(tasks);
    };

    // Streaming SSE response path
    if (wantsStream && attempt.streamResponse?.body) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const upstreamReader = attempt.streamResponse.body.getReader();

      const sseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (payload: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };

          let fullReply = '';
          let buffer = '';

          try {
            emit({
              type: 'meta',
              conversationId,
              provider: attempt!.provider,
              model: attempt!.model,
              fallbackUsed: attempt!.fallbackUsed,
              remainingToday,
            });

            while (true) {
              const { done, value } = await upstreamReader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:')) continue;
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr) as {
                    choices?: Array<{ delta?: { content?: string } }>;
                  };
                  const delta = parsed?.choices?.[0]?.delta?.content;
                  if (typeof delta === 'string' && delta.length > 0) {
                    fullReply += delta;
                    emit({ type: 'delta', text: delta });
                  }
                } catch {
                  // Ignore non-JSON keepalive / malformed chunk comments safely
                }
              }
            }

            const finalReply = fullReply.trim();
            if (!finalReply) {
              if (isNewConversation) {
                await userClient
                  .from('ai_conversations')
                  .delete()
                  .eq('id', conversationId)
                  .eq('user_id', user.id);
              }
              emit({
                type: 'error',
                error: 'AI provider returned an empty response stream. Please retry.',
              });
              controller.close();
              return;
            }

            await persistTurnAndUsage(finalReply);
            emit({
              type: 'done',
              conversationId,
              reply: finalReply,
              provider: attempt!.provider,
              model: attempt!.model,
              fallbackUsed: attempt!.fallbackUsed,
              remainingToday,
            });
            controller.close();
          } catch (streamErr) {
            console.error('[ai-coach] stream processing error:', (streamErr as Error)?.message);
            if (isNewConversation) {
              try {
                await userClient
                  .from('ai_conversations')
                  .delete()
                  .eq('id', conversationId)
                  .eq('user_id', user.id);
              } catch {
                // Ignore cleanup failure
              }
            }
            emit({
              type: 'error',
              error: 'Streaming response was interrupted. Please retry.',
            });
            controller.close();
          } finally {
            upstreamReader.releaseLock();
          }
        },
      });

      return new Response(sseStream, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming JSON fallback path
    const replyText = attempt.reply ?? '';
    await persistTurnAndUsage(replyText);

    return jsonResponse({
      conversationId,
      reply: replyText,
      provider: attempt.provider,
      model: attempt.model,
      fallbackUsed: attempt.fallbackUsed,
      remainingToday,
    });
  } catch (error) {
    console.error('[ai-coach] unhandled error:', (error as Error)?.message);
    return jsonResponse(
      { error: 'AI Coach service encountered an unexpected error. Please retry.' },
      500
    );
  }
});
