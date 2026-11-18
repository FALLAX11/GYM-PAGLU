import { useNavigate } from 'react-router-dom';
import { Clock, Dumbbell, Play, Trash2 } from 'lucide-react';
import { ModalSheet, PrimaryButton, SecondaryButton } from '../ui/Primitives';
import { useWorkoutSession } from '../../context/WorkoutSessionContext';
import { formatDuration } from '../../lib/units';

export function WorkoutRecoveryModal() {
  const navigate = useNavigate();
  const {
    session,
    pendingRecovery,
    elapsedSeconds,
    acknowledgeRecovery,
    discardWorkout,
  } = useWorkoutSession();

  if (!pendingRecovery || !session) return null;

  const completedSets = session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.is_completed).length,
    0
  );

  const handleResume = () => {
    acknowledgeRecovery();
    navigate('/workout/active');
  };

  return (
    <ModalSheet
      open={true}
      onClose={acknowledgeRecovery}
      title="Resume Unfinished Workout?"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-white truncate">
              {session.workoutName}
            </h3>
            <span className="font-mono-num text-xs font-semibold inline-flex items-center gap-1.5 text-zinc-200 shrink-0">
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          <p className="text-xs text-zinc-400 flex items-center gap-2">
            <Dumbbell className="w-3.5 h-3.5 shrink-0" />
            <span>
              {session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'} ·{' '}
              {completedSets} completed set{completedSets === 1 ? '' : 's'} · {session.workoutDate}
            </span>
          </p>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Your active workout timer and logged sets were preserved safely across your last session.
          Resuming continues the same session without creating duplicate records.
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <PrimaryButton onClick={handleResume} className="flex-1">
            <Play className="w-4 h-4" />
            Resume Workout
          </PrimaryButton>
          <SecondaryButton onClick={discardWorkout} className="flex-1 text-rose-300">
            <Trash2 className="w-4 h-4" />
            Discard Draft
          </SecondaryButton>
        </div>
      </div>
    </ModalSheet>
  );
}
