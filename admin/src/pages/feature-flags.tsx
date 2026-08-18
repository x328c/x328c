import { Alert, Button, Card, Form, Input, message, Modal, Space, Switch, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth-store';
import type { UpdateFeatureFlagSettings } from '../types';

function FlagRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}><div><Typography.Text strong>{title}</Typography.Text><Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>{description}</Typography.Paragraph></div>{children}</div>;
}

export function FeatureFlagsPage() {
  const [form] = Form.useForm<UpdateFeatureFlagSettings>();
  const [loading, setLoading] = useState(false);
  const role = useAuthStore((state) => state.admin?.role);
  const commentReadEnabled = Form.useWatch('route_comment_read_enabled', form);
  const canUpdate = role === 9;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const values = await adminApi.featureFlags();
      form.setFieldsValue({ ...values, reason: '' });
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  const confirmUpdate = async () => {
    const values = await form.validateFields();
    Modal.confirm({
      title: '确认更新 V2.2 功能开关？',
      content: '修改会立即影响服务端访问能力并清理对应缓存，操作将写入管理员审计日志。',
      okText: '确认更新',
      cancelText: '取消',
      onOk: async () => {
        setLoading(true);
        try {
          const next = await adminApi.updateFeatureFlags(values);
          form.setFieldsValue({ ...next, reason: '' });
          message.success('功能开关已更新并生效');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Alert
      showIcon
      type="warning"
      message="功能开关直接控制服务端能力"
      description="功能开关会立即影响路线、法规和安全内容能力；生产环境应按部署清单逐项灰度。"
    />
    {!canUpdate ? <Alert showIcon type="info" message="当前账号可查看开关，仅超级管理员可修改" /> : null}
    <Card title="V2.2 模块开关" loading={loading}>
      <Form form={form} layout="vertical" initialValues={{ route_enabled: false, regulation_enabled: false, route_link_enabled: false, route_comment_enabled: true, route_comment_read_enabled: true, safety_guide_enabled: true, safety_agreement_enforced: false }}>
        <FlagRow title="路线精选" description="控制公开路线和管理端路线 API；关闭不影响 V1 约骑。"><Form.Item name="route_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate} /></Form.Item></FlagRow>
        <FlagRow title="法规助手" description="控制法规检索、详情、反馈和后台工作流。"><Form.Item name="regulation_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate} /></Form.Item></FlagRow>
        <FlagRow title="路线联动" description="允许新建同行时绑定已发布路线。"><Form.Item name="route_link_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate} /></Form.Item></FlagRow>
        <FlagRow title="路线评论读取" description="已上线：公开显示未删除评论，用户可举报，管理员可删除；紧急情况下仍可关闭。"><Form.Item name="route_comment_read_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate} onChange={(checked) => { if (!checked) form.setFieldValue('route_comment_enabled', false); }} /></Form.Item></FlagRow>
        <FlagRow title="路线评论写入" description="已上线：允许登录用户提交评论；关闭时可保持只读。"><Form.Item name="route_comment_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate || !commentReadEnabled} /></Form.Item></FlagRow>
        <FlagRow title="骑行应急知识" description="初始内容已上线；如官方原文变更或内容需紧急复核，可在此暂停公开。"><Form.Item name="safety_guide_enabled" valuePropName="checked" noStyle><Switch disabled={!canUpdate} /></Form.Item></FlagRow>
        <FlagRow title="强制安全确认" description="开启后同行发起和加入接口均校验当前协议凭证。"><Form.Item name="safety_agreement_enforced" valuePropName="checked" noStyle><Switch disabled={!canUpdate} /></Form.Item></FlagRow>
        <Form.Item name="reason" label="修改原因" rules={[{ required: true, min: 2, max: 500, message: '请填写 2-500 字修改原因' }]}><Input.TextArea disabled={!canUpdate} maxLength={500} showCount rows={3} placeholder="例如：仅用于本地完整功能联调" /></Form.Item>
        <Button type="primary" disabled={!canUpdate} loading={loading} onClick={() => void confirmUpdate()}>保存并立即生效</Button>
      </Form>
    </Card>
  </Space>;
}
