import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Eye, EyeOff, MailCheck } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { upsertUserProfile, updateUserSettings } from '../../services/profileService';
import {
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  PrimaryButton,
  SecondaryButton,
} from '../../components/ui/Primitives';
import { CloudConfigModal } from './CloudConfigModal';
import type { ActivityLevel, DietaryPreference, FitnessGoal, WeightUnit, HeightUnit } from '../../types/database';

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div
      className="min-h-dvh w-full flex flex-col safe-top-pad safe-bottom-pad"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      <header className="w-full max-w-md mx-auto px-5 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/welcome')}
          className="min-h-[44px] px-2 -ml-2 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={() => setConfigOpen(true)}
          className="min-h-[44px] px-3 rounded-xl border border-white/10 text-xs text-zinc-300 hover:text-white inline-flex items-center gap-1.5"
        >
          <Database className="w-3.5 h-3.5" style={{ color: isConfigured ? 'var(--accent-primary)' : '#F59E0B' }} />
          <span>{isConfigured ? 'Cloud Ready' : 'Configure Cloud'}</span>
        </button>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 py-4 flex flex-col justify-center">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>
        </div>

        {!isConfigured && (
          <div className="mb-5">
            <ErrorBanner
              message="Supabase is not connected yet. Connect your Supabase project URL and Anon Key before signing in."
              onRetry={() => setConfigOpen(true)}
            />
          </div>
        )}

        {children}
      </main>

      <CloudConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

