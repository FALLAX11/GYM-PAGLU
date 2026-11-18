import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { registerAndroidBackHandler } from '../lib/capacitor';
import {
  ForgotPasswordScreen,
  LoginScreen,
  OnboardingScreen,
  ResetPasswordScreen,
  SignupScreen,
} from '../features/auth/AuthPages';
import { SplashScreen } from '../features/auth/SplashScreen';
import { WelcomeScreen } from '../features/auth/WelcomeScreen';
import { HomePage } from '../features/dashboard/HomePage';
import { WorkoutHubPage } from '../features/workout/WorkoutHubPage';
import { WorkoutRecoveryModal } from '../components/workout/WorkoutRecoveryModal';
import { ActiveWorkoutPage } from '../features/workout/ActiveWorkoutPage';
import { WorkoutHistoryPage } from '../features/workout/WorkoutHistoryPage';
import { WorkoutDetailPage } from '../features/workout/WorkoutDetailPage';
import { ExerciseDetailPage } from '../features/workout/ExerciseDetailPage';
import { NutritionPage } from '../features/nutrition/NutritionPage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { AICoachPage } from '../features/ai-coach/AICoachPage';
import { ProfilePage } from '../features/profile/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();
  if (isLoading) return <SplashScreen />;
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();
  if (isLoading) return <SplashScreen />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function AndroidBackCoordinator() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const topLevelRoutes = new Set([
      '/home',
      '/workout',
      '/nutrition',
      '/progress',
      '/coach',
      '/profile',
      '/welcome',
    ]);

    return registerAndroidBackHandler(() => {
      if (topLevelRoutes.has(location.pathname)) {
        if (location.pathname !== '/home' && location.pathname !== '/welcome') {
          navigate('/home');
          return true;
        }
        return false; // Let Capacitor exit app on Home/Welcome root
      }
      navigate(-1);
      return true;
    });
  }, [location.pathname, navigate]);

  return null;
}

export function AppRouter() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <BrowserRouter>
      <AndroidBackCoordinator />
      <WorkoutRecoveryModal />
      <Routes>
        <Route
          path="/"
          element={<Navigate to={user ? '/home' : '/welcome'} replace />}
        />

        {/* Public Auth Routes */}
        <Route
          path="/welcome"
          element={
            <PublicOnlyRoute>
              <WelcomeScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <SignupScreen />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordScreen />
            </PublicOnlyRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />

        {/* Protected Onboarding & Main App Routes */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout"
          element={
            <ProtectedRoute>
              <WorkoutHubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout/active"
          element={
            <ProtectedRoute>
              <ActiveWorkoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout/history"
          element={
            <ProtectedRoute>
              <WorkoutHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout/session/:sessionId"
          element={
            <ProtectedRoute>
              <WorkoutDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout/exercise/:exerciseName"
          element={
            <ProtectedRoute>
              <ExerciseDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/nutrition"
          element={
            <ProtectedRoute>
              <NutritionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <ProgressPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coach"
          element={
            <ProtectedRoute>
              <AICoachPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={user ? '/home' : '/welcome'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
