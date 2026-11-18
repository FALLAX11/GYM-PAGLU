import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database, Dumbbell, ShieldCheck, TrendingUp, Utensils } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PrimaryButton, SecondaryButton } from '../../components/ui/Primitives';
import { CloudConfigModal } from './CloudConfigModal';

export function WelcomeScreen() {
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const [configOpen, setConfigOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="min-h-dvh w-full flex flex-col justify-between safe-top-pad safe-bottom-pad"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
        <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          GYM <span style={{ color: 'var(--accent-primary)' }}>PAGLU</span>
        </span>
        <button
          type="button"
          onClick={() => setConfigOpen(true)}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Database className="w-3.5 h-3.5" style={{ color: isConfigured ? 'var(--accent-primary)' : '#F59E0B' }} />
          <span>{isConfigured ? 'Cloud Connected' : 'Connect Supabase'}</span>
        </button>
      </header>

      {/* Main Split Hero */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-4 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-zinc-400">
              Android Strength & Nutrition Platform
            </p>
            <h1
              className="font-display font-extrabold tracking-tight text-white leading-[1.06]"
              style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.75rem)', textWrap: 'balance' }}
            >
              Your Fitness.{' '}
              <span style={{ color: 'var(--accent-primary)' }}>Your Rules.</span>
            </h1>
            <p className="text-base text-zinc-400 max-w-xl leading-relaxed">
              Log every set, weight, and rep permanently in the cloud. Track Indian and global
              nutrition, monitor progressive overload against prior sessions, and train with an AI
              coach built on your real numbers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-start gap-3">
              <Dumbbell className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <p className="text-sm font-semibold text-white">Permanent Lift History</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Automatic previous-session comparison on every exercise.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-start gap-3">
              <Utensils className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <p className="text-sm font-semibold text-white">Full Macro & Indian Diet</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Roti, dal, paneer, whey, custom foods, and daily hydration.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-start gap-3">
              <TrendingUp className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <p className="text-sm font-semibold text-white">Body & Strength Analytics</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Weight curves, 1RM tracking, measurements, and private photos.
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div>
                <p className="text-sm font-semibold text-white">Isolated Cloud Accounts</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  PostgreSQL Row Level Security keeps your records strictly yours.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <PrimaryButton onClick={() => navigate('/signup')} className="w-full sm:w-auto">
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4" />
            </PrimaryButton>
            <SecondaryButton onClick={() => navigate('/login')} className="w-full sm:w-auto">
              Sign In to Existing Account
            </SecondaryButton>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="relative rounded-3xl overflow-hidden border border-white/10 aspect-[4/3] bg-[#111318]">
            {!imgError ? (
              <img
                src="/src/assets/images/welcome_gym_hero_1794985505147.jpg"
                alt="Barbell with matte calibrated weight plates on a dark gym lifting platform"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#14171D] to-[#08090B]">
                <Dumbbell className="w-16 h-16 text-zinc-700" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#08090B] via-black/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
              <p className="text-xs font-medium text-zinc-300">
                Bench Press · Progressive Overload
              </p>
              <p className="font-mono-num text-sm sm:text-base font-semibold text-white mt-1">
                Previous: 70 KG × 6 reps <span className="text-zinc-500 mx-1">→</span>{' '}
                <span style={{ color: 'var(--accent-primary)' }}>Current: 70 KG × 8 reps</span>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-5 py-4 text-xs text-zinc-500 flex items-center justify-between gap-4">
        <span>GYM PAGLU · Online Cloud Platform</span>
        <span>Android Capacitor Edition</span>
      </footer>

      <CloudConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
