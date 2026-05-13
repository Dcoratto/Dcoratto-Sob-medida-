import React from 'react';
import {NavLink} from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Database,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {auth} from '../../lib/firebase';
import {cn} from '../../lib/utils';
import {Logo} from './Logo';
import {roleLabel} from '../../lib/permissions';

type MenuItem = {icon: React.ComponentType<{className?: string}>; label: string; path: string};

export const Sidebar: React.FC = () => {
  const {isAdmin, profile, user, accessUser, hasPermission} = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const menuItems = [
    hasPermission('dashboard', 'visualizar') ?{icon: LayoutDashboard, label: 'Dashboard', path: '/'} : null,
    hasPermission('orcamento', 'visualizar') ?{icon: FileText, label: 'Orcamentos', path: '/quotes'} : null,
    hasPermission('projeto', 'visualizar') ?{icon: FolderKanban, label: 'Projetos', path: '/projects'} : null,
    hasPermission('cliente', 'visualizar') ?{icon: Users, label: 'Clientes', path: '/clients'} : null,
    hasPermission('medicao', 'visualizar') ?{icon: CalendarDays, label: 'Calendario', path: '/calendar'} : null,
    hasPermission('historico', 'visualizar') ?{icon: History, label: 'Historico', path: '/history'} : null,
    hasPermission('relatorios', 'visualizar') ?{icon: BarChart3, label: 'Relatorios', path: '/reports'} : null,
    hasPermission('materiais', 'visualizar') ?{icon: Package, label: 'Materiais', path: '/materials'} : null,
    hasPermission('estoque', 'visualizar') ?{icon: Database, label: 'Estoque', path: '/inventory'} : null,
  ].filter(Boolean) as MenuItem[];

  if (isAdmin) {
    menuItems.push({icon: ShieldAlert, label: 'Admin', path: '/admin'});
  }

  const displayName = profile?.name || accessUser?.nome || user?.email?.split('@')[0] || 'Usuario';
  const displayRole = profile?.position || (accessUser?.role ?roleLabel(accessUser.role) : user?.email || '');

  const closeMobileMenu = () => setMobileOpen(false);

  const renderNavigation = (mobile = false) => (
    <>
      <nav className={cn('flex-1 space-y-1', mobile ?'px-0' : 'px-4')}>
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={mobile ?closeMobileMenu : undefined}
            className={({isActive}) => cn(
              'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
              isActive ?'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'text-slate-600 hover:bg-slate-50 hover:text-brand-primary',
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={cn('border-t border-slate-100', mobile ?'mt-4 pt-4' : 'p-4')}>
        <NavLink
          to="/profile"
          onClick={mobile ?closeMobileMenu : undefined}
          className={({isActive}) => cn(
            'group mb-2 flex items-center gap-3 rounded-xl px-3 py-4 transition-all',
            isActive ?'bg-slate-50' : 'hover:bg-slate-50',
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-primary/10 font-bold text-brand-primary">
            {profile?.photoUrl ?(
              <img src={profile.photoUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{displayRole}</p>
          </div>
        </NavLink>
        <button
          onClick={() => {
            closeMobileMenu();
            auth.signOut();
          }}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-all hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="justify-center" />
        <NavLink
          to="/profile"
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10 font-bold text-brand-primary"
        >
          {displayName.charAt(0).toUpperCase()}
        </NavLink>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
          />
          <aside className="relative flex h-full w-[min(84vw,320px)] flex-col bg-white px-4 py-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3 px-2">
              <Logo />
              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavigation(true)}
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="p-6">
          <Logo />
        </div>
        {renderNavigation(false)}
      </aside>
    </>
  );
};
