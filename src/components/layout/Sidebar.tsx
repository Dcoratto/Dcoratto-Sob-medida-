import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  FileText, 
  Users, 
  History, 
  Package, 
  Database, 
  ShieldAlert,
  LogOut,
  LayoutDashboard,
  BarChart3,
  FolderKanban,
  CalendarDays
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { Logo } from './Logo';

export const Sidebar: React.FC = () => {
  const { isAdmin, profile, user } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: FileText, label: 'OrÃ§amentos', path: '/quotes' },
    { icon: FolderKanban, label: 'Projetos', path: '/projects' },
    { icon: Users, label: 'Clientes', path: '/clients' },
    { icon: CalendarDays, label: 'CalendÃ¡rio', path: '/calendar' },
    { icon: History, label: 'HistÃ³rico', path: '/history' },
    { icon: BarChart3, label: 'RelatÃ³rios', path: '/reports' },
    { icon: Package, label: 'Materiais', path: '/materials' },
    { icon: Database, label: 'Estoque', path: '/inventory' },
  ];

  if (isAdmin) {
    menuItems.push({ icon: ShieldAlert, label: 'Admin', path: '/admin' });
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col sticky top-0">
      <div className="p-6">
        <Logo />
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm font-medium",
              isActive 
                ?"bg-brand-primary text-white shadow-lg shadow-brand-primary/20" 
                : "text-slate-600 hover:bg-slate-50 hover:text-brand-primary"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <NavLink
          to="/profile"
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-4 mb-2 rounded-xl transition-all group",
            isActive ?"bg-slate-50" : "hover:bg-slate-50"
          )}
        >
          <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold overflow-hidden">
            {profile?.photoUrl ?(
              <img src={profile.photoUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              profile?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{profile?.name || 'UsuÃ¡rio'}</p>
            <p className="text-xs text-slate-500 truncate">{profile?.position || user?.email}</p>
          </div>
        </NavLink>
        <button
          onClick={() => auth.signOut()}
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all group"
        >
          <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          Sair
        </button>
      </div>
    </aside>
  );
};
