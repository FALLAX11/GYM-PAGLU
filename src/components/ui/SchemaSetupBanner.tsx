import { useState } from 'react';
import { Check, Copy, Database, ExternalLink, RefreshCw } from 'lucide-react';
import initialSchemaSql from '../../../supabase/migrations/20261118000001_initial_schema.sql?raw';
import seedCatalogsSql from '../../../supabase/migrations/20261118000002_seed_catalogs.sql?raw';
import expandExerciseCatalogSql from '../../../supabase/migrations/20261118000003_expand_exercise_catalog.sql?raw';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSupabaseProjectRef } from '../../lib/supabase';
import { PrimaryButton, SecondaryButton } from './Primitives';

export function SchemaSetupBanner() {
  const { schemaMissing, exerciseCatalogNeedsSeed, exerciseCatalogCount, refreshAccount } =
    useAuth();
  const { showToast } = useToast();
  const [copiedStep, setCopiedStep] = useState<'schema' | 'seed' | 'expand' | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (!schemaMissing && !exerciseCatalogNeedsSeed) return null;

  const projectRef = getSupabaseProjectRef();
  const sqlEditorUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : 'https://supabase.com/dashboard';

  const copySql = async (kind: 'schema' | 'seed' | 'expand') => {
    const sql =
      kind === 'schema'
        ? initialSchemaSql
        : kind === 'seed'
          ? seedCatalogsSql
          : expandExerciseCatalogSql;
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedStep(kind);
      showToast(
        kind === 'schema'
          ? 'Schema SQL copied. Paste and run it in Supabase SQL Editor.'
          : kind === 'seed'
            ? 'Full seed catalog SQL copied. Paste and run it in Supabase SQL Editor.'
            : '348-exercise Master Catalog SQL copied. Paste and run it in Supabase SQL Editor.',
        'success'
      );
      window.setTimeout(() => setCopiedStep(null), 3000);
    } catch {
      showToast('Clipboard blocked — copy from supabase/migrations/ files directly.', 'error');
    }
  };

  const handleVerify = async () => {
    setRetrying(true);
    try {
      await refreshAccount();
      showToast('Verified Supabase database & exercise catalog.', 'info');
    } finally {
      setRetrying(false);
    }
  };

  if (!schemaMissing && exerciseCatalogNeedsSeed) {
    return (
      <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-base font-bold text-white">
              Sync Supabase Exercise Library ({exerciseCatalogCount ?? 0} found)
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Your <code className="text-amber-200">public.exercises</code> table currently has{' '}
              <strong className="text-white">{exerciseCatalogCount ?? 0}</strong> exercises in
              Supabase. Run <code className="text-amber-200">20261118000003_expand_exercise_catalog.sql</code>{' '}
              in your Supabase SQL Editor to sync all 348 canonical exercises across 15 categories,
              then click <strong className="text-white">Verify &amp; Sync</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <SecondaryButton onClick={() => void copySql('expand')}>
            {copiedStep === 'expand' ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Copy 348-Exercise SQL
          </SecondaryButton>

          <a
            href={sqlEditorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm inline-flex items-center gap-2 border border-white/10 bg-[#181B22] text-zinc-200 hover:text-white hover:bg-white/5 whitespace-nowrap"
          >
            <span>Open SQL Editor</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <PrimaryButton onClick={() => void handleVerify()} loading={retrying}>
            <RefreshCw className="w-4 h-4" />
            Verify &amp; Sync
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Database className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <h2 className="font-display text-base font-bold text-white">
            Finish Supabase Database Setup
          </h2>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Your Supabase authentication is active, but the GYM PAGLU PostgreSQL tables (
            <code className="text-amber-200">profiles</code>,{' '}
            <code className="text-amber-200">exercises</code>,{' '}
            <code className="text-amber-200">workout_sessions</code>,{' '}
            <code className="text-amber-200">food_logs</code>,{' '}
            <code className="text-amber-200">nutrition_goals</code>) have not been created in your
            project yet. Run both SQL scripts below in your Supabase SQL Editor, then click{' '}
            <strong className="text-white">Verify &amp; Sync</strong>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <SecondaryButton onClick={() => void copySql('schema')}>
          {copiedStep === 'schema' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          1. Copy Schema SQL
        </SecondaryButton>

        <SecondaryButton onClick={() => void copySql('seed')}>
          {copiedStep === 'seed' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          2. Copy Seed Catalog SQL
        </SecondaryButton>

        <a
          href={sqlEditorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm inline-flex items-center gap-2 border border-white/10 bg-[#181B22] text-zinc-200 hover:text-white hover:bg-white/5 whitespace-nowrap"
        >
          <span>Open SQL Editor</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        <PrimaryButton onClick={() => void handleVerify()} loading={retrying}>
          <RefreshCw className="w-4 h-4" />
          Verify &amp; Sync
        </PrimaryButton>
      </div>
    </div>
  );
}
