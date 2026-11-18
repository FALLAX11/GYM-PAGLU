import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_URL_KEY = 'gympaglu_supabase_url';
const RUNTIME_KEY_KEY = 'gympaglu_supabase_anon_key';

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (value.includes('YOUR_PROJECT_ID')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): { url: string; anonKey: string; source: 'env' | 'runtime' | 'none' } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (isValidHttpUrl(envUrl) && envKey && !envKey.includes('YOUR_SUPABASE_ANON_KEY')) {
    return { url: envUrl.trim(), anonKey: envKey.trim(), source: 'env' };
  }

  if (typeof window !== 'undefined') {
    const localUrl = window.localStorage.getItem(RUNTIME_URL_KEY) ?? '';
    const localKey = window.localStorage.getItem(RUNTIME_KEY_KEY) ?? '';
    if (isValidHttpUrl(localUrl) && localKey.length > 20) {
      return { url: localUrl.trim(), anonKey: localKey.trim(), source: 'runtime' };
    }
  }

  return { url: '', anonKey: '', source: 'none' };
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().source !== 'none';
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (cfg.source === 'none') {
    cachedClient = null;
    cachedSignature = '';
    return null;
  }

  const signature = `${cfg.url}::${cfg.anonKey}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'gympaglu-auth-session',
      },
    });
    cachedSignature = signature;
  }

  return cachedClient;
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (!isValidHttpUrl(url)) {
    throw new Error('Enter a valid Supabase Project URL (https://your-project.supabase.co).');
  }
  if (!anonKey || anonKey.trim().length < 24) {
    throw new Error('Enter a valid Supabase anon/public API key.');
  }
  window.localStorage.setItem(RUNTIME_URL_KEY, url.trim());
  window.localStorage.setItem(RUNTIME_KEY_KEY, anonKey.trim());
  cachedClient = null;
  cachedSignature = '';
}

export function clearRuntimeSupabaseConfig(): void {
  window.localStorage.removeItem(RUNTIME_URL_KEY);
  window.localStorage.removeItem(RUNTIME_KEY_KEY);
  cachedClient = null;
  cachedSignature = '';
}

export function getSupabaseProjectRef(): string | null {
  const { url } = getSupabaseConfig();
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    const ref = hostname.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

export function isSchemaMissingError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('pgrst205') ||
    msg.includes('42p01') ||
    (msg.includes('relation') && msg.includes('does not exist'))
  );
}

