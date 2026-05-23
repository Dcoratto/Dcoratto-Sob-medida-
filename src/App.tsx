/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {Suspense, lazy} from 'react';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import {AuthProvider, useAuth} from './contexts/AuthContext';
import {Shell} from './components/layout/Shell';
import {PermissionModule} from './lib/permissions';
import {
  loadAdminPage,
  loadCalendarPage,
  loadClientsPage,
  loadDashboardPage,
  loadInventoryPage,
  loadLoginPage,
  loadMaterialsPage,
  loadPremiumProposalPage,
  loadProfilePage,
  loadProjectsPage,
  loadQuoteEditorPage,
  loadQuotesPage,
  loadReportsPage,
} from './lib/pageLoaders';

const Login = lazy(() => loadLoginPage().then((module) => ({default: module.Login})));
const Dashboard = lazy(() => loadDashboardPage().then((module) => ({default: module.Dashboard})));
const QuotesPage = lazy(() => loadQuotesPage().then((module) => ({default: module.QuotesPage})));
const QuoteEditor = lazy(() => loadQuoteEditorPage().then((module) => ({default: module.QuoteEditor})));
const ClientsPage = lazy(() => loadClientsPage().then((module) => ({default: module.ClientsPage})));
const InventoryPage = lazy(() => loadInventoryPage().then((module) => ({default: module.InventoryPage})));
const MaterialsPage = lazy(() => loadMaterialsPage().then((module) => ({default: module.MaterialsPage})));
const AdminPage = lazy(() => loadAdminPage().then((module) => ({default: module.AdminPage})));
const ProfilePage = lazy(() => loadProfilePage().then((module) => ({default: module.ProfilePage})));
const ReportsPage = lazy(() => loadReportsPage().then((module) => ({default: module.ReportsPage})));
const PremiumProposalPage = lazy(() => loadPremiumProposalPage().then((module) => ({default: module.PremiumProposalPage})));
const ProjectsPage = lazy(() => loadProjectsPage().then((module) => ({default: module.ProjectsPage})));
const CalendarPage = lazy(() => loadCalendarPage().then((module) => ({default: module.CalendarPage})));

const NoPermission = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
    <div className="max-w-lg rounded-[32px] border border-slate-100 bg-white p-8 text-center shadow-sm">
      <h1 className="font-display text-2xl font-bold text-slate-900">Acesso bloqueado</h1>
      <p className="mt-3 text-slate-500">Você não tem permissão para acessar esta área. Fale com o administrador.</p>
    </div>
  </div>
);

const ProtectedRoute = ({
  children,
  adminOnly = false,
  shell = true,
  permission,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  shell?: boolean;
  permission?: [PermissionModule, string];
}) => {
  const {user, loading, isAdmin, isMasterAdmin, accessUser, hasPermission} = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (!isMasterAdmin && accessUser?.blocked) return <NoPermission />;
  if (adminOnly && !isAdmin) return <NoPermission />;
  if (permission && !hasPermission(permission[0], permission[1])) return <NoPermission />;

  return shell ?<Shell>{children}</Shell> : <>{children}</>;
};

const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-white">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary/20 border-t-brand-primary" />
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute permission={['dashboard', 'visualizar']}><Dashboard /></ProtectedRoute>} />
            <Route path="/quotes" element={<ProtectedRoute permission={['orcamento', 'visualizar']}><QuotesPage /></ProtectedRoute>} />
            <Route path="/quotes/new" element={<ProtectedRoute permission={['orcamento', 'criar']}><QuoteEditor /></ProtectedRoute>} />
            <Route path="/quotes/edit/:id" element={<ProtectedRoute permission={['orcamento', 'editar']}><QuoteEditor /></ProtectedRoute>} />
            <Route path="/quotes/proposal/:id" element={<ProtectedRoute shell={false} permission={['orcamento', 'visualizar']}><PremiumProposalPage /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute permission={['projeto', 'visualizar']}><ProjectsPage /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute permission={['medicao', 'visualizar']}><CalendarPage /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute permission={['cliente', 'visualizar']}><ClientsPage /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute permission={['historico', 'visualizar']}><QuotesPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute permission={['relatorios', 'visualizar']}><ReportsPage /></ProtectedRoute>} />
            <Route path="/materials" element={<ProtectedRoute permission={['materiais', 'visualizar']}><MaterialsPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute permission={['estoque', 'visualizar']}><InventoryPage /></ProtectedRoute>} />
            <Route path="/settings" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
