import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Award, Check, Edit3, Link2, Save, Trash2, TrendingUp } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
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
import {
  loadSessionPRSummary,
  type PersistedSessionPRSummary,
} from '../../lib/prDetection';
import { isSchemaMissingError } from '../../lib/supabase';
import {
  formatDuration,
  formatWeight,
  toCanonicalWeightKg,
  toDisplayWeight,
} from '../../lib/units';
import {
  deleteWorkoutSession,
  fetchWorkoutSessionById,
  updateWorkoutSessionNotesAndSets,
} from '../../services/workoutService';
import type { SetType, WorkoutSessionRecord } from '../../types/database';

function renderSetTypeTag(setType?: SetType) {
  if (setType === 'warmup') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
        Warm-up
      </span>
    );
  }
  if (setType === 'drop') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
        Drop
      </span>
    );
  }
  if (setType === 'failure') {
    return (
      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
        Failure
      </span>
    );
  }
  return null;
}

export function WorkoutDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, settings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<WorkoutSessionRecord | null>(null);
  const [prSummary, setPrSummary] = useState<PersistedSessionPRSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [setEdits, setSetEdits] = useState<
    Record<string, { weight_kg: number; reps: number; is_completed: boolean }>
  >({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadSession = useCallback(async () => {
    if (!user || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchWorkoutSessionById(user.id, sessionId);
      if (!data) {
        setError('Workout record not found.');
      } else {
        setSession(data);
        setPrSummary(loadSessionPRSummary(user.id, data.id));
        setWorkoutName(data.workout_name);
        setSessionNotes(data.session_notes || '');
        const map: Record<string, { weight_kg: number; reps: number; is_completed: boolean }> = {};
        for (const ex of data.workout_session_exercises ?? []) {
          for (const s of ex.workout_sets ?? []) {
            map[s.id] = {
              weight_kg: Number(s.weight_kg),
              reps: Number(s.reps),
              is_completed: Boolean(s.is_completed),
            };
          }
        }
        setSetEdits(map);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      } else {
        setError('Workout record not found.');
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, user]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleSaveEdits = async () => {
    if (!user || !session) return;
    setSaving(true);
    try {
      const setsArray = Object.entries(setEdits).map(([id, val]) => ({
        id,
        ...val,
      }));
      const updated = await updateWorkoutSessionNotesAndSets(
        user.id,
        session.id,
        workoutName,
        sessionNotes,
        setsArray
      );
      setSession(updated);
      setEditing(false);
      showToast('Workout changes saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !session) return;
    setSaving(true);
    try {
      await deleteWorkoutSession(user.id, session.id);
      showToast('Workout record deleted.', 'info');
      navigate('/workout/history', { replace: true });
    } catch (err) {
      showToast((err as Error).message, 'error');
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Workout Details"
      showBack
      headerAction={
        session && (
          <div className="flex items-center gap-2">
            {editing ? (
              <PrimaryButton onClick={handleSaveEdits} loading={saving}>
                <Save className="w-4 h-4" />
                Save
              </PrimaryButton>
            ) : (
              <SecondaryButton onClick={() => setEditing(true)}>
                <Edit3 className="w-4 h-4" />
                Edit
              </SecondaryButton>
            )}
          </div>
        )
      }
    >
      {loading ? (
        <LoadingBlock label="Loading workout record..." />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadSession} />
      ) : session ? (
        <div className="space-y-5">
          {/* Post-Workout PR Summary Banner */}
          {prSummary && prSummary.highlights.length > 0 && (
            <Card
              className="space-y-3 border-[var(--accent-primary)]/40"
              style={{ backgroundColor: 'rgba(196, 248, 42, 0.05)' }}
            >
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h2 className="font-display text-base font-bold text-white">
                    Personal Records Broken ({prSummary.highlights.length})
                  </h2>
                  <p className="text-xs text-zinc-400">
                    New all-time milestones achieved during this session.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {prSummary.highlights.map((h) => (
                  <div
                    key={h.exerciseName}
                    className="px-3 py-2.5 rounded-xl bg-[#0D0F13]/80 border border-white/10 space-y-1"
                  >
                    <p className="text-sm font-semibold text-white">{h.exerciseName}</p>
                    <div className="flex flex-wrap gap-2 text-xs font-mono-num">
                      {h.weightPR && (
                        <span
                          className="px-2 py-0.5 rounded-md font-semibold"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          Heaviest Weight: {formatWeight(h.weightPR.previousKg, settings.weight_unit)} →{' '}
                          {formatWeight(h.weightPR.newKg, settings.weight_unit)}
                        </span>
                      )}
                      {h.oneRMPR && (
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-semibold">
                          Est. 1RM: {formatWeight(h.oneRMPR.previousKg, settings.weight_unit)} →{' '}
                          {formatWeight(h.oneRMPR.newKg, settings.weight_unit)}
                        </span>
                      )}
                      {h.volumePR && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-semibold">
                          Max Set Vol: {formatWeight(h.volumePR.newKg, settings.weight_unit)} (
                          {formatWeight(h.volumePR.weightKg, settings.weight_unit)} ×{' '}
                          {h.volumePR.reps})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="space-y-3">
            {editing ? (
              <input
                type="text"
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                className={`${INPUT_CLASS} font-display text-lg font-bold`}
              />
            ) : (
              <h1 className="font-display text-2xl font-bold text-white">{session.workout_name}</h1>
            )}

            <p className="text-xs text-zinc-400 font-mono-num">
              {session.workout_date} · {formatDuration(session.duration_seconds)} ·{' '}
              {formatWeight(session.total_volume_kg, settings.weight_unit)} total volume
            </p>

            {editing ? (
              <textarea
                rows={2}
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Session notes..."
                className={INPUT_CLASS}
              />
            ) : session.session_notes ? (
              <p className="text-sm text-zinc-300 pt-2 border-t border-white/[0.06]">
                {session.session_notes}
              </p>
            ) : null}
          </Card>

          <div className="space-y-4">
            {(session.workout_session_exercises ?? []).map((ex) => (
              <Card key={ex.id} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-zinc-400">{ex.exercise_category}</p>
                      {ex.superset_group && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          <Link2 className="w-3 h-3" />
                          Superset {ex.superset_group}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-base font-bold text-white">
                      {ex.exercise_name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/workout/exercise/${encodeURIComponent(ex.exercise_name)}`)
                    }
                    className="text-xs font-semibold inline-flex items-center gap-1 hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Lifetime History</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {(ex.workout_sets ?? []).map((s) => {
                    const editState = setEdits[s.id];
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-xs font-semibold text-zinc-400">
                            Set {s.set_number}
                          </span>
                          {renderSetTypeTag(s.set_type)}
                          {typeof s.rpe === 'number' && (
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 font-mono-num text-[10px]">
                              RPE {s.rpe}
                            </span>
                          )}
                        </div>
                        {editing && editState ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.5"
                              value={toDisplayWeight(editState.weight_kg, settings.weight_unit)}
                              onChange={(e) =>
                                setSetEdits((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...editState,
                                    weight_kg: toCanonicalWeightKg(
                                      parseFloat(e.target.value) || 0,
                                      settings.weight_unit
                                    ),
                                  },
                                }))
                              }
                              className="w-20 min-h-[38px] px-2 rounded-lg bg-[#0D0F13] border border-white/10 text-xs font-mono-num text-white text-center"
                            />
                            <span className="text-xs text-zinc-400">
                              {settings.weight_unit.toUpperCase()} ×
                            </span>
                            <input
                              type="number"
                              value={editState.reps}
                              onChange={(e) =>
                                setSetEdits((prev) => ({
                                  ...prev,
                                  [s.id]: {
                                    ...editState,
                                    reps: parseInt(e.target.value, 10) || 0,
                                  },
                                }))
                              }
                              className="w-16 min-h-[38px] px-2 rounded-lg bg-[#0D0F13] border border-white/10 text-xs font-mono-num text-white text-center"
                            />
                            <span className="text-xs text-zinc-400">reps</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span className="font-mono-num text-sm font-semibold text-white">
                              {formatWeight(s.weight_kg, settings.weight_unit)} × {s.reps} reps
                            </span>
                            {s.is_completed && (
                              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {ex.exercise_notes && (
                  <p className="text-xs text-zinc-400">Note: {ex.exercise_notes}</p>
                )}
              </Card>
            ))}
          </div>

          {/* Delete Workout Controls */}
          <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Delete Workout Record</p>
              <p className="text-xs text-zinc-400">
                Permanently remove this session and its sets from your history.
              </p>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={() => setConfirmDelete(false)}>Cancel</SecondaryButton>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDelete}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"
                >
                  Confirm Delete
                </button>
              </div>
            ) : (
              <SecondaryButton onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 text-rose-400" />
                Delete Session
              </SecondaryButton>
            )}
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
