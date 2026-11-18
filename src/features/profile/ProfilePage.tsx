import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Database,
  KeyRound,
  LogOut,
  Palette,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import {
  Card,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { ACCENT_PRESETS, THEME_PRESETS, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSupabaseClient } from '../../lib/supabase';
import {
  createUserReminder,
  deleteUserReminder,
  fetchUserReminders,
  updateUserReminder,
  updateUserSettings,
  upsertUserProfile,
} from '../../services/profileService';
import { CloudConfigModal } from '../auth/CloudConfigModal';
import type {
  AIProviderPref,
  AITone,
  ActivityLevel,
  DietaryPreference,
  FitnessGoal,
  HeightUnit,
  ThemePreset,
  UserReminder,
  WeightUnit,
} from '../../types/database';

export function ProfilePage() {
  const {
    user,
    profile,
    settings,
    applyThemeLocally,
    refreshAccount,
    signOut,
  } = useAuth();
  const { showToast } = useToast();

  // Profile form fields
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [heightCm, setHeightCm] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [currentWeight, setCurrentWeight] = useState(
    profile?.current_weight_kg ? String(profile.current_weight_kg) : ''
  );
  const [targetWeight, setTargetWeight] = useState(
    profile?.target_weight_kg ? String(profile.target_weight_kg) : ''
  );
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>(
    profile?.fitness_goal ?? 'muscle_gain'
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    profile?.activity_level ?? 'moderate'
  );
  const [dietPref, setDietPref] = useState<DietaryPreference>(
    profile?.dietary_preference ?? 'omnivore'
  );
  const [workoutPref, setWorkoutPref] = useState(profile?.workout_preference ?? 'hypertrophy');

  // Settings fields
  const [themeName, setThemeName] = useState<ThemePreset>(settings.theme_name);
  const [accentColor, setAccentColor] = useState<string>(settings.accent_color);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(settings.weight_unit);
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(settings.height_unit);
  const [defaultRest, setDefaultRest] = useState<string>(String(settings.default_rest_seconds));
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    settings.notifications_enabled
  );
  const [aiTone, setAiTone] = useState<AITone>(settings.ai_tone);
  const [aiIncludeContext, setAiIncludeContext] = useState<boolean>(settings.ai_include_context);
  const [aiProvider, setAiProvider] = useState<AIProviderPref>(settings.ai_preferred_provider);

  const [reminders, setReminders] = useState<UserReminder[]>([]);
  const [remTitle, setRemTitle] = useState('');
  const [remType, setRemType] = useState<UserReminder['reminder_type']>('workout');
  const [remTime, setRemTime] = useState('07:30');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAge(profile.age ? String(profile.age) : '');
      setHeightCm(profile.height_cm ? String(profile.height_cm) : '');
      setCurrentWeight(profile.current_weight_kg ? String(profile.current_weight_kg) : '');
      setTargetWeight(profile.target_weight_kg ? String(profile.target_weight_kg) : '');
      setFitnessGoal(profile.fitness_goal);
      setActivityLevel(profile.activity_level);
      setDietPref(profile.dietary_preference);
      setWorkoutPref(profile.workout_preference || 'hypertrophy');
    }
  }, [profile]);

  useEffect(() => {
    setThemeName(settings.theme_name);
    setAccentColor(settings.accent_color);
    setWeightUnit(settings.weight_unit);
    setHeightUnit(settings.height_unit);
    setDefaultRest(String(settings.default_rest_seconds));
    setNotificationsEnabled(settings.notifications_enabled);
    setAiTone(settings.ai_tone);
    setAiIncludeContext(settings.ai_include_context);
    setAiProvider(settings.ai_preferred_provider);
  }, [settings]);

  const loadReminders = useCallback(async () => {
    if (!user) return;
    try {
      const list = await fetchUserReminders(user.id);
      setReminders(list);
    } catch {
      // Ignore if table not loaded yet
    }
  }, [user]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setError('');
    try {
      await upsertUserProfile(user.id, {
        email: user.email || '',
        full_name: fullName.trim(),
        age: age ? Number(age) : null,
        height_cm: heightCm ? Number(heightCm) : null,
        current_weight_kg: currentWeight ? Number(currentWeight) : null,
        target_weight_kg: targetWeight ? Number(targetWeight) : null,
        fitness_goal: fitnessGoal,
        activity_level: activityLevel,
        dietary_preference: dietPref,
        workout_preference: workoutPref.trim() || 'hypertrophy',
      });
      await refreshAccount();
      showToast('Profile saved to cloud.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingSettings(true);
    setError('');
    try {
      await updateUserSettings(user.id, {
        theme_name: themeName,
        accent_color: accentColor,
        weight_unit: weightUnit,
        height_unit: heightUnit,
        default_rest_seconds: Math.min(600, Math.max(15, Number(defaultRest) || 90)),
        notifications_enabled: notificationsEnabled,
        ai_tone: aiTone,
        ai_include_context: aiIncludeContext,
        ai_preferred_provider: aiProvider,
      });
      applyThemeLocally(themeName, accentColor);
      await refreshAccount();
      showToast('Preferences & theme saved to cloud.', 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !remTitle.trim()) return;
    try {
      const created = await createUserReminder(user.id, {
        title: remTitle.trim(),
        reminder_type: remType,
        schedule_time: remTime,
        days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        is_enabled: true,
      });
      setReminders((prev) => [...prev, created]);
      setRemTitle('');
      showToast('Reminder schedule saved.', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  const handleSendPasswordReset = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.email) return;
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetErr) {
      showToast(resetErr.message, 'error');
    } else {
      showToast(`Password reset email sent to ${user.email}.`, 'success');
    }
  };

  const handleDeleteProfileData = async () => {
    if (!user) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      // Deleting the user's profile cascades or cleans up user-owned records; full auth.users deletion requires an admin edge function
      const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id);
      if (delErr) throw new Error(delErr.message);
      await signOut();
      showToast('Profile data deleted and signed out.', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  return (
    <AppShell
      title="Profile & Settings"
      headerAction={
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-[40px] px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Profile Details */}
          <Card className="lg:col-span-6">
            <h1 className="font-display text-lg font-bold text-white mb-4">Athlete Profile</h1>
            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <FormField label="Email (Account)">
                <input type="email" disabled value={user?.email ?? ''} className={`${INPUT_CLASS} opacity-60`} />
              </FormField>

              <FormField label="Full Name">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </FormField>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <FormField label="Age">
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Height (cm)">
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Weight (kg)">
                  <input
                    type="number"
                    step="0.1"
                    value={currentWeight}
                    onChange={(e) => setCurrentWeight(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Target (kg)">
                  <input
                    type="number"
                    step="0.1"
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Fitness Goal">
                  <select
                    value={fitnessGoal}
                    onChange={(e) => setFitnessGoal(e.target.value as FitnessGoal)}
                    className={INPUT_CLASS}
                  >
                    <option value="muscle_gain">Muscle Gain</option>
                    <option value="fat_loss">Fat Loss</option>
                    <option value="strength">Strength</option>
                    <option value="recomposition">Recomposition</option>
                    <option value="endurance">Endurance</option>
                  </select>
                </FormField>
                <FormField label="Activity Level">
                  <select
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
                    className={INPUT_CLASS}
                  >
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                    <option value="athlete">Athlete</option>
                  </select>
                </FormField>
                <FormField label="Dietary Preference">
                  <select
                    value={dietPref}
                    onChange={(e) => setDietPref(e.target.value as DietaryPreference)}
                    className={INPUT_CLASS}
                  >
                    <option value="omnivore">Omnivore</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="eggetarian">Eggetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="pescatarian">Pescatarian</option>
                  </select>
                </FormField>
                <FormField label="Workout Preference">
                  <input
                    type="text"
                    value={workoutPref}
                    onChange={(e) => setWorkoutPref(e.target.value)}
                    placeholder="Hypertrophy / Powerlifting"
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>

              <PrimaryButton type="submit" loading={savingProfile} className="w-full">
                <Save className="w-4 h-4" />
                Save Profile to Cloud
              </PrimaryButton>
            </form>
          </Card>

          {/* Theme, Units & AI Customisation */}
          <Card className="lg:col-span-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h2 className="font-display text-lg font-bold text-white">
                Appearance, Units & AI Coach
              </h2>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="space-y-2">
                <span className="block text-xs font-medium text-zinc-300">Dark Theme Surface</span>
                <div className="grid grid-cols-3 gap-2">
                  {THEME_PRESETS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setThemeName(t.id);
                        applyThemeLocally(t.id, accentColor);
                      }}
                      className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold transition-colors ${
                        themeName === t.id
                          ? 'border-[var(--accent-primary)] text-white'
                          : 'border-white/10 text-zinc-400'
                      }`}
                      style={{ backgroundColor: t.bg }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-zinc-300">Accent Color</span>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((a) => (
                    <button
                      key={a.hex}
                      type="button"
                      onClick={() => {
                        setAccentColor(a.hex);
                        applyThemeLocally(themeName, a.hex);
                      }}
                      className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 ${
                        accentColor.toLowerCase() === a.hex.toLowerCase()
                          ? 'border-white text-white bg-white/[0.06]'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: a.hex }}
                      />
                      <span>{a.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField label="Weight Unit">
                  <select
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value as WeightUnit)}
                    className={INPUT_CLASS}
                  >
                    <option value="kg">KG</option>
                    <option value="lb">LB</option>
                  </select>
                </FormField>
                <FormField label="Height Unit">
                  <select
                    value={heightUnit}
                    onChange={(e) => setHeightUnit(e.target.value as HeightUnit)}
                    className={INPUT_CLASS}
                  >
                    <option value="cm">CM</option>
                    <option value="ft">FT / IN</option>
                  </select>
                </FormField>
                <FormField label="Rest (sec)">
                  <input
                    type="number"
                    min={15}
                    max={600}
                    value={defaultRest}
                    onChange={(e) => setDefaultRest(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="AI Coach Tone">
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value as AITone)}
                    className={INPUT_CLASS}
                  >
                    <option value="direct">Direct</option>
                    <option value="encouraging">Encouraging</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </FormField>
                <FormField label="AI Provider Routing">
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value as AIProviderPref)}
                    className={INPUT_CLASS}
                  >
                    <option value="auto">Auto (Groq → OpenRouter)</option>
                    <option value="groq">Groq Only</option>
                    <option value="openrouter">OpenRouter Only</option>
                  </select>
                </FormField>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiIncludeContext}
                  onChange={(e) => setAiIncludeContext(e.target.checked)}
                  className="accent-[#C4F82A]"
                />
                <span>Allow AI Coach to access logged fitness metrics by default</span>
              </label>

              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(e) => setNotificationsEnabled(e.target.checked)}
                  className="accent-[#C4F82A]"
                />
                <span>Enable workout & hydration reminder schedules</span>
              </label>

              <PrimaryButton type="submit" loading={savingSettings} className="w-full">
                Save Preferences to Cloud
              </PrimaryButton>
            </form>
          </Card>

          {/* Reminders & Schedules */}
          <Card className="lg:col-span-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              <h2 className="font-display text-lg font-bold text-white">Reminder Schedules</h2>
            </div>

            <form onSubmit={handleAddReminder} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                required
                value={remTitle}
                onChange={(e) => setRemTitle(e.target.value)}
                placeholder="e.g. Evening Gym Session"
                className={`${INPUT_CLASS} sm:col-span-5`}
              />
              <select
                value={remType}
                onChange={(e) => setRemType(e.target.value as UserReminder['reminder_type'])}
                className={`${INPUT_CLASS} sm:col-span-3`}
              >
                <option value="workout">Workout</option>
                <option value="hydration">Water</option>
                <option value="meal">Meal</option>
                <option value="weigh_in">Weigh-in</option>
              </select>
              <input
                type="time"
                value={remTime}
                onChange={(e) => setRemTime(e.target.value)}
                className={`${INPUT_CLASS} sm:col-span-2`}
              />
              <PrimaryButton type="submit" className="sm:col-span-2 px-3">
                <Plus className="w-4 h-4" />
              </PrimaryButton>
            </form>

            <div className="divide-y divide-white/[0.06]">
              {reminders.length === 0 ? (
                <p className="text-xs text-zinc-500 py-2">No reminders configured yet.</p>
              ) : (
                reminders.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{r.title}</p>
                      <p className="text-xs text-zinc-400 font-mono-num capitalize">
                        {r.reminder_type.replace('_', ' ')} · {r.schedule_time}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
                          const updated = await updateUserReminder(user.id, r.id, {
                            is_enabled: !r.is_enabled,
                          });
                          setReminders((prev) =>
                            prev.map((item) => (item.id === r.id ? updated : item))
                          );
                        }}
                        className="min-h-[34px] px-2.5 rounded-lg border border-white/10 text-xs font-semibold"
                        style={{
                          color: r.is_enabled ? 'var(--accent-primary)' : '#71717A',
                        }}
                      >
                        {r.is_enabled ? 'On' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
                          await deleteUserReminder(user.id, r.id);
                          setReminders((prev) => prev.filter((item) => item.id !== r.id));
                        }}
                        aria-label="Delete reminder"
                        className="text-zinc-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Account Security & Cloud */}
          <Card className="lg:col-span-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">Account Management</h2>
            <div className="space-y-2.5">
              <SecondaryButton onClick={handleSendPasswordReset} className="w-full justify-start">
                <KeyRound className="w-4 h-4" />
                Send Password Reset Email
              </SecondaryButton>
              {import.meta.env.DEV && (
                <SecondaryButton
                  onClick={() => setCloudModalOpen(true)}
                  className="w-full justify-start"
                >
                  <Database className="w-4 h-4" />
                  Developer: Supabase Override
                </SecondaryButton>
              )}
              <SecondaryButton onClick={() => void signOut()} className="w-full justify-start">
                <LogOut className="w-4 h-4" />
                Sign Out of This Device
              </SecondaryButton>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="w-full min-h-[44px] px-4 rounded-xl border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 text-sm font-medium flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Profile & Clear Local Session</span>
              </button>
            </div>
          </Card>
        </div>
      </div>

      {import.meta.env.DEV && (
        <CloudConfigModal open={cloudModalOpen} onClose={() => setCloudModalOpen(false)} />
      )}

      <ModalSheet
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Account Data Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            This will permanently remove your athlete profile record and sign you out. Note: full
            deletion of the underlying <code className="text-zinc-200">auth.users</code> login row
            requires a Supabase Admin / Edge Function endpoint.
          </p>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setDeleteModalOpen(false)} className="flex-1">
              Cancel
            </SecondaryButton>
            <button
              type="button"
              onClick={handleDeleteProfileData}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"
            >
              Delete & Sign Out
            </button>
          </div>
        </div>
      </ModalSheet>
    </AppShell>
  );
}
