import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useTheme } from '../lib/ThemeContext';
import type { UserRole } from '../lib/auth';

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const { tokens } = useTheme();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const location = useLocation();

  useEffect(() => {
    if (status === 'idle') void bootstrap();
  }, [status, bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        className="flex h-screen w-screen items-center justify-center"
        style={{ background: tokens.bg, color: tokens.textDim }}
      >
        <div className="flex items-center gap-3 text-sm">
          <span
            className="inline-block h-3 w-3 animate-pulse rounded-full"
            style={{ background: tokens.gold }}
          />
          Carregando…
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
