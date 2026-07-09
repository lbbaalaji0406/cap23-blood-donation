import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import { logout } from '../services/authService';
import { 
  LayoutDashboard, 
  Database, 
  Activity, 
  FileText, 
  Users, 
  Settings, 
  LogOut, 
  Menu
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

export const AppShell = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Admin', 'Manager', 'User'] },
    { label: 'Masters', path: '/masters', icon: Database, roles: ['Admin', 'Manager'] },
    { label: 'Donation Requests', path: '/requests', icon: Activity, roles: ['Admin', 'Manager'] },
    { label: 'Reports', path: '/reports', icon: FileText, roles: ['Admin', 'Manager'] },
    { label: 'My History', path: '/history', icon: Activity, roles: ['User'] },
    { label: 'Users', path: '/users', icon: Users, roles: ['Admin'] },
    { label: 'Roles', path: '/roles', icon: Users, roles: ['Admin'] },
    { label: 'Settings', path: '/settings', icon: Settings, roles: ['Admin'] },
  ];

  const visibleNavItems = navItems.filter(item => 
    profile?.role && item.roles.includes(profile.role)
  );

  return (
    <div className="min-h-screen bg-surface-light flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-slate-900 text-slate-300 transition-transform duration-200 ease-in-out flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-16 flex items-center px-6 text-white font-bold text-lg border-b border-slate-800">
          Blood Donation
        </div>
        
        <div className="p-4 border-b border-slate-800">
          <div className="text-sm font-medium text-white">{profile?.name || 'User'}</div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-slate-800 rounded-full text-primary">{profile?.role}</span>
            {profile?.campId && <span className="truncate" title={profile.campId}>Camp: {profile.campId}</span>}
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-white" 
                    : "hover:bg-slate-800 hover:text-white"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-8 shrink-0">
          <button 
            className="lg:hidden p-2 -ml-2 mr-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700 hidden sm:block">
              {profile?.email}
            </span>
          </div>
        </header>
        
        <div className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
