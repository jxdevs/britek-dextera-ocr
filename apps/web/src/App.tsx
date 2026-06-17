import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import AuditLogsPage from './pages/AuditLogsPage';
import CajaDetailPage from './pages/CajaDetailPage';
import CajasPage from './pages/CajasPage';
import DashboardPage from './pages/DashboardPage';
import FacturaDetailPage from './pages/FacturaDetailPage';
import FacturasPendingPage from './pages/FacturasPendingPage';
import LoginPage from './pages/LoginPage';
import TestExtraction from './pages/TestExtraction';
import WhatsappEventsPage from './pages/WhatsappEventsPage';
import WorkersPage from './pages/WorkersPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['admin', 'approver']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workers"
              element={
                <ProtectedRoute roles={['admin']}>
                  <WorkersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cajas"
              element={
                <ProtectedRoute roles={['admin', 'approver']}>
                  <CajasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cajas/:id"
              element={
                <ProtectedRoute roles={['admin', 'approver']}>
                  <CajaDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/facturas"
              element={
                <ProtectedRoute roles={['admin', 'approver']}>
                  <FacturasPendingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/facturas/:id"
              element={
                <ProtectedRoute roles={['admin', 'approver']}>
                  <FacturaDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/whatsapp"
              element={
                <ProtectedRoute roles={['admin']}>
                  <WhatsappEventsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />
            <Route path="/test-extraction" element={<TestExtraction />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
