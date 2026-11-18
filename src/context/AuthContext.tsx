import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSchemaMissingError, isSupabaseConfigured } from '../lib/supabase';
import { initializeAndroidShell, updateStatusBarColor } from '../lib/capacitor';
import {
  DEFAULT_WIDGETS,
  ensureUserAccountRecords,
  fetchNutritionGoals,
  fetchUserProfile,
  fetchUserSettings,
  fetchUserWidgets,
} from '../services/profileService';
import { countPublicExercises } from '../services/workoutService';
import type {
  NutritionGoals,
  Profile,
  ThemePreset,
  UserSettings,
  UserWidget,
} from '../types/database';

export const ACCENT_PRESETS = [
  { name: 'Neon Lime', hex: '#C4F82A', hover: '#D4FF4D', fg: '#08090B' },
  { name: 'Volt Cyan', hex: '#22D3EE', hover: '#67E8F9', fg: '#08090B' },
  { name: 'Solar Amber', hex: '#F59E0B', hover: '#FBBF24', fg: '#08090B' },
  { name: 'Crimson Pulse', hex: '#F43F5E', hover: '#FB7185', fg: '#FFFFFF' },
  { name: 'Emerald', hex: '#10B981', hover: '#34D399', fg: '#08090B' },
] as const;

export const THEME_PRESETS: Array<{ id: ThemePreset; label: string; bg: string }> = [
  { id: 'obsidian', label: 'Obsidian', bg: '#08090B' },
  { id: 'carbon', label: 'Carbon', bg: '#0B0D10' },
  { id: 'midnight', label: 'Midnight Slate', bg: '#060913' },
];

interface AuthContextValue {
  isConfigured: boolean;
  isLoading: boolean;
  schemaMissing: boolean;
  schemaError: string | null;
  exerciseCatalogCount: number | null;
  exerciseCatalogNeedsSeed: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings;
  nutritionGoals: NutritionGoals;
  widgets: UserWidget[];
  refreshAccount: () => Promise<void>;
  refreshConfigStatus: () => void;
  applyThemeLocally: (themeName: ThemePreset, accentColor: string) => void;
  setProfileState: React.Dispatch<React.SetStateAction<Profile | null>>;
  setSettingsState: React.Dispatch<React.SetStateAction<UserSettings>>;
  setNutritionGoalsState: React.Dispatch<React.SetStateAction<NutritionGoals>>;
  setWidgetsState: React.Dispatch<React.SetStateAction<UserWidget[]>>;
  signOut: () => Promise<void>;
}

const DEFAULT_SETTINGS: UserSettings = {
  id: '',
  user_id: '',
  theme_name: 'obsidian',
  accent_color: '#C4F82A',
  weight_unit: 'kg',
  height_unit: 'cm',
  notifications_enabled: true,
  default_rest_seconds: 90,
  ai_tone: 'direct',
  ai_include_context: true,
  ai_preferred_provider: 'auto',
  created_at: '',
  updated_at: '',
};

