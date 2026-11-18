import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  EmptyState,
  ErrorBanner,
  INPUT_CLASS,
  LoadingBlock,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { isSchemaMissingError } from '../../lib/supabase';
import { formatDuration, formatWeight } from '../../lib/units';
import { fetchWorkoutSessions } from '../../services/workoutService';
import type { WorkoutSessionRecord } from '../../types/database';

export function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const { user, settings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchWorkoutSessions(user.id, { limit: 200 });
      setSessions(data);
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const workoutDatesSet = useMemo(() => new Set(sessions.map((s) => s.workout_date)), [sessions]);

  const calendarDays = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number | null; dateStr: string }> = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, dateStr: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr });
    }
    return cells;
  }, [monthCursor]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedDate && s.workout_date !== selectedDate) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      if (s.workout_name.toLowerCase().includes(q)) return true;
      return (s.workout_session_exercises ?? []).some((e) =>
        e.exercise_name.toLowerCase().includes(q)
      );
    });
  }, [search, selectedDate, sessions]);

  const monthStats = useMemo(() => {
    const prefix = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = sessions.filter((s) => s.workout_date.startsWith(prefix));
    const totalVol = inMonth.reduce((sum, s) => sum + Number(s.total_volume_kg || 0), 0);
    return {
      count: inMonth.length,
      volumeKg: Math.round(totalVol),
    };
  }, [monthCursor, sessions]);

  return (
    <AppShell title="Workout History" showBack>
      <div className="space-y-5">
        {error && <ErrorBanner message={error} onRetry={loadHistory} />}

        {loading ? (
          <LoadingBlock label="Fetching permanent workout history..." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Calendar Panel */}
            <Card className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-bold text-white">
                    {monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </h2>
                  <p className="text-xs text-zinc-400 font-mono-num">
                    {monthStats.count} workouts ·{' '}
                    {formatWeight(monthStats.volumeKg, settings.weight_unit)} volume
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() =>
                      setMonthCursor(
                        (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
                      )
                    }
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() =>
                      setMonthCursor(
                        (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      )
                    }
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((cell, idx) => {
                  if (!cell.day) return <div key={`empty-${idx}`} className="h-10" />;
                  const hasWorkout = workoutDatesSet.has(cell.dateStr);
                  const isSelected = selectedDate === cell.dateStr;
                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() =>
                        setSelectedDate((prev) => (prev === cell.dateStr ? '' : cell.dateStr))
                      }
                      className="h-10 rounded-xl font-mono-num text-xs font-semibold flex flex-col items-center justify-center border transition-colors"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--accent-primary)'
                          : hasWorkout
                            ? 'var(--accent-soft)'
                            : 'transparent',
                        borderColor: isSelected
                          ? 'var(--accent-primary)'
                          : hasWorkout
                            ? 'var(--accent-primary)'
                            : 'rgba(255,255,255,0.05)',
                        color: isSelected
                          ? 'var(--accent-fg)'
                          : hasWorkout
                            ? 'var(--accent-primary)'
                            : '#9CA3AF',
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>

              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="text-xs font-medium hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Clear date filter ({selectedDate})
                </button>
              )}
            </Card>

            {/* Session List */}
            <div className="lg:col-span-7 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by workout or exercise name (e.g. Bench Press)..."
                  className={`${INPUT_CLASS} pl-10`}
                />
              </div>

              {filteredSessions.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon className="w-5 h-5" />}
                  title="No matching workout records"
                  description="Try clearing the date filter or search query."
                />
              ) : (
                filteredSessions.map((sess) => (
                  <Card
                    key={sess.id}
                    onClick={() => navigate(`/workout/session/${sess.id}`)}
                    className="space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-mono-num text-zinc-400">{sess.workout_date}</p>
                        <h3 className="font-display text-base font-bold text-white mt-0.5 truncate">
                          {sess.workout_name}
                        </h3>
                      </div>
                      <span className="font-mono-num text-xs font-semibold text-zinc-300 shrink-0">
                        {formatWeight(sess.total_volume_kg, settings.weight_unit)}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 space-y-1 pt-1 border-t border-white/[0.06]">
                      {(sess.workout_session_exercises ?? []).slice(0, 4).map((ex) => {
                        const completed = (ex.workout_sets ?? []).filter((s) => s.is_completed);
                        const best = completed.reduce(
                          (b, cur) => (cur.weight_kg > b.weight_kg ? cur : b),
                          completed[0] ?? { weight_kg: 0, reps: 0 }
                        );
                        return (
                          <div key={ex.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-zinc-300">{ex.exercise_name}</span>
                            <span className="font-mono-num text-zinc-400 shrink-0">
                              {completed.length} sets · top{' '}
                              {formatWeight(best.weight_kg, settings.weight_unit)} × {best.reps}
                            </span>
                          </div>
                        );
                      })}
                      {(sess.workout_session_exercises?.length ?? 0) > 4 && (
                        <p className="text-[11px] text-zinc-500">
                          +{(sess.workout_session_exercises?.length ?? 0) - 4} more exercises ·{' '}
                          {formatDuration(sess.duration_seconds)}
                        </p>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
