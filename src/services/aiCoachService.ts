import {
  getInitializedSupabaseConnection,
  getSupabaseClient,
  getSupabaseProjectRef,
} from '../lib/supabase';
import type { AIConversation, AIMessage, AIProviderPref, AITone } from '../types/database';

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Connect your Supabase project first.');
  }
  return client;
}

export type AICoachErrorCode =
  | 'EDGE_FUNCTION_UNREACHABLE'
  | 'MISSING_AI_SECRETS'
  | 'SCHEMA_MISSING'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR';

export class AICoachDiagnosticError extends Error {
  code: AICoachErrorCode;
  projectRef: string | null;

  constructor(message: string, code: AICoachErrorCode, projectRef: string | null) {
    super(message);
    this.name = 'AICoachDiagnosticError';
    this.code = code;
    this.projectRef = projectRef;
  }
}

export interface AICoachHealthStatus {
  reachable: boolean;
  groqConfigured: boolean;
  openRouterConfigured: boolean;
  groqModel?: string;
  openRouterModel?: string;
  schemaReady: boolean;
  projectRef: string | null;
  errorMessage?: string;
}

async function ensureFreshSession() {
  const supabase = requireClient();
  const { data } = await supabase.auth.getSession();
  let session = data.session;

  if (session?.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) {
      session = refreshed.data.session;
    }
  }

  if (!session?.access_token) {
    const projectRef = getSupabaseProjectRef();
    throw new AICoachDiagnosticError(
      'Your authentication session expired. Sign in again to chat with AI Coach.',
      'AUTH_EXPIRED',
      projectRef
    );
  }
  return { supabase, session };
}

function classifyServerMessage(
  serverMsg: string,
  statusCode?: number,
  isNetworkError = false
): AICoachDiagnosticError {
  const projectRef = getSupabaseProjectRef();
  const lower = serverMsg.toLowerCase();

  if (
    isNetworkError ||
    lower.includes('failed to send a request to the edge function') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror')
  ) {
    return new AICoachDiagnosticError(
      'Could not reach the "ai-coach" Supabase Edge Function. Deploy supabase/functions/ai-coach and set GROQ_API_KEY / OPENROUTER_API_KEY in Supabase.',
      'EDGE_FUNCTION_UNREACHABLE',
      projectRef
    );
  }

  if (lower.includes('no ai provider secrets') || lower.includes('groq_api_key')) {
    return new AICoachDiagnosticError(serverMsg, 'MISSING_AI_SECRETS', projectRef);
  }

  if (
    lower.includes('ai_conversations') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  ) {
    return new AICoachDiagnosticError(serverMsg, 'SCHEMA_MISSING', projectRef);
  }

  if (
    statusCode === 401 ||
    lower.includes('unauthorized') ||
    lower.includes('session expired') ||
    lower.includes('missing authorization')
  ) {
    return new AICoachDiagnosticError(serverMsg, 'AUTH_EXPIRED', projectRef);
  }

  if (statusCode === 429 || lower.includes('daily ai coaching limit') || lower.includes('429')) {
    return new AICoachDiagnosticError(serverMsg, 'RATE_LIMITED', projectRef);
  }

  return new AICoachDiagnosticError(serverMsg, 'PROVIDER_ERROR', projectRef);
}

async function extractInvokeError(error: unknown): Promise<AICoachDiagnosticError> {
  const errObj = error as { name?: string; message?: string; context?: Response };
  let serverMsg = errObj?.message || 'AI Coach Edge Function request failed.';
  let statusCode: number | undefined;

  if (errObj?.context && typeof errObj.context.json === 'function') {
    statusCode = errObj.context.status;
    try {
      const cloned = errObj.context.clone ? errObj.context.clone() : errObj.context;
      const body = (await cloned.json()) as { error?: string };
      if (body?.error) {
        serverMsg = body.error;
      }
    } catch {
      // Ignore parse failure
    }
  }

  return classifyServerMessage(serverMsg, statusCode, errObj?.name === 'FunctionsFetchError');
}

export async function checkAICoachHealth(): Promise<AICoachHealthStatus> {
  const projectRef = getSupabaseProjectRef();
  try {
    const { supabase } = await ensureFreshSession();
    const { data, error } = await supabase.functions.invoke('ai-coach', {
      body: { action: 'health' },
    });

    if (error) {
      const diag = await extractInvokeError(error);
      return {
        reachable: diag.code !== 'EDGE_FUNCTION_UNREACHABLE',
        groqConfigured: false,
        openRouterConfigured: false,
        schemaReady: diag.code !== 'SCHEMA_MISSING',
        projectRef,
        errorMessage: diag.message,
      };
    }

    return {
      reachable: true,
      groqConfigured: Boolean(data?.groqConfigured),
      openRouterConfigured: Boolean(data?.openRouterConfigured),
      groqModel: typeof data?.groqModel === 'string' ? data.groqModel : undefined,
      openRouterModel:
        typeof data?.openRouterModel === 'string' ? data.openRouterModel : undefined,
      schemaReady: Boolean(data?.schemaReady),
      projectRef,
      errorMessage: data?.schemaError ?? undefined,
    };
  } catch (err) {
    return {
      reachable: false,
      groqConfigured: false,
      openRouterConfigured: false,
      schemaReady: false,
      projectRef,
      errorMessage: (err as Error).message,
    };
  }
}

export async function fetchConversations(userId: string): Promise<AIConversation[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AIConversation[];
}

