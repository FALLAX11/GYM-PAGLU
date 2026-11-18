// Supabase Edge Function: ai-coach
// Primary AI Provider: Groq API
// Fallback AI Provider: OpenRouter API
// Security: Verifies Supabase JWT, isolates user context, enforces daily rate limits,
//           and keeps GROQ_API_KEY & OPENROUTER_API_KEY strictly server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
};

interface CoachRequest {
  action?: 'chat' | 'health';
  conversationId?: string;
  message?: string;
  includeContext?: boolean;
  preferredProvider?: 'auto' | 'groq' | 'openrouter';
  tone?: 'direct' | 'encouraging' | 'scientific';
}

interface ProviderResult {
  reply: string;
  provider: 'groq' | 'openrouter';
  model: string;
  fallbackUsed: boolean;
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

async function callOpenAICompatible(opts: {
  url: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20000);

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
        temperature: 0.6,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
      throw new ProviderError(`Provider error ${res.status}: ${errorText}`, res.status, retryable);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new ProviderError('Empty response from AI provider', 502, true);
    }
    return content.trim();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ProviderError('Provider request timed out', 504, true);
    }
    if (err instanceof ProviderError) {
      throw err;
    }
    throw new ProviderError((err as Error).message || 'Network failure', 503, true);
  } finally {
    clearTimeout(timer);
  }
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
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header. Sign in again and retry.' }, 401);
    }

    // Authenticated client scoped strictly to calling user
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

    const body = ((await req.json().catch(() => ({}))) ?? {}) as CoachRequest;

    if (body.action === 'health') {
      const { error: convoCheckErr } = await userClient
        .from('ai_conversations')
        .select('id')
        .limit(1);
      return jsonResponse({
        ok: true,
        groqConfigured: Boolean(groqKey),
        openRouterConfigured: Boolean(openRouterKey),
        schemaReady: !convoCheckErr,
        schemaError: convoCheckErr?.message ?? null,
      });
    }

    const message = (body.message ?? '').trim();
    if (!message || message.length > 2000) {
      return jsonResponse({ error: 'Message must be between 1 and 2000 characters' }, 400);
    }

    // Per-user daily usage limit check via service role (degrade safely if service role key missing)
    const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
    const today = new Date().toISOString().slice(0, 10);
    const dailyLimit = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '30');

    let currentCount = 0;
    if (adminClient) {
      const { data: usageRow } = await adminClient
        .from('ai_usage_logs')
        .select('id, request_count')
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

    // Load or create conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data: createdConvo, error: convoErr } = await userClient
        .from('ai_conversations')
        .insert({ user_id: user.id, title: message.slice(0, 56) })
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

    // Persist user message immediately
    const { error: msgInsertErr } = await userClient.from('ai_messages').insert({
      user_id: user.id,
      conversation_id: conversationId,
      role: 'user',
      content: message,
    });
    if (msgInsertErr) {
      return jsonResponse({ error: `Could not save chat message: ${msgInsertErr.message}` }, 500);
    }

    // Gather authenticated user fitness context if authorized
    let contextSummary = 'User opted out of sharing live fitness logs.';
    if (body.includeContext !== false) {
      const [profileRes, goalsRes, foodRes, workoutRes, waterRes] = await Promise.all([
        userClient
          .from('profiles')
          .select('full_name, fitness_goal, current_weight_kg, target_weight_kg, dietary_preference')
          .eq('id', user.id)
          .maybeSingle(),
        userClient
          .from('nutrition_goals')
          .select('calories_target, protein_target_g, carbs_target_g, fat_target_g, water_target_ml')
          .eq('user_id', user.id)
          .maybeSingle(),
        userClient
          .from('food_logs')
          .select('food_name, calories, protein_g, carbs_g, fat_g, meal_category')
          .eq('user_id', user.id)
          .eq('logged_date', today),
        userClient
          .from('workout_sessions')
          .select('workout_name, workout_date, duration_seconds, total_volume_kg')
          .eq('user_id', user.id)
          .order('workout_date', { ascending: false })
          .limit(5),
        userClient
          .from('water_logs')
          .select('amount_ml')
          .eq('user_id', user.id)
          .eq('logged_date', today),
      ]);

      const foods = foodRes.data ?? [];
      const totals = foods.reduce(
        (acc, f) => ({
          calories: acc.calories + Number(f.calories || 0),
          protein: acc.protein + Number(f.protein_g || 0),
          carbs: acc.carbs + Number(f.carbs_g || 0),
          fat: acc.fat + Number(f.fat_g || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      const waterMl = (waterRes.data ?? []).reduce((sum, w) => sum + Number(w.amount_ml || 0), 0);

      contextSummary = JSON.stringify({
        profile: profileRes.data,
        nutritionGoals: goalsRes.data,
        todayNutritionTotals: totals,
        todayFoodsLogged: foods.slice(0, 12),
        todayWaterMl: waterMl,
        recentWorkouts: workoutRes.data ?? [],
      });
    }

    // Recent conversation messages for continuity
    const { data: historyRows } = await userClient
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10);

    const tone = body.tone ?? 'direct';
    const systemPrompt = [
      `You are GYM PAGLU AI Coach — an evidence-based strength, hypertrophy, and Indian/global sports nutrition specialist.`,
      `Tone: ${tone}. Keep responses practical, structured, concise, and mathematically accurate.`,
      `Never fabricate logged numbers. Base nutrition/training recommendations on the user's real logged context below:`,
      contextSummary,
    ].join('\n\n');

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...(historyRows ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    let result: ProviderResult | null = null;
    const preferred = body.preferredProvider ?? 'auto';
    let lastProviderErr: string | null = null;

    if (preferred !== 'openrouter' && groqKey) {
      try {
        const reply = await callOpenAICompatible({
          url: 'https://api.groq.com/openai/v1/chat/completions',
          apiKey: groqKey,
          model: groqModel,
          messages: chatMessages,
          timeoutMs: 18000,
        });
        result = { reply, provider: 'groq', model: groqModel, fallbackUsed: false };
      } catch (err) {
        lastProviderErr = (err as Error).message;
        // Fall through to OpenRouter if configured & preferred isn't strictly groq
        if (preferred === 'groq' || !openRouterKey) {
          return jsonResponse(
            { error: `Groq AI request failed: ${lastProviderErr}` },
            502
          );
        }
      }
    }

    if (!result && openRouterKey) {
      try {
        const reply = await callOpenAICompatible({
          url: 'https://openrouter.ai/api/v1/chat/completions',
          apiKey: openRouterKey,
          model: openRouterModel,
          messages: chatMessages,
          extraHeaders: {
            'HTTP-Referer': 'https://gympaglu.app',
            'X-Title': 'GYM PAGLU',
          },
          timeoutMs: 22000,
        });
        result = {
          reply,
          provider: 'openrouter',
          model: openRouterModel,
          fallbackUsed: preferred !== 'openrouter' && Boolean(groqKey),
        };
      } catch (err) {
        const openRouterErr = (err as Error).message;
        return jsonResponse(
          {
            error: lastProviderErr
              ? `Both Groq and OpenRouter failed. Groq: ${lastProviderErr} | OpenRouter: ${openRouterErr}`
              : `OpenRouter AI request failed: ${openRouterErr}`,
          },
          502
        );
      }
    }

    if (!result) {
      return jsonResponse(
        {
          error:
            'No AI provider secrets are configured on this Supabase Edge Function (set GROQ_API_KEY and/or OPENROUTER_API_KEY via supabase secrets set).',
        },
        503
      );
    }

    // Persist assistant response and increment daily usage
    const persistTasks: Promise<unknown>[] = [
      userClient.from('ai_messages').insert({
        user_id: user.id,
        conversation_id: conversationId,
        role: 'assistant',
        content: result.reply,
        provider: result.provider,
        model: result.model,
        fallback_used: result.fallbackUsed,
      }),
    ];

    if (adminClient) {
      persistTasks.push(
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

    await Promise.all(persistTasks);

    return jsonResponse({
      conversationId,
      reply: result.reply,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed,
      remainingToday: Math.max(0, dailyLimit - (currentCount + 1)),
    });
  } catch (error) {
    return jsonResponse(
      { error: (error as Error).message || 'AI Coach service unavailable' },
      500
    );
  }
});
