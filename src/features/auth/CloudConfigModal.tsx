import React, { useState } from 'react';
import { CheckCircle2, Database, KeyRound, Trash2 } from 'lucide-react';
import {
  clearRuntimeSupabaseConfig,
  getSupabaseConfig,
  saveRuntimeSupabaseConfig,
} from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FormField,
  INPUT_CLASS,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';

export function CloudConfigModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const current = getSupabaseConfig();
  const { refreshConfigStatus } = useAuth();
  const { showToast } = useToast();

  const [url, setUrl] = useState(current.url);
  const [anonKey, setAnonKey] = useState(current.anonKey);
  const [error, setError] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      saveRuntimeSupabaseConfig(url, anonKey);
      refreshConfigStatus();
      showToast('Supabase project connected. You can now sign up or sign in.', 'success');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleClear = () => {
    clearRuntimeSupabaseConfig();
    setUrl('');
    setAnonKey('');
    refreshConfigStatus();
    showToast('Runtime Supabase connection cleared.', 'info');
  };

  return (
    <ModalSheet open={open} onClose={onClose} title="Supabase Cloud Configuration">
      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Database className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <span>
              {current.source === 'env'
                ? 'Connected via environment variables (.env)'
                : current.source === 'runtime'
                  ? 'Connected via runtime configuration'
                  : 'Supabase credentials required'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            GYM PAGLU uses real Supabase Authentication and PostgreSQL Row Level Security. Enter
            your Supabase Project URL and Anon Key below, or set{' '}
            <code className="text-zinc-200">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-zinc-200">VITE_SUPABASE_ANON_KEY</code> in{' '}
            <code className="text-zinc-200">.env</code>.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Supabase Project URL" hint="Example: https://abcdefg.supabase.co">
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project-id.supabase.co"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField
            label="Supabase Anon Public Key"
            hint="Safe client key protected by PostgreSQL RLS policies"
          >
            <input
              type="text"
              required
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className={INPUT_CLASS}
            />
          </FormField>

          {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <PrimaryButton type="submit" className="flex-1">
              <KeyRound className="w-4 h-4" />
              Connect Project
            </PrimaryButton>
            {current.source === 'runtime' && (
              <SecondaryButton onClick={handleClear}>
                <Trash2 className="w-4 h-4" />
                Clear
              </SecondaryButton>
            )}
          </div>
        </form>

        <div className="border-t border-white/[0.08] pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-zinc-200">Required Cloud Setup Steps</h4>
          <ul className="space-y-1.5 text-xs text-zinc-400">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
              <span>
                Run <code className="text-zinc-300">supabase/migrations/20261118000001_initial_schema.sql</code> and{' '}
                <code className="text-zinc-300">20261118000002_seed_catalogs.sql</code> in Supabase SQL Editor.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
              <span>
                Deploy <code className="text-zinc-300">supabase/functions/ai-coach</code> and set{' '}
                <code className="text-zinc-300">GROQ_API_KEY</code> and{' '}
                <code className="text-zinc-300">OPENROUTER_API_KEY</code> via Supabase Secrets.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </ModalSheet>
  );
}