export async function fetchMessages(conversationId: string): Promise<AIMessage[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AIMessage[];
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function clearConversationMessages(
  userId: string,
  conversationId: string
): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase
    .from('ai_messages')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function fetchDailyAIUsage(
  userId: string
): Promise<{ used: number; limit: number }> {
  const supabase = requireClient();
  const today = new Date().toISOString().slice(0, 10);
  const defaultLimit = Math.max(
    1,
    Number(import.meta.env.VITE_DEFAULT_AI_DAILY_LIMIT ?? '30') || 30
  );

  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  if (error) {
    return { used: 0, limit: defaultLimit };
  }

  return {
    used: Number(data?.request_count ?? 0),
    limit: defaultLimit,
  };
}

export interface SendCoachMessageResult {
  conversationId: string;
  reply: string;
  provider: 'groq' | 'openrouter';
  model: string;
  fallbackUsed: boolean;
  remainingToday: number;
}

export interface StreamCoachMeta {
  conversationId: string;
  provider: 'groq' | 'openrouter';
  model: string;
  fallbackUsed: boolean;
  remainingToday: number;
}

export async function streamCoachMessage(params: {
  conversationId?: string;
  message: string;
  includeContext: boolean;
  preferredProvider: AIProviderPref;
  tone: AITone;
  onMeta?: (meta: StreamCoachMeta) => void;
  onDelta?: (chunk: string) => void;
}): Promise<SendCoachMessageResult> {
  const { session } = await ensureFreshSession();
  const conn = getInitializedSupabaseConnection();
  if (!conn) {
    throw new Error('Supabase is not configured.');
  }

  const endpoint = `${conn.url.replace(/\/+$/, '')}/functions/v1/ai-coach`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: conn.anonKey,
      },
      body: JSON.stringify({
        action: 'chat',
        conversationId: params.conversationId,
        message: params.message,
        includeContext: params.includeContext,
        preferredProvider: params.preferredProvider,
        tone: params.tone,
        stream: true,
      }),
    });
  } catch (networkErr) {
    throw classifyServerMessage(
      (networkErr as Error)?.message || 'Failed to send a request to the Edge Function',
      undefined,
      true
    );
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

  // JSON error or non-streaming JSON fallback
  if (!response.ok || !contentType.includes('text/event-stream')) {
    const json = (await response.json().catch(() => null)) as
      | (Partial<SendCoachMessageResult> & { error?: string })
      | null;

    if (!response.ok || json?.error) {
      throw classifyServerMessage(
        json?.error || `AI Coach request failed (${response.status}).`,
        response.status
      );
    }

    if (!json?.reply || !json?.conversationId) {
      throw classifyServerMessage('Empty response returned from AI Coach.', 502);
    }

    params.onDelta?.(json.reply);
    return json as SendCoachMessageResult;
  }

  if (!response.body) {
    throw classifyServerMessage('AI Coach stream response body was empty.', 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const streamState: {
    finalResult: SendCoachMessageResult | null;
    accumulatedReply: string;
    metaInfo: StreamCoachMeta | null;
  } = {
    finalResult: null,
    accumulatedReply: '',
    metaInfo: null,
  };

  const processBlock = (block: string) => {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payloadStr = line.slice(5).trim();
      if (!payloadStr) continue;

      let evt: {
        type?: 'meta' | 'delta' | 'done' | 'error';
        conversationId?: string;
        provider?: 'groq' | 'openrouter';
        model?: string;
        fallbackUsed?: boolean;
        remainingToday?: number;
        text?: string;
        reply?: string;
        error?: string;
      };

      try {
        evt = JSON.parse(payloadStr);
      } catch {
        continue;
      }

      if (evt.type === 'meta' && evt.conversationId && evt.provider && evt.model) {
        streamState.metaInfo = {
          conversationId: evt.conversationId,
          provider: evt.provider,
          model: evt.model,
          fallbackUsed: Boolean(evt.fallbackUsed),
          remainingToday: Number(evt.remainingToday ?? 0),
        };
        params.onMeta?.(streamState.metaInfo);
      } else if (evt.type === 'delta' && typeof evt.text === 'string') {
        streamState.accumulatedReply += evt.text;
        params.onDelta?.(evt.text);
      } else if (evt.type === 'done' && evt.conversationId && evt.provider && evt.model) {
        streamState.finalResult = {
          conversationId: evt.conversationId,
          reply: evt.reply ?? streamState.accumulatedReply,
          provider: evt.provider,
          model: evt.model,
          fallbackUsed: Boolean(evt.fallbackUsed),
          remainingToday: Number(evt.remainingToday ?? 0),
        };
      } else if (evt.type === 'error') {
        throw classifyServerMessage(evt.error || 'AI Coach stream interrupted.', 502);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const block of events) {
        processBlock(block);
      }
    }

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (streamState.finalResult) {
    return streamState.finalResult;
  }

  if (streamState.metaInfo && streamState.accumulatedReply.trim()) {
    return {
      conversationId: streamState.metaInfo.conversationId,
      provider: streamState.metaInfo.provider,
      model: streamState.metaInfo.model,
      fallbackUsed: streamState.metaInfo.fallbackUsed,
      remainingToday: streamState.metaInfo.remainingToday,
      reply: streamState.accumulatedReply.trim(),
    };
  }

  throw classifyServerMessage('AI Coach stream closed before completing response.', 502);
}

export async function sendCoachMessage(params: {
  conversationId?: string;
  message: string;
  includeContext: boolean;
  preferredProvider: AIProviderPref;
  tone: AITone;
}): Promise<SendCoachMessageResult> {
  const { supabase } = await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: {
      action: 'chat',
      ...params,
      stream: false,
    },
  });

  if (error) {
    throw await extractInvokeError(error);
  }

  if (data?.error) {
    const projectRef = getSupabaseProjectRef();
    throw new AICoachDiagnosticError(String(data.error), 'PROVIDER_ERROR', projectRef);
  }

  return data as SendCoachMessageResult;
}
