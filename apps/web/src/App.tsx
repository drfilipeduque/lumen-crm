import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/ThemeContext';
import { AppShell } from './components/shell/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { PagePlaceholder } from './pages/PagePlaceholder';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsSection } from './pages/settings/SettingsSection';
import { SettingsAccount } from './pages/settings/SettingsAccount';
import { SettingsAppearance } from './pages/settings/SettingsAppearance';
import { SettingsTags } from './pages/settings/SettingsTags';
import { SettingsCustomFields } from './pages/settings/SettingsCustomFields';
import { SettingsPipelines } from './pages/settings/SettingsPipelines';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ThemeSync } from './components/ThemeSync';
import { ToastViewport } from './components/ui/Toast';
import { queryClient } from './lib/queryClient';
import './lib/api';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultMode="light">
        <ThemeSync />
        <ToastViewport />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/pipeline" element={<PagePlaceholder title="Pipeline" icon="Pipeline" />} />
              <Route path="/conversations" element={<PagePlaceholder title="Conversas" icon="Chat" />} />
              <Route path="/leads" element={<PagePlaceholder title="Leads" icon="Users" />} />
              <Route path="/reminders" element={<PagePlaceholder title="Lembretes" icon="Bell" />} />
              <Route path="/automations" element={<PagePlaceholder title="Automações" icon="Bolt" />} />
              <Route path="/whatsapp" element={<PagePlaceholder title="WhatsApp" icon="Phone" />} />

              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/account" replace />} />
                <Route path="account" element={<SettingsAccount />} />
                <Route path="appearance" element={<SettingsAppearance />} />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsSection
                        title="Usuários"
                        description="Gerencie a equipe que tem acesso ao Lumen CRM."
                      />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="pipelines"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsPipelines />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="custom-fields"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsCustomFields />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="tags"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsTags />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
