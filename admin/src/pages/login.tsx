import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth-store';

export function LoginPage() {
  const navigate = useNavigate(); const setSession = useAuthStore((state) => state.setSession);
  const submit = async (values: { username: string; password: string }) => { const result = await adminApi.login(values.username, values.password); setSession(result.access_token, result.admin); navigate('/', { replace: true }); };
  return <main className="login"><Card className="login__card"><Typography.Title level={2}>疆行机车圈</Typography.Title><Typography.Paragraph type="secondary">管理后台登录</Typography.Paragraph><Form layout="vertical" onFinish={submit} requiredMark={false}><Form.Item name="username" label="管理员账号" rules={[{ required: true, message: '请输入管理员账号' }]}><Input prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" /></Form.Item><Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}><Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" /></Form.Item><Button type="primary" htmlType="submit" block size="large">登录</Button></Form></Card></main>;
}
