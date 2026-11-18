import { getSupabaseClient, getSupabaseProjectRef } from '../lib/supabase';
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
  schemaReady: boolean;
  projectRef: string | null;
  errorMessage?: string;
}

async function ensureFreshSession() {
  const supabase = requireClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    const projectRef = getSupabaseProjectRef();
    throw new AICoachDiagnosticError(
      'Your authentication session expired. Sign in again to chat with AI Coach.',
      'AUTH_EXPIRED',
      projectRef
    );
  }
  return supabase;
}

async function extractInvokeError(error: unknown): Promise<AICoachDiagnosticError> {
  const projectRef = getSupabaseProjectRef();
  const errObj = error as { name?: string; message?: string; context?: Response };
  let serverMsg = errObj?.message || 'AI Coach Edge Function request failed.';

  // Extract JSON error body from FunctionsHttpError Response if present
  if (errObj?.context && typeof errObj.context.json === 'function') {
    try {
      const cloned = errObj.context.clone ? errObj.context.clone() : errObj.context;
      const body = (await cloned.json()) as { error?: string };
      if (body?.error) {
        serverMsg = body.error;
      }
    } catch {
      // Ignore body parse failure
    }
  }

  const lower = serverMsg.toLowerCase();

  if (
    errObj?.name === 'FunctionsFetchError' ||
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

  if (lower.includes('ai_conversations') || lower.includes('schema cache') || lower.includes('does not exist')) {
    return new AICoachDiagnosticError(serverMsg, 'SCHEMA_MISSING', projectRef);
  }

  if (lower.includes('unauthorized') || lower.includes('session expired') || lower.includes('missing authorization')) {
    return new AICoachDiagnosticError(serverMsg, 'AUTH_EXPIRED', projectRef);
  }

  if (lower.includes('daily ai coaching limit') || lower.includes('429')) {
    return new AICoachDiagnosticError(serverMsg, 'RATE_LIMITED', projectRef);
  }

  return new AICoachDiagnosticError(serverMsg, 'PROVIDER_ERROR', projectRef);
}

export async function checkAICoachHealth(): Promise<AICoachHealthStatus> {
  const projectRef = getSupabaseProjectRef();
  try {
    const supabase = await ensureFreshSession();
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

export interface SendCoachMessageResult {
  conversationId: string;
  reply: string;
  provider: 'groq' | 'openrouter';
  model: string;
  fallbackUsed: boolean;
  remainingToday: number;
}

export async function sendCoachMessage(params: {
  conversationId?: string;
  message: string;
  includeContext: boolean;
  preferredProvider: AIProviderPref;
  tone: AITone;
}): Promise<SendCoachMessageResult> {
  const supabase = await ensureFreshSession();
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: {
      action: 'chat',
      ...params,
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
