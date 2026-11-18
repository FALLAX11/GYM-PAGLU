import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Plus,
  Ruler,
  Scale,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  EmptyState,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  LoadingBlock,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { WeeklyMuscleAnalyticsPanel } from '../../components/workout/WeeklyMuscleAnalyticsPanel';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { isSchemaMissingError } from '../../lib/supabase';
import {
  formatWeight,
  getLocalDateString,
  toCanonicalWeightKg,
  toDisplayWeight,
} from '../../lib/units';
import {
  addBodyMeasurement,
  addWeightLog,
  deleteBodyMeasurement,
  deleteProgressPhoto,
  deleteWeightLog,
  fetchBodyMeasurements,
  fetchProgressPhotos,
  fetchWeightLogs,
  uploadProgressPhoto,
} from '../../services/progressService';
import {
  fetchExerciseLifetimeHistory,
  fetchWorkoutSessions,
  type ExerciseHistoryEntry,
} from '../../services/workoutService';
import type {
  BodyMeasurementRecord,
  ProgressPhotoRecord,
  WeightLogRecord,
  WorkoutSessionRecord,
} from '../../types/database';

export function ProgressPage() {
  const { user, profile, settings, refreshAccount, schemaMissing } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'overview' | 'muscles' | 'measurements' | 'photos'>('overview');
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [weightLogs, setWeightLogs] = useState<WeightLogRecord[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurementRecord[]>([]);
  const [photos, setPhotos] = useState<ProgressPhotoRecord[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);

  const [selectedExercise, setSelectedExercise] = useState<string>('Bench Press');
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistoryEntry[]>([]);

  // Log weight modal
  const [weightModal, setWeightModal] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(getLocalDateString());
  const [weightNotes, setWeightNotes] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);

  // Log measurement modal
  const [measModal, setMeasModal] = useState(false);
  const [mDate, setMDate] = useState(getLocalDateString());
  const [mChest, setMChest] = useState('');
  const [mWaist, setMWaist] = useState('');
  const [mArms, setMArms] = useState('');
  const [mThighs, setMThighs] = useState('');
  const [mShoulders, setMShoulders] = useState('');
  const [savingMeas, setSavingMeas] = useState(false);

  // Upload photo modal
  const [photoModal, setPhotoModal] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPose, setPhotoPose] = useState<'front' | 'side' | 'back'>('front');
  const [photoDate, setPhotoDate] = useState(getLocalDateString());
  const [photoWeight, setPhotoWeight] = useState('');
  const [photoNotes, setPhotoNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Before / After photo IDs
  const [beforePhotoId, setBeforePhotoId] = useState<string>('');
  const [afterPhotoId, setAfterPhotoId] = useState<string>('');

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      if (schemaMissing) {
        const [w, s] = await Promise.all([
          fetchWeightLogs(user.id).catch(() => []),
          fetchWorkoutSessions(user.id, { limit: 365 }).catch(() => []),
        ]);
        setWeightLogs(w);
        setSessions(s);
        setLoading(false);
        return;
      }

      const [w, m, p, s] = await Promise.all([
        fetchWeightLogs(user.id),
        fetchBodyMeasurements(user.id),
        fetchProgressPhotos(user.id),
        fetchWorkoutSessions(user.id, { limit: 365 }),
      ]);
      setWeightLogs(w);
      setMeasurements(m);
      setPhotos(p);
      setSessions(s);

      if (p.length >= 2) {
        setBeforePhotoId(p[p.length - 1].id);
        setAfterPhotoId(p[0].id);
      } else if (p.length === 1) {
        setBeforePhotoId(p[0].id);
        setAfterPhotoId(p[0].id);
      }
    } catch (err) {
      if (!isSchemaMissingError(err)) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [schemaMissing, user]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loggedExerciseNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of sessions) {
      for (const ex of s.workout_session_exercises ?? []) {
        names.add(ex.exercise_name);
      }
    }
    if (names.size === 0) names.add('Bench Press');
    return Array.from(names).sort();
  }, [sessions]);

  useEffect(() => {
    if (!user || !selectedExercise || schemaMissing) return;
    void fetchExerciseLifetimeHistory(user.id, selectedExercise)
      .then(setExerciseHistory)
      .catch(() => setExerciseHistory([]));
  }, [schemaMissing, selectedExercise, user]);

  const cutoffDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 365));
    return getLocalDateString(d);
  }, [timeframe]);

  const periodReport = useMemo(() => {
    const inPeriod = sessions.filter((s) => s.workout_date >= cutoffDateStr);
    const totalVolumeKg = inPeriod.reduce((sum, s) => sum + Number(s.total_volume_kg || 0), 0);
    const totalDuration = inPeriod.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);
    return {
      workouts: inPeriod.length,
      totalVolumeKg: Math.round(totalVolumeKg),
      avgDurationMin: inPeriod.length > 0 ? Math.round(totalDuration / inPeriod.length / 60) : 0,
    };
  }, [cutoffDateStr, sessions]);

  const weightChartData = useMemo(() => {
    return weightLogs
      .filter((w) => w.logged_date >= cutoffDateStr)
      .map((w) => ({
        date: w.logged_date.slice(5),
        weight: toDisplayWeight(Number(w.weight_kg), settings.weight_unit),
      }));
  }, [cutoffDateStr, settings.weight_unit, weightLogs]);

  const frequencyChartData = useMemo(() => {
    const buckets = new Map<string, { label: string; volume: number; workouts: number }>();
    for (const s of sessions.filter((x) => x.workout_date >= cutoffDateStr)) {
      const key = timeframe === 'year' ? s.workout_date.slice(0, 7) : s.workout_date.slice(5);
      const prev = buckets.get(key) ?? { label: key, volume: 0, workouts: 0 };
      buckets.set(key, {
        label: key,
        volume: prev.volume + toDisplayWeight(Number(s.total_volume_kg || 0), settings.weight_unit),
        workouts: prev.workouts + 1,
      });
    }
    return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [cutoffDateStr, sessions, settings.weight_unit, timeframe]);

  const strengthChartData = useMemo(() => {
    return [...exerciseHistory]
      .reverse()
      .map((e) => ({
        date: e.workoutDate.slice(5),
        weight: toDisplayWeight(e.maxWeightKg, settings.weight_unit),
      }));
  }, [exerciseHistory, settings.weight_unit]);

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const val = parseFloat(newWeight);
    if (!Number.isFinite(val) || val <= 0) return;

    setSavingWeight(true);
    try {
      const kg = toCanonicalWeightKg(val, settings.weight_unit);
      const created = await addWeightLog(user.id, kg, weightDate, weightNotes);
      setWeightLogs((prev) =>
        [...prev, created].sort((a, b) => a.logged_date.localeCompare(b.logged_date))
      );
      await refreshAccount();
      setNewWeight('');
      setWeightNotes('');
      setWeightModal(false);
      showToast('Body weight saved to cloud.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingWeight(false);
    }
  };

  const handleSaveMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingMeas(true);
    try {
      const created = await addBodyMeasurement(user.id, {
        logged_date: mDate,
        chest_cm: mChest ? Number(mChest) : null,
        waist_cm: mWaist ? Number(mWaist) : null,
        arms_cm: mArms ? Number(mArms) : null,
        thighs_cm: mThighs ? Number(mThighs) : null,
        shoulders_cm: mShoulders ? Number(mShoulders) : null,
        notes: '',
      });
      setMeasurements((prev) => [created, ...prev]);
      setMeasModal(false);
      setMChest('');
      setMWaist('');
      setMArms('');
      setMThighs('');
      setMShoulders('');
      showToast('Body measurements saved to cloud.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingMeas(false);
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !photoFile) return;
    setUploadingPhoto(true);
    try {
      const weightKg = photoWeight
        ? toCanonicalWeightKg(parseFloat(photoWeight), settings.weight_unit)
        : profile?.current_weight_kg ?? null;

      const uploaded = await uploadProgressPhoto(user.id, photoFile, {
        pose_tag: photoPose,
        weight_kg: weightKg,
        taken_date: photoDate,
        notes: photoNotes,
      });
      setPhotos((prev) => [uploaded, ...prev]);
      setAfterPhotoId(uploaded.id);
      if (!beforePhotoId) setBeforePhotoId(uploaded.id);
      setPhotoFile(null);
      setPhotoNotes('');
      setPhotoModal(false);
      showToast('Progress photo uploaded to private cloud storage.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const beforePhoto = photos.find((p) => p.id === beforePhotoId) ?? null;
  const afterPhoto = photos.find((p) => p.id === afterPhotoId) ?? null;

  return (
    <AppShell
      title="Progress"
      headerAction={
        <PrimaryButton onClick={() => setWeightModal(true)}>
          <Plus className="w-4 h-4" />
          Log Weight
        </PrimaryButton>
      }
    >
      <div className="space-y-5">
        {/* Sub-navigation */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#111318] border border-white/[0.08] overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Charts & Reports' },
              { id: 'muscles', label: 'Muscle Analytics' },
              { id: 'measurements', label: 'Measurements' },
              { id: 'photos', label: 'Progress Photos' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[40px] flex-1 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
              }`}
              style={
                tab === t.id
                  ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                  : undefined
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} onRetry={loadAll} />}

        {loading ? (
          <LoadingBlock label="Loading body & strength analytics..." />
        ) : tab === 'muscles' ? (
          <WeeklyMuscleAnalyticsPanel sessions={sessions} />
        ) : tab === 'overview' ? (
          <div className="space-y-5">
            <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  Anatomical Muscle Volume &amp; Recovery Map
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Inspect weekly working sets, volume, frequency, and heuristic recovery across all
                  15 muscle groups.
                </p>
              </div>
              <SecondaryButton onClick={() => setTab('muscles')} className="shrink-0">
                Open Muscle Map
              </SecondaryButton>
            </Card>
            {/* Period Filter & Summary */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#111318] border border-white/[0.08]">
                {(['week', 'month', 'year'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold capitalize ${
                      timeframe === tf ? 'text-[#08090B]' : 'text-zinc-400 hover:text-white'
                    }`}
                    style={
                      timeframe === tf
                        ? { backgroundColor: 'var(--accent-primary)', color: 'var(--accent-fg)' }
                        : undefined
                    }
                  >
                    {tf}ly
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-400 font-mono-num">
                Target Weight: {formatWeight(profile?.target_weight_kg, settings.weight_unit)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <p className="text-xs text-zinc-400">Current Weight</p>
                <p className="font-mono-num text-2xl font-bold text-white mt-1">
                  {formatWeight(profile?.current_weight_kg, settings.weight_unit)}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-zinc-400">Workouts Completed</p>
                <p className="font-mono-num text-2xl font-bold text-white mt-1">
                  {periodReport.workouts}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-zinc-400">Training Volume</p>
                <p className="font-mono-num text-2xl font-bold text-white mt-1">
                  {formatWeight(periodReport.totalVolumeKg, settings.weight_unit)}
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Weight Progression Chart */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-white">
                    Weight Progression ({settings.weight_unit.toUpperCase()})
                  </h2>
                  <Scale className="w-4 h-4 text-zinc-500" />
                </div>
                {weightChartData.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-10 text-center">
                    Log weight entries to visualize your body weight trend.
                  </p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weightChartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="date" stroke="#71717A" fontSize={11} />
                        <YAxis stroke="#71717A" fontSize={11} domain={['auto', 'auto']} width={40} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111318',
                            borderColor: 'rgba(255,255,255,0.12)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="weight"
                          stroke="#C4F82A"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Workout Volume & Frequency Chart */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-white">
                    Training Volume ({settings.weight_unit.toUpperCase()})
                  </h2>
                  <TrendingUp className="w-4 h-4 text-zinc-500" />
                </div>
                {frequencyChartData.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-10 text-center">
                    Complete workouts in this period to view training volume.
                  </p>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={frequencyChartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="label" stroke="#71717A" fontSize={11} />
                        <YAxis stroke="#71717A" fontSize={11} width={45} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111318',
                            borderColor: 'rgba(255,255,255,0.12)',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="volume" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            {/* Exercise Strength Progression */}
            <Card className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-base font-bold text-white">
                  Exercise Strength Chart
                </h2>
                <select
                  value={selectedExercise}
                  onChange={(e) => setSelectedExercise(e.target.value)}
                  aria-label="Select exercise for strength chart"
                  className={`${INPUT_CLASS} sm:w-64`}
                >
                  {loggedExerciseNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              {strengthChartData.length === 0 ? (
                <p className="text-xs text-zinc-500 py-8 text-center">
                  No completed sets recorded yet for {selectedExercise}.
                </p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={strengthChartData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="date" stroke="#71717A" fontSize={11} />
                      <YAxis stroke="#71717A" fontSize={11} width={40} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#111318',
                          borderColor: 'rgba(255,255,255,0.12)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        name="Top Weight"
                        stroke="#C4F82A"
                        strokeWidth={2.5}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Recent Weight Logs */}
            {weightLogs.length > 0 && (
              <Card className="space-y-3">
                <h2 className="font-display text-base font-bold text-white">Weight History</h2>
                <div className="divide-y divide-white/[0.06]">
                  {[...weightLogs]
                    .reverse()
                    .slice(0, 10)
                    .map((w) => (
                      <div key={w.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-mono-num text-sm font-semibold text-white">
                            {formatWeight(Number(w.weight_kg), settings.weight_unit)}
                          </p>
                          <p className="text-xs text-zinc-400 font-mono-num">
                            {w.logged_date}
                            {w.notes ? ` · ${w.notes}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user) return;
                            await deleteWeightLog(user.id, w.id);
                            setWeightLogs((prev) => prev.filter((item) => item.id !== w.id));
                          }}
                          aria-label="Delete weight entry"
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </div>
        ) : tab === 'measurements' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                Track chest, waist, arms, thighs, and shoulders in centimetres.
              </p>
              <PrimaryButton onClick={() => setMeasModal(true)}>
                <Plus className="w-4 h-4" />
                Add Measurements
              </PrimaryButton>
            </div>

            {measurements.length === 0 ? (
              <EmptyState
                icon={<Ruler className="w-5 h-5" />}
                title="No body measurements yet"
                description="Record tape measurements regularly to track recomposition beyond scale weight."
                action={<SecondaryButton onClick={() => setMeasModal(true)}>Log First Entry</SecondaryButton>}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {measurements.map((m) => (
                  <Card key={m.id} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-num text-xs font-semibold text-zinc-300">
                        {m.logged_date}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
                          await deleteBodyMeasurement(user.id, m.id);
                          setMeasurements((prev) => prev.filter((item) => item.id !== m.id));
                        }}
                        aria-label="Delete measurement"
                        className="text-zinc-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono-num">
                      <div>
                        <p className="text-zinc-500">Chest</p>
                        <p className="text-white font-semibold">{m.chest_cm ? `${m.chest_cm} cm` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Waist</p>
                        <p className="text-white font-semibold">{m.waist_cm ? `${m.waist_cm} cm` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Arms</p>
                        <p className="text-white font-semibold">{m.arms_cm ? `${m.arms_cm} cm` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Thighs</p>
                        <p className="text-white font-semibold">{m.thighs_cm ? `${m.thighs_cm} cm` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Shoulders</p>
                        <p className="text-white font-semibold">
                          {m.shoulders_cm ? `${m.shoulders_cm} cm` : '—'}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400">
                Stored in private Supabase Storage with authenticated signed URLs only.
              </p>
              <PrimaryButton onClick={() => setPhotoModal(true)}>
                <Camera className="w-4 h-4" />
                Upload Photo
              </PrimaryButton>
            </div>

            {photos.length === 0 ? (
              <EmptyState
                icon={<Camera className="w-5 h-5" />}
                title="No progress photos uploaded"
                description="Upload front, side, or back check-in photos privately to compare your physique over time."
                action={<SecondaryButton onClick={() => setPhotoModal(true)}>Upload Check-in</SecondaryButton>}
              />
            ) : (
              <>
                {/* Before / After Comparison */}
                <Card className="space-y-4">
                  <h2 className="font-display text-base font-bold text-white">
                    Before / After Comparison
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <select
                        value={beforePhotoId}
                        onChange={(e) => setBeforePhotoId(e.target.value)}
                        aria-label="Select before photo"
                        className={INPUT_CLASS}
                      >
                        {photos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.taken_date} ({p.pose_tag})
                          </option>
                        ))}
                      </select>
                      {beforePhoto?.signedUrl && (
                        <div className="rounded-xl overflow-hidden border border-white/10 aspect-[3/4] bg-[#0D0F13]">
                          <img
                            src={beforePhoto.signedUrl}
                            alt={`Before progress ${beforePhoto.taken_date}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <select
                        value={afterPhotoId}
                        onChange={(e) => setAfterPhotoId(e.target.value)}
                        aria-label="Select after photo"
                        className={INPUT_CLASS}
                      >
                        {photos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.taken_date} ({p.pose_tag})
                          </option>
                        ))}
                      </select>
                      {afterPhoto?.signedUrl && (
                        <div className="rounded-xl overflow-hidden border border-white/10 aspect-[3/4] bg-[#0D0F13]">
                          <img
                            src={afterPhoto.signedUrl}
                            alt={`After progress ${afterPhoto.taken_date}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Gallery */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {photos.map((p) => (
                    <Card key={p.id} className="p-2.5 space-y-2">
                      <div className="rounded-xl overflow-hidden aspect-[3/4] bg-[#0D0F13]">
                        {p.signedUrl ? (
                          <img
                            src={p.signedUrl}
                            alt={`Progress check-in ${p.taken_date}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Camera className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="min-w-0">
                          <p className="font-mono-num text-xs font-semibold text-white">
                            {p.taken_date}
                          </p>
                          <p className="text-[11px] text-zinc-400 capitalize">
                            {p.pose_tag}
                            {p.weight_kg
                              ? ` · ${formatWeight(p.weight_kg, settings.weight_unit)}`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user) return;
                            await deleteProgressPhoto(user.id, p);
                            setPhotos((prev) => prev.filter((item) => item.id !== p.id));
                          }}
                          aria-label="Delete progress photo"
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Log Weight Modal */}
      <ModalSheet open={weightModal} onClose={() => setWeightModal(false)} title="Log Body Weight">
        <form onSubmit={handleSaveWeight} className="space-y-4">
          <FormField label={`Weight (${settings.weight_unit.toUpperCase()})`}>
            <input
              type="number"
              step="0.1"
              required
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder="e.g. 72.5"
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Date">
            <input
              type="date"
              required
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Notes (Optional)">
            <input
              type="text"
              value={weightNotes}
              onChange={(e) => setWeightNotes(e.target.value)}
              placeholder="Morning fasted weigh-in"
              className={INPUT_CLASS}
            />
          </FormField>
          <PrimaryButton type="submit" loading={savingWeight} className="w-full">
            Save Weight to Cloud
          </PrimaryButton>
        </form>
      </ModalSheet>

      {/* Log Body Measurements Modal */}
      <ModalSheet open={measModal} onClose={() => setMeasModal(false)} title="Log Body Measurements (cm)">
        <form onSubmit={handleSaveMeasurement} className="space-y-4">
          <FormField label="Date">
            <input
              type="date"
              required
              value={mDate}
              onChange={(e) => setMDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Chest (cm)">
              <input
                type="number"
                step="0.1"
                value={mChest}
                onChange={(e) => setMChest(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Waist (cm)">
              <input
                type="number"
                step="0.1"
                value={mWaist}
                onChange={(e) => setMWaist(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Arms (cm)">
              <input
                type="number"
                step="0.1"
                value={mArms}
                onChange={(e) => setMArms(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Thighs (cm)">
              <input
                type="number"
                step="0.1"
                value={mThighs}
                onChange={(e) => setMThighs(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Shoulders (cm)">
              <input
                type="number"
                step="0.1"
                value={mShoulders}
                onChange={(e) => setMShoulders(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>
          <PrimaryButton type="submit" loading={savingMeas} className="w-full">
            Save Measurements
          </PrimaryButton>
        </form>
      </ModalSheet>

      {/* Upload Photo Modal */}
      <ModalSheet open={photoModal} onClose={() => setPhotoModal(false)} title="Upload Private Progress Photo">
        <form onSubmit={handleUploadPhoto} className="space-y-4">
          <FormField label="Select Image">
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pose">
              <select
                value={photoPose}
                onChange={(e) => setPhotoPose(e.target.value as 'front' | 'side' | 'back')}
                className={INPUT_CLASS}
              >
                <option value="front">Front</option>
                <option value="side">Side</option>
                <option value="back">Back</option>
              </select>
            </FormField>
            <FormField label="Date">
              <input
                type="date"
                required
                value={photoDate}
                onChange={(e) => setPhotoDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>
          <FormField label={`Weight (${settings.weight_unit.toUpperCase()})`}>
            <input
              type="number"
              step="0.1"
              value={photoWeight}
              onChange={(e) => setPhotoWeight(e.target.value)}
              placeholder="Optional"
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Notes">
            <input
              type="text"
              value={photoNotes}
              onChange={(e) => setPhotoNotes(e.target.value)}
              placeholder="Lighting / phase notes"
              className={INPUT_CLASS}
            />
          </FormField>
          <PrimaryButton type="submit" loading={uploadingPhoto} className="w-full">
            Upload Privately
          </PrimaryButton>
        </form>
      </ModalSheet>
    </AppShell>
  );
}
