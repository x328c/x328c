import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminLayout } from './layouts/admin-layout';
import { LoginPage } from './pages/login';
import { useAuthStore } from './stores/auth-store';

const DashboardPage = lazy(() => import('./pages/dashboard').then((module) => ({ default: module.DashboardPage })));
const RidesPage = lazy(() => import('./pages/content-management').then((module) => ({ default: module.RidesPage })));
const ActivitiesPage = lazy(() => import('./pages/content-management').then((module) => ({ default: module.ActivitiesPage })));
const UsersPage = lazy(() => import('./pages/users').then((module) => ({ default: module.UsersPage })));
const ReportsPage = lazy(() => import('./pages/reports').then((module) => ({ default: module.ReportsPage })));
const RoutesPage = lazy(() => import('./pages/routes').then((module) => ({ default: module.RoutesPage })));
const RegulationsPage = lazy(() => import('./pages/regulations').then((module) => ({ default: module.RegulationsPage })));
const ForumModerationPage = lazy(() => import('./pages/forum-moderation').then((module) => ({ default: module.ForumModerationPage })));
const MaintenancePage = lazy(() => import('./pages/maintenance').then((module) => ({ default: module.MaintenancePage })));
const FeatureFlagsPage = lazy(() => import('./pages/feature-flags').then((module) => ({ default: module.FeatureFlagsPage })));
const V21GovernancePage = lazy(() => import('./pages/v21-governance').then((module) => ({ default: module.V21GovernancePage })));

function Guard({ children }: { children: React.ReactElement }) { const { token, admin } = useAuthStore(); const location = useLocation(); return token && admin ? children : <Navigate to="/login" replace state={{ from: location }} />; }
export default function App() { return <Suspense fallback={<div className="page-loading">加载中…</div>}><Routes><Route path="/login" element={<LoginPage />} /><Route element={<Guard><AdminLayout /></Guard>}><Route path="/" element={<DashboardPage />} /><Route path="/rides" element={<RidesPage />} /><Route path="/routes" element={<RoutesPage />} /><Route path="/regulations" element={<RegulationsPage />} /><Route path="/forum" element={<ForumModerationPage />} /><Route path="/feature-flags" element={<FeatureFlagsPage />} /><Route path="/maintenance" element={<MaintenancePage />} /><Route path="/v21-governance" element={<V21GovernancePage />} /><Route path="/activities" element={<ActivitiesPage />} /><Route path="/users" element={<UsersPage />} /><Route path="/reports" element={<ReportsPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></Suspense>; }
