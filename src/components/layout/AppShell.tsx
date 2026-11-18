import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Apple,
  ArrowLeft,
  Bot,
  Clock,
  Dumbbell,
  Home,
  Play,
  Timer,
  TrendingUp,
  User,
} from 'lucide-react';
import { useWorkoutSession } from '../../context/WorkoutSessionContext';
import { triggerHaptic } from '../../lib/capacitor';
import { formatDuration } from '../../lib/units';
import { SchemaSetupBanner } from '../ui/SchemaSetupBanner';

const NAV_ITEMS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/workout', label: 'Workout', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Apple },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/coach', label: 'AI Coach', icon: Bot },
  { to: '/profile', label: 'Profile', icon: User },
] as const;

export function AppShell({
  title,
  showBack = false,
  headerAction,
  children,
}: {
  title: string;
  showBack?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    session: activeWorkout,
    isActive: hasActiveWorkout,
    isSessionPaused,
    pendingRecovery,
    elapsedSeconds,
    restRemainingSeconds,
    adjustRestTimer,
    toggleRestTimer,
  } = useWorkoutSession();

  const showActiveBanner =
    hasActiveWorkout &&
    activeWorkout !== null &&
    !pendingRecovery &&
    location.pathname !== '/workout/active';

  const handleNavClick = () => {
    void triggerHaptic('light');
  };

  return (
    <div className="app-shell-root">
      {/* 1. Dedicated Android System Bar Spacer (env(safe-area-inset-top)) */}
      <div className="app-system-bar" aria-hidden="true" />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop Sidebar Rail */}
        <aside
          className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="px-6 py-5 border-b border-white/[0.06]">
            <NavLink to="/home" className="block">
              <span className="font-display text-xl font-bold tracking-tight text-white">
                GYM <span style={{ color: 'var(--accent-primary)' }}>PAGLU</span>
              </span>
            </NavLink>
          </div>

          <nav className="flex-1 p-3 space-y-1" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === item.to ||
                (item.to !== '/home' && location.pathname.startsWith(item.to));
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleNavClick}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-[#08090B] font-semibold'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                      : undefined
                  }
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/workout' && hasActiveWorkout && (
                    <span
                      className="w-2 h-2 rounded-full animate-pulse shrink-0"
                      style={{
                        backgroundColor: isActive ? '#08090B' : 'var(--accent-primary)',
                      }}
                      aria-label="Workout in progress"
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/[0.06] text-xs text-zinc-500">
            Your Fitness. Your Rules.
          </div>
        </aside>

        {/* Main Column: Header + Scrollable Content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* 2. App Header Region (Begins strictly below system bar) */}
          <header className="app-header-bar px-4 lg:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              {showBack ? (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  aria-label="Go back"
                  className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/5"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="lg:hidden font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                  GYM <span style={{ color: 'var(--accent-primary)' }}>PAGLU</span>
                </span>
              )}
              <span className="hidden lg:inline font-display text-lg font-semibold text-white truncate">
                {title}
              </span>
              {showBack && (
                <span className="lg:hidden font-display text-base font-semibold text-white truncate">
                  {title}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">{headerAction}</div>
          </header>

          {/* 3. Scrollable Main Content Region */}
          <main className="app-scroll-region">
            <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
              {showActiveBanner && activeWorkout && (
                <div className="mb-4 w-full min-h-[48px] px-4 py-2.5 rounded-2xl border border-[var(--accent-primary)]/40 bg-[#141812] flex flex-wrap items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate('/workout/active')}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full animate-pulse shrink-0"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {activeWorkout.workoutName}{' '}
                        {isSessionPaused && (
                          <span className="text-amber-300 font-medium">(Paused)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] font-mono-num text-zinc-300 mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                          {formatDuration(elapsedSeconds)}
                        </span>
                        {activeWorkout.restStatus !== 'idle' && (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Timer className="w-3 h-3" />
                            Rest {formatDuration(restRemainingSeconds)}
                            {activeWorkout.restStatus === 'paused' ? ' (Paused)' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeWorkout.restStatus !== 'idle' && (
                      <>
                        <button
                          type="button"
                          onClick={() => adjustRestTimer(-15)}
                          className="min-h-[32px] px-2 rounded-lg border border-white/10 bg-white/[0.05] text-[11px] font-mono-num text-zinc-200 hover:text-white"
                        >
                          -15s
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustRestTimer(15)}
                          className="min-h-[32px] px-2 rounded-lg border border-white/10 bg-white/[0.05] text-[11px] font-mono-num text-zinc-200 hover:text-white"
                        >
                          +15s
                        </button>
                        <button
                          type="button"
                          onClick={toggleRestTimer}
                          className="min-h-[32px] px-2 rounded-lg border border-white/10 bg-white/[0.05] text-[11px] font-semibold text-zinc-200 hover:text-white"
                        >
                          {activeWorkout.restStatus === 'running' ? 'Pause' : 'Go'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('/workout/active')}
                      className="min-h-[34px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-primary)',
                        color: 'var(--accent-fg)',
                      }}
                    >
                      <Play className="w-3 h-3" />
                      Open
                    </button>
                  </div>
                </div>
              )}
              <SchemaSetupBanner />
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* 4. Mobile Fixed Bottom Navigation (Respects env(safe-area-inset-bottom)) */}
      <nav className="lg:hidden app-bottom-nav" aria-label="Bottom navigation">
        <div className="grid grid-cols-6 items-center h-16 max-w-xl mx-auto px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.to ||
              (item.to !== '/home' && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className="min-h-[48px] flex flex-col items-center justify-center gap-1 px-1 rounded-xl transition-colors"
                style={{
                  color: isActive ? 'var(--accent-primary)' : '#8E95A2',
                }}
              >
                <div className="relative">
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} />
                  {item.to === '/workout' && hasActiveWorkout && (
                    <span
                      className="w-2 h-2 rounded-full animate-pulse absolute -top-0.5 -right-1"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-tight whitespace-nowrap leading-none">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
