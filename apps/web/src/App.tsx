import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './lib/auth';
import CajaDetailPage from './pages/CajaDetailPage';
import CajasPage from './pages/CajasPage';
import LoginPage from './pages/LoginPage';
import TestExtraction from './pages/TestExtraction';
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
            <Route index element={<Navigate to="/cajas" replace />} />
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
            <Route path="/test-extraction" element={<TestExtraction />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
