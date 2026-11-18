import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  History,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  Terminal,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { MarkdownMessage } from '../../components/ui/MarkdownMessage';
import {
  Card,
  ErrorBanner,
  INPUT_CLASS,
  LoadingBlock,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSupabaseProjectRef, isSchemaMissingError } from '../../lib/supabase';
import {
  AICoachDiagnosticError,
  checkAICoachHealth,
  clearConversationMessages,
  deleteConversation,
  fetchConversations,
  fetchDailyAIUsage,
  fetchMessages,
  streamCoachMessage,
  type AICoachErrorCode,
  type AICoachHealthStatus,
  type StreamCoachMeta,
} from '../../services/aiCoachService';
import type { AIConversation, AIMessage } from '../../types/database';

const QUICK_PROMPTS = [
  'Analyse my nutrition today and tell me how much protein I still need.',
  'Suggest a high-protein Indian meal based on my remaining macros.',
  'Review my recent workout sessions and explain how to progressively overload next week.',
  'Give me a weekly progress report with recovery and training volume insights.',
];

export function AICoachPage() {
  const { user, settings, schemaMissing } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [streamingMeta, setStreamingMeta] = useState<StreamCoachMeta | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<AICoachErrorCode | null>(null);
  const [failedRequest, setFailedRequest] = useState<{
    text: string;
    conversationId?: string;
  } | null>(null);
  const [health, setHealth] = useState<AICoachHealthStatus | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<'deploy' | 'secrets' | null>(null);
  const [includeContext, setIncludeContext] = useState(settings.ai_include_context);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const projectRef = getSupabaseProjectRef() ?? 'YOUR_PROJECT_REF';
  const deployCliCmd = `npx supabase link --project-ref ${projectRef} && npx supabase functions deploy ai-coach`;
  const secretsCliCmd = `npx supabase secrets set GROQ_API_KEY="gsk_YOUR_KEY" OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY" --project-ref ${projectRef}`;

  useEffect(() => {
    setIncludeContext(settings.ai_include_context);
  }, [settings.ai_include_context]);

  const runHealthProbe = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const status = await checkAICoachHealth();
      setHealth(status);
      if (
        status.reachable &&
        (status.groqConfigured || status.openRouterConfigured) &&
        status.schemaReady
      ) {
        setError('');
        setErrorCode(null);
        showToast('AI Coach Edge Function is online and ready.', 'success');
      } else if (!status.reachable) {
        setErrorCode('EDGE_FUNCTION_UNREACHABLE');
      } else if (!status.groqConfigured && !status.openRouterConfigured) {
        setErrorCode('MISSING_AI_SECRETS');
        setError('Edge Function reached, but neither GROQ_API_KEY nor OPENROUTER_API_KEY is set.');
      } else if (!status.schemaReady) {
        setErrorCode('SCHEMA_MISSING');
        setError('Edge Function reached, but ai_conversations / ai_messages tables are missing.');
      }
    } finally {
      setCheckingHealth(false);
    }
  }, [showToast]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    if (schemaMissing) {
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [list, dailyUsage] = await Promise.all([
        fetchConversations(user.id),
        fetchDailyAIUsage(user.id),
      ]);
      setConversations(list);
      setUsage(dailyUsage);
      if (list.length > 0 && !activeConvoId) {
        setActiveConvoId(list[0].id);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [activeConvoId, schemaMissing, user]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConvoId) {
      setMessages([]);
      return;
    }
    void fetchMessages(activeConvoId)
      .then(setMessages)
      .catch((err) => setError((err as Error).message));
  }, [activeConvoId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, streamingReply]);

  const copyCommand = async (kind: 'deploy' | 'secrets') => {
    const cmd = kind === 'deploy' ? deployCliCmd : secretsCliCmd;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(kind);
      showToast('Supabase CLI command copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedCmd(null), 2500);
    } catch {
      showToast('Clipboard blocked — copy the command manually.', 'error');
    }
  };

  const handleSend = async (promptText?: string, targetConvoId?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || !user || sending) return;

    const convoToUse = targetConvoId !== undefined ? targetConvoId : activeConvoId;

    setError('');
    setErrorCode(null);
    setFailedRequest(null);
    if (promptText === undefined) {
      setInput('');
    }
    setSending(true);
    setStreamingReply('');
    setStreamingMeta(null);

    const optimisticUserMsg: AIMessage = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      conversation_id: convoToUse ?? 'pending',
      role: 'user',
      content: text,
      provider: null,
      model: null,
      fallback_used: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await streamCoachMessage({
        conversationId: convoToUse,
        message: text,
        includeContext,
        preferredProvider: settings.ai_preferred_provider,
        tone: settings.ai_tone,
        onMeta: (meta) => {
          setStreamingMeta(meta);
        },
        onDelta: (chunk) => {
          setStreamingReply((prev) => prev + chunk);
        },
      });

      if (!convoToUse) {
        setActiveConvoId(res.conversationId);
      }

      const [freshMessages, freshConvos] = await Promise.all([
        fetchMessages(res.conversationId),
        fetchConversations(user.id),
      ]);
      setMessages(freshMessages);
      setConversations(freshConvos);
      setUsage((prev) => {
        const limit = prev?.limit ?? 30;
        return {
          used: Math.max(0, limit - res.remainingToday),
          limit,
        };
      });

      if (res.fallbackUsed) {
        showToast(
          `Groq was unavailable — automatically switched to OpenRouter (${res.model}).`,
          'info'
        );
      }
    } catch (err) {
      if (err instanceof AICoachDiagnosticError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError((err as Error).message);
      }
      setFailedRequest({ text, conversationId: convoToUse });
      if (promptText === undefined) {
        setInput((curr) => (curr.trim() ? curr : text));
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
    } finally {
      setStreamingReply('');
      setStreamingMeta(null);
      setSending(false);
    }
  };

  const handleRetry = () => {
    if (!failedRequest || sending) return;
    void handleSend(failedRequest.text, failedRequest.conversationId);
  };

  const handleNewChat = () => {
    setActiveConvoId(undefined);
    setMessages([]);
    setError('');
    setErrorCode(null);
    setFailedRequest(null);
    setMobileHistoryOpen(false);
  };

  const handleClearChat = async () => {
    if (!user || !activeConvoId || sending || clearing) return;
    setClearing(true);
    setError('');
    try {
      await clearConversationMessages(user.id, activeConvoId);
      setMessages([]);
      setFailedRequest(null);
      showToast('Chat messages cleared.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteConvo = async (id: string) => {
    if (!user) return;
    try {
      await deleteConversation(user.id, id);
      const next = conversations.filter((c) => c.id !== id);
      setConversations(next);
      if (activeConvoId === id) {
        setActiveConvoId(next[0]?.id);
        if (next.length === 0) {
          setMessages([]);
        }
      }
      showToast('Conversation deleted.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const showSetupHelp =
    errorCode === 'EDGE_FUNCTION_UNREACHABLE' ||
    errorCode === 'MISSING_AI_SECRETS' ||
    errorCode === 'SCHEMA_MISSING';

  const renderConversationList = () => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">Saved Conversations</p>
        {usage && (
          <span className="text-[11px] font-mono-num text-zinc-500">
            {Math.max(0, usage.limit - usage.used)}/{usage.limit} left today
          </span>
        )}
      </div>
      {loading ? (
        <LoadingBlock label="Loading chats..." />
      ) : conversations.length === 0 ? (
        <p className="text-xs text-zinc-500 py-2">
          No past chats yet. Ask your first fitness question.
        </p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto pr-0.5">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
                c.id === activeConvoId
                  ? 'border-[var(--accent-primary)] bg-white/[0.05] text-white'
                  : 'border-transparent hover:bg-white/[0.03] text-zinc-400'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveConvoId(c.id);
                  setError('');
                  setFailedRequest(null);
                  setMobileHistoryOpen(false);
                }}
                className="flex-1 text-left truncate font-medium min-h-[28px]"
              >
                {c.title}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConvo(c.id)}
                aria-label="Delete conversation"
                className="text-zinc-500 hover:text-rose-400 p-1 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      title="AI Coach"
      headerAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void runHealthProbe()}
            disabled={checkingHealth}
            className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Test Edge Function</span>
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
        {/* Conversation History Sidebar (Desktop full card, Mobile compact collapsible) */}
        <Card className="lg:col-span-4 space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl overflow-hidden border border-white/10 bg-[#0D0F13] shrink-0">
                {!avatarError ? (
                  <img
                    src="/src/assets/images/coach_avatar_mark_1794985503083.jpg"
                    alt="GYM PAGLU AI Coach emblem"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bot className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold text-white truncate">
                  AI Fitness Coach
                </h1>
                <p className="text-xs text-zinc-400 truncate">
                  Groq primary · OpenRouter fallback
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileHistoryOpen((v) => !v)}
              className="lg:hidden min-h-[36px] px-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 shrink-0"
            >
              <History className="w-3.5 h-3.5" />
              <span>History ({conversations.length})</span>
              {mobileHistoryOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-white/10 bg-white/[0.02] cursor-pointer">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="mt-0.5 accent-[#C4F82A]"
            />
            <span className="text-xs text-zinc-300 leading-relaxed">
              Authorize coach to read my logged workouts, nutrition, PRs, and body metrics
            </span>
          </label>

          <div className={`${mobileHistoryOpen ? 'block' : 'hidden'} lg:block`}>
            {renderConversationList()}
          </div>
        </Card>

        {/* Active Chat Panel */}
        <Card className="lg:col-span-8 flex flex-col h-[calc(100dvh-16rem)] min-h-[380px] max-h-[760px] lg:h-[calc(100dvh-9.5rem)]">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06] shrink-0">
            <span className="text-xs font-medium text-zinc-400 inline-flex items-center gap-1.5 min-w-0 truncate">
              <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span className="truncate">
                Server-side Edge Function · Keys protected in Supabase secrets
              </span>
            </span>

            {activeConvoId && messages.length > 0 && (
              <button
                type="button"
                onClick={() => void handleClearChat()}
                disabled={sending || clearing}
                className="min-h-[32px] px-2.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-[11px] font-medium text-zinc-300 inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
              >
                <Eraser className="w-3 h-3" />
                <span>{clearing ? 'Clearing...' : 'Clear Chat'}</span>
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4 pr-1">
            {messages.length === 0 && !sending ? (
              <div className="space-y-4 py-2">
                <p className="text-sm text-zinc-300">
                  Ask about protein & macro targets, Indian meal ideas, progressive overload, exercise
                  technique, recovery, or your weekly progress report:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSend(q)}
                      className="p-3.5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[var(--accent-primary)] text-left text-xs text-zinc-200 leading-relaxed transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'font-medium whitespace-pre-wrap'
                          : 'border border-white/10 bg-[#181B22] text-zinc-100'
                      }`}
                      style={
                        msg.role === 'user'
                          ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                          : undefined
                      }
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownMessage content={msg.content} />
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === 'assistant' && msg.provider && (
                      <span className="text-[11px] text-zinc-500 mt-1 px-1">
                        {msg.provider.toUpperCase()} · {msg.model}
                        {msg.fallback_used ? ' (automatic fallback)' : ''}
                      </span>
                    )}
                  </div>
                ))}

                {sending && (
                  <div className="flex flex-col items-start">
                    {streamingReply ? (
                      <>
                        <div className="max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed border border-white/10 bg-[#181B22] text-zinc-100">
                          <MarkdownMessage content={streamingReply} />
                          <span
                            className="inline-block w-1.5 h-4 ml-1 align-middle animate-pulse"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                        </div>
                        {streamingMeta && (
                          <span className="text-[11px] text-zinc-500 mt-1 px-1">
                            {streamingMeta.provider.toUpperCase()} · {streamingMeta.model}
                            {streamingMeta.fallbackUsed ? ' (automatic fallback)' : ''}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#181B22] px-4 py-3 text-xs text-zinc-300">
                        <span className="inline-flex gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:120ms]"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:240ms]"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          />
                        </span>
                        <span>Coach is analyzing your fitness data...</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="mb-3 space-y-2.5 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1">
                  <ErrorBanner message={error} />
                </div>
                {failedRequest && (
                  <SecondaryButton
                    onClick={handleRetry}
                    disabled={sending}
                    className="shrink-0 self-start sm:self-center"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </SecondaryButton>
                )}
              </div>

              {showSetupHelp && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-3.5 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-amber-200 inline-flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      Deploy Supabase AI Coach Edge Function
                    </span>
                    {health && (
                      <span className="text-[11px] text-zinc-400">
                        Reachable: {health.reachable ? 'Yes' : 'No'} · Groq:{' '}
                        {health.groqConfigured ? 'Set' : 'Missing'} · OpenRouter:{' '}
                        {health.openRouterConfigured ? 'Set' : 'Missing'}
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-300 leading-relaxed">
                    Run these commands in your terminal against project{' '}
                    <code className="text-amber-200">{projectRef}</code> (API keys stay strictly
                    server-side in Supabase secrets):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => void copyCommand('deploy')}>
                      {copiedCmd === 'deploy' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      1. Copy Deploy Command
                    </SecondaryButton>
                    <SecondaryButton onClick={() => void copyCommand('secrets')}>
                      {copiedCmd === 'secrets' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      2. Copy Secrets Command
                    </SecondaryButton>
                    <PrimaryButton onClick={() => void runHealthProbe()} loading={checkingHealth}>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Verify Connection
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2 pt-3 border-t border-white/[0.06] shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                window.setTimeout(() => {
                  bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }, 150);
              }}
              placeholder="Ask your AI Fitness Coach..."
              maxLength={2000}
              className={`${INPUT_CLASS} flex-1`}
            />
            <PrimaryButton type="submit" loading={sending} disabled={!input.trim()}>
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </PrimaryButton>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
