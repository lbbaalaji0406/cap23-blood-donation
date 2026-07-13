import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { SignupScreen } from './components/SignupScreen';
import { MastersRouter } from './components/Masters/MastersRouter';
import { UsersScreen } from './components/Users/UsersScreen';

// Stub components for Day 1
const StubPage = ({ title }: { title: string }) => (
  <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
    <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
    <p className="text-slate-500">This module is part of the Day 2+ scope.</p>
  </div>
);

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
              <Route path="/dashboard" element={<StubPage title="Dashboard" />} />
              <Route path="/masters/*" element={<MastersRouter />} />
              <Route path="/requests/*" element={<StubPage title="Donation Requests" />} />
              <Route path="/history" element={<StubPage title="My Donation History" />} />
              <Route path="/reports" element={<StubPage title="Reports" />} />
              <Route path="/users" element={<UsersScreen />} />
              <Route path="/roles" element={<StubPage title="Role Management" />} />
              <Route path="/settings" element={<StubPage title="Settings" />} />
              
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
