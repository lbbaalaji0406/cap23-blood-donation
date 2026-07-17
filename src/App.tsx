import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { SignupScreen } from './components/SignupScreen';
import { MastersRouter } from './components/Masters/MastersRouter';
import { UsersScreen } from './components/Users/UsersScreen';
import { DashboardScreen } from './components/Dashboard/DashboardScreen';
import { RequestsRouter } from './components/Requests/RequestsRouter';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { DonorHistoryView } from './components/Users/DonorHistoryView';

import { RolesScreen } from './components/Administration/RolesScreen';
import { SettingsScreen } from './components/Administration/SettingsScreen';



import { useAuth } from './contexts/AuthProvider';
const RoleRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const { profile } = useAuth();
  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/signup" element={<SignupScreen />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardScreen />} />
              <Route path="/masters/*" element={<MastersRouter />} />
              <Route path="/requests/*" element={<RequestsRouter />} />
              <Route path="/history" element={<RoleRoute allowedRoles={['User']}><div className="p-4 lg:p-8"><DonorHistoryView /></div></RoleRoute>} />
              <Route path="users" element={<RoleRoute allowedRoles={['Admin']}><UsersScreen /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute allowedRoles={['Admin', 'Manager']}><ReportsDashboard /></RoleRoute>} />
              <Route path="/roles" element={<RoleRoute allowedRoles={['Admin']}><div className="p-4 lg:p-8"><RolesScreen /></div></RoleRoute>} />
              <Route path="/settings" element={<RoleRoute allowedRoles={['Admin']}><div className="p-4 lg:p-8"><SettingsScreen /></div></RoleRoute>} />
              
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