const DEFAULT_GOALS: NutritionGoals = {
  id: '',
  user_id: '',
  calories_target: 2400,
  protein_target_g: 160,
  carbs_target_g: 260,
  fat_target_g: 70,
  fibre_target_g: 32,
  water_target_ml: 3500,
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(196, 248, 42, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [configured, setConfigured] = useState<boolean>(() => isSupabaseConfigured());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [schemaMissing, setSchemaMissing] = useState<boolean>(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [exerciseCatalogCount, setExerciseCatalogCount] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [widgets, setWidgets] = useState<UserWidget[]>([]);

  const applyThemeLocally = useCallback((themeName: ThemePreset, accentColor: string) => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', themeName);
    const preset = ACCENT_PRESETS.find((a) => a.hex.toLowerCase() === accentColor.toLowerCase());
    const root = document.documentElement.style;
    root.setProperty('--accent-primary', accentColor);
    root.setProperty('--accent-primary-hover', preset?.hover ?? accentColor);
    root.setProperty('--accent-fg', preset?.fg ?? '#08090B');
    root.setProperty('--accent-soft', hexToRgba(accentColor, 0.14));

    const themeBg = THEME_PRESETS.find((t) => t.id === themeName)?.bg ?? '#08090B';
    void updateStatusBarColor(themeBg);
  }, []);

  const loadAccountData = useCallback(
    async (authUser: User) => {
      const results = await Promise.allSettled([
        fetchUserProfile(authUser.id),
        fetchUserSettings(authUser.id),
        fetchNutritionGoals(authUser.id),
        fetchUserWidgets(authUser.id),
      ]);

      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );

      if (rejected.length > 0) {
        const missingErr = rejected.find((r) => isSchemaMissingError(r.reason));
        if (missingErr) {
          setSchemaMissing(true);
          setSchemaError((missingErr.reason as Error)?.message ?? 'Database tables not created yet.');
          setExerciseCatalogCount(null);
          setProfile(null);
          setSettings({ ...DEFAULT_SETTINGS, user_id: authUser.id });
          const localGoals = await fetchNutritionGoals(authUser.id).catch(() => null);
          setNutritionGoals(localGoals ?? { ...DEFAULT_GOALS, user_id: authUser.id });
          setWidgets(
            DEFAULT_WIDGETS.map((w, idx) => ({
              id: `default-${idx}`,
              user_id: authUser.id,
              widget_key: w.widget_key,
              title: w.title,
              is_visible: true,
              sort_order: w.sort_order,
            }))
          );
          applyThemeLocally('obsidian', '#C4F82A');
          return;
        }
      }

      setSchemaMissing(false);
      setSchemaError(null);

      try {
        const count = await countPublicExercises();
        setExerciseCatalogCount(count);
      } catch {
        setExerciseCatalogCount(0);
      }

      let prof = results[0].status === 'fulfilled' ? results[0].value : null;
      let sett = results[1].status === 'fulfilled' ? results[1].value : null;
      let goals = results[2].status === 'fulfilled' ? results[2].value : null;
      const wids = results[3].status === 'fulfilled' ? results[3].value : [];

      // If user signed up before SQL migration ran, backfill their initial rows now
      if (!prof || !sett || !goals) {
        try {
          await ensureUserAccountRecords(
            authUser.id,
            authUser.email || '',
            String(authUser.user_metadata?.full_name || '')
          );
          const [p2, s2, g2] = await Promise.all([
            fetchUserProfile(authUser.id),
            fetchUserSettings(authUser.id),
            fetchNutritionGoals(authUser.id),
          ]);
          prof = p2;
          sett = s2;
          goals = g2;
        } catch {
          // Non-fatal fallback handled below
        }
      }

      setProfile(prof);
      const resolvedSettings = sett ?? { ...DEFAULT_SETTINGS, user_id: authUser.id };
      setSettings(resolvedSettings);
      setNutritionGoals(goals ?? { ...DEFAULT_GOALS, user_id: authUser.id });
      setWidgets(
        wids.length > 0
          ? wids
          : DEFAULT_WIDGETS.map((w, idx) => ({
              id: `default-${idx}`,
              user_id: authUser.id,
              widget_key: w.widget_key,
              title: w.title,
              is_visible: true,
              sort_order: w.sort_order,
            }))
      );
      applyThemeLocally(resolvedSettings.theme_name, resolvedSettings.accent_color);
    },
    [applyThemeLocally]
  );

  const refreshAccount = useCallback(async () => {
    if (!user) return;
    await loadAccountData(user);
  }, [loadAccountData, user]);

  const bootstrapAuth = useCallback(async () => {
    const hasConfig = isSupabaseConfigured();
    setConfigured(hasConfig);
    await initializeAndroidShell('#08090B');

    const supabase = getSupabaseClient();
    if (!supabase) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      applyThemeLocally('obsidian', '#C4F82A');
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();

      setSession(activeSession);
      setUser(activeSession?.user ?? null);

      if (activeSession?.user) {
        await loadAccountData(activeSession.user);
      } else {
        setProfile(null);
        setSettings(DEFAULT_SETTINGS);
        setNutritionGoals(DEFAULT_GOALS);
        setWidgets([]);
        applyThemeLocally('obsidian', '#C4F82A');
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyThemeLocally, loadAccountData]);

  useEffect(() => {
    void bootstrapAuth();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        void loadAccountData(nextSession.user);
      } else {
        setProfile(null);
        setSettings(DEFAULT_SETTINGS);
        setNutritionGoals(DEFAULT_GOALS);
        setWidgets([]);
        applyThemeLocally('obsidian', '#C4F82A');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applyThemeLocally, bootstrapAuth, loadAccountData, configured]);

  const refreshConfigStatus = useCallback(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setSchemaMissing(false);
    setSchemaError(null);
    setExerciseCatalogCount(null);
    setSettings(DEFAULT_SETTINGS);
    setNutritionGoals(DEFAULT_GOALS);
    setWidgets([]);
    applyThemeLocally('obsidian', '#C4F82A');
  }, [applyThemeLocally]);

  const exerciseCatalogNeedsSeed =
    !schemaMissing && exerciseCatalogCount !== null && exerciseCatalogCount < 300;

  return (
    <AuthContext.Provider
      value={{
        isConfigured: configured,
        isLoading,
        schemaMissing,
        schemaError,
        exerciseCatalogCount,
        exerciseCatalogNeedsSeed,
        session,
        user,
        profile,
        settings,
        nutritionGoals,
        widgets,
        refreshAccount,
        refreshConfigStatus,
        applyThemeLocally,
        setProfileState: setProfile,
        setSettingsState: setSettings,
        setNutritionGoalsState: setNutritionGoals,
        setWidgetsState: setWidgets,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
