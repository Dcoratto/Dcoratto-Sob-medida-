/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Shell } from './components/layout/Shell';

import { Dashboard } from './pages/Dashboard';
import { QuotesPage } from './pages/QuotesPage';
import { QuoteEditor } from './pages/QuoteEditor';
import { ClientsPage } from './pages/ClientsPage';
import { InventoryPage } from './pages/InventoryPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { PremiumProposalPage } from './pages/PremiumProposalPage';

const ProtectedRoute = ({ children, adminOnly = false, shell = true }: { children: React.ReactNode, adminOnly?: boolean, shell?: boolean }) => {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-4 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
    </div>
  );
  
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  
  return shell ? <Shell>{children}</Shell> : <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          
          <Route path="/quotes" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
          <Route path="/quotes/new" element={<ProtectedRoute><QuoteEditor /></ProtectedRoute>} />
          <Route path="/quotes/edit/:id" element={<ProtectedRoute><QuoteEditor /></ProtectedRoute>} />
          <Route path="/quotes/proposal/:id" element={<ProtectedRoute shell={false}><PremiumProposalPage /></ProtectedRoute>} />
          
          <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/materials" element={<ProtectedRoute><MaterialsPage /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
