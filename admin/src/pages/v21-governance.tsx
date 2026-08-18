import { Button, Card, Form, Input, message, Modal, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import type { SafetyAgreementAdminItem, SafetyGuideAdminItem, SafetyGuideRevisionPayload } from '../types';
import { useAuthStore } from '../stores/auth-store';

function ask(title: string, action: (reason: string) => Promise<void>) {
  let reason = '';
  Modal.confirm({
    title,
    content: <Input.TextArea rows={3} maxLength={500} placeholder="填写操作原因（必填）" onChange={(event) => { reason = event.target.value; }} />,
    onOk: async () => {
      if (reason.trim().length < 2) throw new Error('请填写至少 2 字原因');
      await action(reason.trim());
    },
  });
}

interface GuideEditorValues extends Omit<SafetyGuideRevisionPayload, 'content_json' | 'content_text'> {
  content_json_text?: string;
  content_text?: string;
}

const DEFAULT_GUIDE_CONTENT = {
  alert: '如有人身危险，请优先联系 110/120 并服从现场人员指挥。',
  disclaimer: '本指南不判断事故责任，不替代公安交管、保险机构或专业法律意见。',
  sections: [{ title: '处理步骤', items: ['请在后台补充内容后提交复核。'] }],
};
const DEFAULT_INITIATIVE_TEXT = `## 摘要

请填写倡议摘要。

## 正文

### 一、章节标题

请填写章节正文，并保持共 10 个三级标题章节。

## 来源与编制依据

1. [官方来源标题](https://www.npc.gov.cn/)：请填写编制依据说明。`;

export function V21GovernancePage() {
  const role = useAuthStore((state) => state.admin?.role);
  const [guides, setGuides] = useState<SafetyGuideAdminItem[]>([]);
  const [agreements, setAgreements] = useState<SafetyAgreementAdminItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<GuideEditorValues>();
  const editingCode = Form.useWatch('code', form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        adminApi.safetyGuides(),
        adminApi.safetyAgreements(),
      ]);
      setGuides(g); setAgreements(a);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const workflow = (kind: 'guide' | 'agreement', id: string, action: 'review' | 'publish') =>
    ask(`确认${action === 'review' ? '复核' : '发布'}？`, async (reason) => {
      if (kind === 'guide') await (action === 'review' ? adminApi.reviewSafetyGuide(id, reason) : adminApi.publishSafetyGuide(id, reason));
      else await (action === 'review' ? adminApi.reviewSafetyAgreement(id, reason) : adminApi.publishSafetyAgreement(id, reason));
      message.success('操作成功'); await load();
    });

  const openEditor = (guide?: SafetyGuideAdminItem, requestedCode: 'accident_handling' | 'safe_riding_initiative' = 'accident_handling') => {
    const revision = guide?.revisions[0];
    const code = guide?.code ?? requestedCode;
    const initiative = code === 'safe_riding_initiative';
    form.setFieldsValue({
      code,
      title: guide?.title ?? (initiative ? '安全骑行倡议' : '骑行应急知识'),
      summary: guide?.summary ?? (initiative ? '合法、安全、克制地骑行，对自己、同伴和公众负责。' : '道路交通事故一般处理流程提示。'),
      version: '',
      content_json_text: initiative ? undefined : JSON.stringify(revision?.content_json ?? DEFAULT_GUIDE_CONTENT, null, 2),
      content_text: initiative ? revision?.content_text ?? DEFAULT_INITIATIVE_TEXT : undefined,
      source_title: revision?.source_title ?? (initiative ? '中华人民共和国道路交通安全法' : '道路交通事故处理程序规定'),
      source_url: revision?.source_url ?? (initiative ? 'https://www.npc.gov.cn/' : 'https://www.gov.cn/zhengce/2021-12/25/content_5712900.htm'),
      source_issuer: revision?.source_issuer ?? (initiative ? '全国人民代表大会常务委员会' : '中华人民共和国公安部'),
      source_published_at: revision?.source_published_at?.slice(0, 10) ?? '2017-07-22',
      source_effective_at: revision?.source_effective_at?.slice(0, 10) ?? '2018-05-01',
      content_note: '',
      last_verified_at: new Date().toISOString().slice(0, 10),
    });
    setEditorOpen(true);
  };

  const saveRevision = async (values: GuideEditorValues) => {
    let content: unknown;
    if (values.code !== 'safe_riding_initiative') {
      try { content = JSON.parse(values.content_json_text ?? ''); }
      catch { message.error('指南内容 JSON 格式错误'); return; }
      if (!content || Array.isArray(content) || typeof content !== 'object') {
        message.error('指南内容必须是 JSON 对象'); return;
      }
    }
    setSaving(true);
    try {
      const { content_json_text: _ignored, content_text, ...rest } = values;
      await adminApi.createSafetyGuideRevision(values.code === 'safe_riding_initiative'
        ? { ...rest, content_text }
        : { ...rest, content_json: content as Record<string, unknown> });
      message.success('新修订已保存，请由另一名管理员复核后发布');
      setEditorOpen(false); form.resetFields(); await load();
    } finally { setSaving(false); }
  };

  const revisions = guides.flatMap((guide) => guide.revisions.map((revision) => ({ ...revision, article: guide.title, guide })));
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Card>
      <Typography.Title level={3}>V2.2 安全内容</Typography.Title>
      <Typography.Paragraph type="secondary">骑行应急知识与安全骑行倡议均采用不可变修订，须由非创建人复核后再由超级管理员发布。</Typography.Paragraph>
    </Card>
    <Tabs defaultActiveKey="guides" items={[
      { key: 'guides', label: '安全内容', children: <Space direction="vertical" style={{ width: '100%' }}>
        <Space><Button type="primary" disabled={role !== 1 && role !== 9} onClick={() => openEditor(guides.find((item) => item.code === 'accident_handling'))}>新建/修改应急知识</Button><Button type="primary" disabled={role !== 1 && role !== 9} onClick={() => openEditor(guides.find((item) => item.code === 'safe_riding_initiative'), 'safe_riding_initiative')}>新建/修改安全骑行倡议</Button></Space>
        <Table loading={loading} rowKey="id" dataSource={revisions} columns={[
          { title: '指南', dataIndex: 'article' }, { title: '版本', dataIndex: 'version' },
          { title: '原文链接', dataIndex: 'source_url', ellipsis: true, render: (value: string) => <a href={value} target="_blank" rel="noreferrer">{value}</a> },
          { title: '创建人', dataIndex: 'created_by' },
          { title: '复核人', dataIndex: 'reviewed_by', render: (value) => value ?? '待复核' },
          { title: '状态', render: (_, item) => <Tag color={item.published_at ? 'green' : item.reviewed_at ? 'blue' : 'gold'}>{item.published_at ? '已发布' : item.reviewed_at ? '已复核' : '待复核'}</Tag> },
          { title: '操作', render: (_, item) => <Space><Button disabled={role !== 1 && role !== 9} onClick={() => openEditor(item.guide)}>基于最新版修改</Button><Button disabled={(role !== 2 && role !== 9) || Boolean(item.reviewed_at) || item.created_by === '系统初始化'} onClick={() => workflow('guide', item.id, 'review')}>复核</Button><Button type="primary" disabled={role !== 9 || !item.reviewed_at || Boolean(item.published_at)} onClick={() => workflow('guide', item.id, 'publish')}>发布</Button></Space> },
        ]} />
      </Space> },
      { key: 'agreements', label: '安全须知', children: <Table loading={loading} rowKey="id" dataSource={agreements} columns={[
        { title: '场景', dataIndex: 'scene' }, { title: '版本', dataIndex: 'version' }, { title: '创建人', dataIndex: 'created_by' },
        { title: '复核人', dataIndex: 'reviewed_by', render: (value) => value ?? '待复核' },
        { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 1 ? 'green' : 'gold'}>{value === 1 ? '生效中' : value === 2 ? '已失效' : '草稿'}</Tag> },
        { title: '操作', render: (_, item) => <Space><Button disabled={(role !== 2 && role !== 9) || Boolean(item.reviewed_at)} onClick={() => workflow('agreement', item.id, 'review')}>复核</Button><Button type="primary" disabled={role !== 9 || !item.reviewed_at || item.status === 1} onClick={() => workflow('agreement', item.id, 'publish')}>发布</Button></Space> },
      ]} /> },
    ]} />
    <Modal title="新建安全内容修订" width={880} open={editorOpen} confirmLoading={saving} onCancel={() => setEditorOpen(false)} onOk={() => form.submit()} okText="保存修订">
      <Form form={form} layout="vertical" onFinish={(values) => void saveRevision(values)}>
        <Space style={{ display: 'flex' }} align="start"><Form.Item name="code" label="代码" rules={[{ required: true }]}><Input disabled /></Form.Item><Form.Item name="version" label="新版本号" rules={[{ required: true }]}><Input placeholder="例：2026.08.2" /></Form.Item></Space>
        <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="summary" label="摘要" rules={[{ required: true }]}><Input.TextArea rows={2} maxLength={500} /></Form.Item>
        {editingCode === 'safe_riding_initiative'
          ? <Form.Item name="content_text" label="倡议正文（粘贴 Markdown 文本，后台自动整理为章节和来源结构）" rules={[{ required: true, min: 10 }]}><Input.TextArea rows={20} placeholder="需包含：## 摘要、## 正文、10 个 ### 章节、## 来源与编制依据" /></Form.Item>
          : <Form.Item name="content_json_text" label="应急知识内容 JSON（alert、disclaimer、sections）" rules={[{ required: true }]}><Input.TextArea rows={14} /></Form.Item>}
        <Form.Item name="source_title" label="官方原文标题" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="source_url" label="官方原文链接" rules={[{ required: true }, { type: 'url' }]}><Input /></Form.Item>
        <Form.Item name="source_issuer" label="发布机关" rules={[{ required: true }]}><Input /></Form.Item>
        <Space style={{ display: 'flex' }} align="start"><Form.Item name="source_published_at" label="原文发布日期"><Input type="date" /></Form.Item><Form.Item name="source_effective_at" label="施行日期"><Input type="date" /></Form.Item><Form.Item name="last_verified_at" label="最后复核日期" rules={[{ required: true }]}><Input type="date" /></Form.Item></Space>
        <Form.Item name="content_note" label="修订说明" rules={[{ required: true, min: 2 }]}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
      </Form>
    </Modal>
  </Space>;
}
