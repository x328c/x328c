import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from './layouts/admin-layout';
import { LoginPage } from './pages/login';
import { DashboardPage } from './pages/dashboard';
import { ActivitiesPage, RidesPage } from './pages/content-management';
import { UsersPage } from './pages/users';
import { ReportsPage } from './pages/reports';
import { useAuthStore } from './stores/auth-store';
function Guard({ children }: { children: React.ReactElement }) { const { token, admin, hydrate } = useAuthStore(); const location = useLocation(); if (!token && !admin) hydrate(); const state = useAuthStore.getState(); return state.token && state.admin ? children : <Navigate to="/login" replace state={{ from: location }} />; }
export default function App() { return <Routes><Route path="/login" element={<LoginPage />} /><Route element={<Guard><AdminLayout /></Guard>}><Route path="/" element={<DashboardPage />} /><Route path="/rides" element={<RidesPage />} /><Route path="/activities" element={<ActivitiesPage />} /><Route path="/users" element={<UsersPage />} /><Route path="/reports" element={<ReportsPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>; }
