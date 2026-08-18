import { BookOutlined, CarOutlined, CommentOutlined, ControlOutlined, DashboardOutlined, EnvironmentOutlined, FlagOutlined, LogoutOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons';
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';

const { Header, Sider, Content } = Layout;
const menu: NonNullable<MenuProps['items']> = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">数据概览</Link> },
  { key: '/rides', icon: <CarOutlined />, label: <Link to="/rides">约骑管理</Link> },
  { key: '/routes', icon: <EnvironmentOutlined />, label: <Link to="/routes">路线管理</Link> },
  { key: '/regulations', icon: <BookOutlined />, label: <Link to="/regulations">法规管理</Link> },
  { key: '/users', icon: <TeamOutlined />, label: <Link to="/users">用户管理</Link> },
  { key: '/reports', icon: <FlagOutlined />, label: <Link to="/reports">举报处理</Link> },
  { key: '/feature-flags', icon: <ControlOutlined />, label: <Link to="/feature-flags">功能开关</Link> },
  { key: '/v21-governance', icon: <CommentOutlined />, label: <Link to="/v21-governance">事故指南与安全</Link> },
  { key: '/maintenance', icon: <SettingOutlined />, label: <Link to="/maintenance">集成运维</Link> },
];
const names: Record<string, string> = { '/': '数据概览', '/rides': '约骑管理', '/routes': '路线管理', '/regulations': '法规管理', '/users': '用户管理', '/reports': '举报处理', '/feature-flags': '功能开关', '/v21-governance': '安全内容', '/maintenance': '集成运维' };

export function AdminLayout() {
  const location = useLocation(); const navigate = useNavigate();
  const { admin, logout } = useAuthStore();
  const visibleMenu = admin?.role === 2
    ? menu.filter((item) => item?.key === '/regulations' || item?.key === '/v21-governance')
    : menu;
  const current = useMemo(() => names[location.pathname] || '管理后台', [location.pathname]);
  const items: MenuProps['items'] = [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); navigate('/login', { replace: true }); } }];
  return <Layout className="shell"><Sider width={224} theme="dark" className="shell__sider"><div className="shell__brand">摩搭子助手 <small>管理后台</small></div><Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={visibleMenu} /></Sider><Layout><Header className="shell__header"><Breadcrumb items={[{ title: '后台管理' }, { title: current }]} /><Dropdown menu={{ items }}><Button type="text"><Avatar size="small">{admin?.username.slice(0, 1)}</Avatar> {admin?.username || '管理员'}</Button></Dropdown></Header><Content className="shell__content"><Outlet /></Content></Layout></Layout>;
}
