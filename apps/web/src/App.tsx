import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/ThemeContext';
import { AppShell } from './components/shell/AppShell';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { LeadsPage } from './pages/Leads';
import { PipelinePage } from './pages/Pipeline';
import { RemindersPage } from './pages/Reminders';
import { WhatsAppPage } from './pages/WhatsApp';
import { ConversationsPage } from './pages/Conversations';
import { PagePlaceholder } from './pages/PagePlaceholder';
import { AutomationsPage } from './pages/Automations';
import { FlowBuilder } from './pages/Automations/FlowBuilder';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsAccount } from './pages/settings/SettingsAccount';
import { SettingsUsers } from './pages/settings/SettingsUsers';
import { SettingsAppearance } from './pages/settings/SettingsAppearance';
import { SettingsTags } from './pages/settings/SettingsTags';
import { SettingsCustomFields } from './pages/settings/SettingsCustomFields';
import { SettingsPipelines } from './pages/settings/SettingsPipelines';
import { SettingsIntegrations } from './pages/settings/SettingsIntegrations';
import { ApiTestPage } from './pages/ApiTest';
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
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/automations" element={<AutomationsPage />} />
              <Route
                path="/automations/flows/:id"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <FlowBuilder />
                  </ProtectedRoute>
                }
              />
              <Route path="/whatsapp" element={<WhatsAppPage />} />

              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="/settings/account" replace />} />
                <Route path="account" element={<SettingsAccount />} />
                <Route path="appearance" element={<SettingsAppearance />} />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsUsers />
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
                <Route
                  path="integrations"
                  element={
                    <ProtectedRoute roles={['ADMIN']}>
                      <SettingsIntegrations />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route
                path="/api-test"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <ApiTestPage />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
