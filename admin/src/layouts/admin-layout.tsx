import { AppstoreOutlined, CarOutlined, DashboardOutlined, FlagOutlined, LogoutOutlined, TeamOutlined } from '@ant-design/icons';
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

const { Header, Sider, Content } = Layout;
const menu: MenuProps['items'] = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">数据概览</Link> },
  { key: '/rides', icon: <CarOutlined />, label: <Link to="/rides">约骑管理</Link> },
  { key: '/activities', icon: <AppstoreOutlined />, label: <Link to="/activities">活动管理</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">用户管理</Link> },
  { key: '/reports', icon: <FlagOutlined />, label: <Link to="/reports">举报处理</Link> },
];
const names: Record<string, string> = { '/': '数据概览', '/rides': '约骑管理', '/activities': '活动管理', '/users': '用户管理', '/reports': '举报处理' };

export function AdminLayout() {
  const location = useLocation(); const navigate = useNavigate();
  const { admin, logout } = useAuthStore();
  const current = useMemo(() => names[location.pathname] || '管理后台', [location.pathname]);
  const items: MenuProps['items'] = [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); navigate('/login', { replace: true }); } }];
  return <Layout className="shell"><Sider width={224} theme="dark" className="shell__sider"><div className="shell__brand">疆行机车圈 <small>管理后台</small></div><Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menu} /></Sider><Layout><Header className="shell__header"><Breadcrumb items={[{ title: '后台管理' }, { title: current }]} /><Dropdown menu={{ items }}><Button type="text"><Avatar size="small">{admin?.username.slice(0, 1)}</Avatar> {admin?.username || '管理员'}</Button></Dropdown></Header><Content className="shell__content"><Outlet /></Content></Layout></Layout>;
}
