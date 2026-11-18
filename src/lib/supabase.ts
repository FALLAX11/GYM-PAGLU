import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_URL_KEY = 'gympaglu_supabase_url';
const RUNTIME_KEY_KEY = 'gympaglu_supabase_anon_key';

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.includes('YOUR_PROJECT_ID') ||
    trimmed.includes('your-project-id')
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isValidAnonKey(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (
    trimmed.length < 20 ||
    trimmed.includes('YOUR_SUPABASE_ANON_KEY') ||
    trimmed.includes('your-supabase-anon-key')
  ) {
    return false;
  }
  const payload = decodeJwtPayload(trimmed);
  if (payload && payload.role === 'service_role') {
    return false;
  }
  return true;
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  source: 'env' | 'runtime' | 'none';
} {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (isValidHttpUrl(envUrl) && isValidAnonKey(envKey)) {
    return { url: envUrl.trim(), anonKey: envKey.trim(), source: 'env' };
  }

  // Runtime localStorage override is strictly limited to local development when .env is absent.
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const localUrl = window.localStorage.getItem(RUNTIME_URL_KEY) ?? '';
    const localKey = window.localStorage.getItem(RUNTIME_KEY_KEY) ?? '';
    if (isValidHttpUrl(localUrl) && isValidAnonKey(localKey)) {
      return { url: localUrl.trim(), anonKey: localKey.trim(), source: 'runtime' };
    }
  }

  return { url: '', anonKey: '', source: 'none' };
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';
let cachedConfig: { url: string; anonKey: string } | null = null;

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().source !== 'none';
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (cfg.source === 'none') {
    cachedClient = null;
    cachedSignature = '';
    cachedConfig = null;
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
    cachedConfig = { url: cfg.url, anonKey: cfg.anonKey };
  }

  return cachedClient;
}

// Automatically initialize the default Supabase client at module load when env config is present.
export const supabase = getSupabaseClient();

export function getInitializedSupabaseConnection(): {
  client: SupabaseClient;
  url: string;
  anonKey: string;
} | null {
  const client = getSupabaseClient();
  if (!client || !cachedConfig) return null;
  return {
    client,
    url: cachedConfig.url,
    anonKey: cachedConfig.anonKey,
  };
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (!import.meta.env.DEV) {
    throw new Error('Runtime Supabase configuration override is disabled in production builds.');
  }
  if (!isValidHttpUrl(url)) {
    throw new Error('Enter a valid Supabase Project URL (https://your-project.supabase.co).');
  }
  if (!isValidAnonKey(anonKey)) {
    throw new Error('Enter a valid Supabase anon/public key (never a service_role key).');
  }
  window.localStorage.setItem(RUNTIME_URL_KEY, url.trim());
  window.localStorage.setItem(RUNTIME_KEY_KEY, anonKey.trim());
  cachedClient = null;
  cachedSignature = '';
  cachedConfig = null;
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(RUNTIME_URL_KEY);
    window.localStorage.removeItem(RUNTIME_KEY_KEY);
  }
  cachedClient = null;
  cachedSignature = '';
  cachedConfig = null;
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
