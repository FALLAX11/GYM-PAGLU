import { Dumbbell } from 'lucide-react';

export function SplashScreen() {
  return (
    <div
      className="min-h-dvh w-full flex flex-col items-center justify-center px-6 safe-top-pad safe-bottom-pad"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--accent-fg)',
          }}
        >
          <Dumbbell className="w-8 h-8" strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white">
            GYM <span style={{ color: 'var(--accent-primary)' }}>PAGLU</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Your Fitness. Your Rules.</p>
        </div>
        <div className="mt-4 w-36 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full w-1/2 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          />
        </div>
      </div>
    </div>
  );
}