export function LoginScreen() {
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnverifiedEmail('');

    const supabase = getSupabaseClient();
    if (!supabase || !isConfigured) {
      setError('Cannot sign in: Supabase backend credentials are not configured.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authErr) {
        if (authErr.message.toLowerCase().includes('email not confirmed')) {
          setUnverifiedEmail(email.trim());
        }
        throw new Error(authErr.message);
      }
      if (!data.session) {
        throw new Error('Authentication did not return an active session.');
      }
      showToast('Signed in to your GYM PAGLU account.', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !unverifiedEmail) return;
    const { error: resendErr } = await supabase.auth.resend({
      type: 'signup',
      email: unverifiedEmail,
    });
    if (resendErr) {
      setError(resendErr.message);
    } else {
      showToast('Verification email resent. Check your inbox.', 'success');
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to sync your workouts, nutrition, and progress.">
      <form onSubmit={handleLogin} className="space-y-4">
        <FormField label="Email address">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="athlete@example.com"
            className={INPUT_CLASS}
          />
        </FormField>

        <FormField label="Password">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={`${INPUT_CLASS} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </FormField>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs font-medium hover:underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            Forgot password?
          </Link>
        </div>

        {error && <ErrorBanner message={error} />}

        {unverifiedEmail && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-amber-200">Email verification pending.</span>
            <button
              type="button"
              onClick={handleResendVerification}
              className="text-xs font-semibold text-amber-300 underline shrink-0"
            >
              Resend Email
            </button>
          </div>
        )}

        <PrimaryButton type="submit" loading={loading} className="w-full">
          Sign In
        </PrimaryButton>

        <p className="text-center text-sm text-zinc-400 pt-2">
          New to GYM PAGLU?{' '}
          <Link to="/signup" className="font-semibold hover:underline" style={{ color: 'var(--accent-primary)' }}>
            Create account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function SignupScreen() {
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase || !isConfigured) {
      setError('Cannot register: Supabase backend credentials are not configured.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (signUpErr) throw new Error(signUpErr.message);

      if (data.session) {
        showToast('Account created and signed in.', 'success');
        navigate('/onboarding', { replace: true });
      } else {
        setVerificationSent(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="We sent a confirmation link to activate your GYM PAGLU account."
      >
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
            <MailCheck className="w-6 h-6" />
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Check <span className="font-semibold text-white">{email}</span> and click the
            verification link. Once verified, sign in to start logging workouts and nutrition.
          </p>
          <PrimaryButton onClick={() => navigate('/login')} className="w-full">
            Go to Sign In
          </PrimaryButton>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Your workouts and diet data stay securely yours.">
      <form onSubmit={handleSignup} className="space-y-4">
        <FormField label="Full Name">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Aarav Sharma"
            className={INPUT_CLASS}
          />
        </FormField>

        <FormField label="Email address">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="athlete@example.com"
            className={INPUT_CLASS}
          />
        </FormField>

        <FormField label="Password" hint="Minimum 8 characters">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            className={INPUT_CLASS}
          />
        </FormField>

        <FormField label="Confirm Password">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            className={INPUT_CLASS}
          />
        </FormField>

        {error && <ErrorBanner message={error} />}

        <PrimaryButton type="submit" loading={loading} className="w-full">
          Create Account
        </PrimaryButton>

        <p className="text-center text-sm text-zinc-400 pt-2">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent-primary)' }}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordScreen() {
  const { isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const supabase = getSupabaseClient();
    if (!supabase || !isConfigured) {
      setError('Supabase backend is not configured.');
      return;
    }

    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetErr) throw new Error(resetErr.message);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="Receive a password recovery link in your email.">
      {sent ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <p className="text-sm text-zinc-200 leading-relaxed">
            If an account exists for <span className="font-semibold text-white">{email}</span>, a
            password reset link has been sent. Open the link to choose a new password.
          </p>
          <Link to="/login" className="block">
            <SecondaryButton className="w-full">Return to Sign In</SecondaryButton>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Account Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@example.com"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && <ErrorBanner message={error} />}

          <PrimaryButton type="submit" loading={loading} className="w-full">
            Send Reset Link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase backend is not configured.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error(updateErr.message);
      showToast('Password updated successfully.', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Set new password" subtitle="Choose a strong new password for your account.">
      <form onSubmit={handleUpdate} className="space-y-4">
        <FormField label="New Password">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </FormField>
        <FormField label="Confirm New Password">
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT_CLASS}
          />
        </FormField>
        {error && <ErrorBanner message={error} />}
        <PrimaryButton type="submit" loading={loading} className="w-full">
          Update Password
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { user, profile, refreshAccount } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '24');
  const [heightCm, setHeightCm] = useState(profile?.height_cm ? String(profile.height_cm) : '175');
  const [currentWeight, setCurrentWeight] = useState(
    profile?.current_weight_kg ? String(profile.current_weight_kg) : '72'
  );
  const [targetWeight, setTargetWeight] = useState(
    profile?.target_weight_kg ? String(profile.target_weight_kg) : '76'
  );
  const [goal, setGoal] = useState<FitnessGoal>(profile?.fitness_goal ?? 'muscle_gain');
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity_level ?? 'moderate');
  const [diet, setDiet] = useState<DietaryPreference>(profile?.dietary_preference ?? 'omnivore');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      await Promise.all([
        upsertUserProfile(user.id, {
          email: user.email || '',
          full_name: fullName.trim(),
          age: Number(age) || null,
          height_cm: Number(heightCm) || null,
          current_weight_kg: Number(currentWeight) || null,
          target_weight_kg: Number(targetWeight) || null,
          fitness_goal: goal,
          activity_level: activity,
          dietary_preference: diet,
          onboarding_completed: true,
        }),
        updateUserSettings(user.id, {
          weight_unit: weightUnit,
          height_unit: heightUnit,
        }),
      ]);
      await refreshAccount();
      showToast('Profile saved to cloud.', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Personalise your setup"
      subtitle="Configure your baseline metrics and training preferences."
    >
      <form onSubmit={handleSave} className="space-y-4">
        <FormField label="Full Name">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={INPUT_CLASS}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Age">
            <input
              type="number"
              min={13}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Height (cm)">
            <input
              type="number"
              min={100}
              max={250}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Current Weight (kg)">
            <input
              type="number"
              step="0.1"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
          <FormField label="Target Weight (kg)">
            <input
              type="number"
              step="0.1"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className={INPUT_CLASS}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
        </div>

        <FormField label="Primary Fitness Goal">
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as FitnessGoal)}
            className={INPUT_CLASS}
          >
            <option value="muscle_gain">Muscle Gain</option>
            <option value="fat_loss">Fat Loss</option>
            <option value="strength">Strength Development</option>
            <option value="recomposition">Body Recomposition</option>
            <option value="endurance">Endurance & Conditioning</option>
          </select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Activity Level">
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value as ActivityLevel)}
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
              value={diet}
              onChange={(e) => setDiet(e.target.value as DietaryPreference)}
              className={INPUT_CLASS}
            >
              <option value="omnivore">Omnivore</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="vegan">Vegan</option>
              <option value="pescatarian">Pescatarian</option>
            </select>
          </FormField>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="submit" loading={loading} className="flex-1">
            Save & Enter Dashboard
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate('/home', { replace: true })}>
            Skip
          </SecondaryButton>
        </div>
      </form>
    </AuthShell>
  );
}
