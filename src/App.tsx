import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { WorkoutSessionProvider } from './context/WorkoutSessionContext';
import { AppRouter } from './app/AppRouter';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <WorkoutSessionProvider>
            <AppRouter />
          </WorkoutSessionProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
