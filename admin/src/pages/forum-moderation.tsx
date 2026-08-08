import { Alert, Badge, Button, Descriptions, Drawer, Image, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import type { ForumAuditItem, ForumBoardItem, ForumContentPreview, ForumContentType, ForumModerationItem, ForumQueueResult, ForumRestrictionItem, ListResult, ReportItem } from '../types';

type ReasonAction = 'approve' | 'reject' | 'retry' | 'offline' | 'report_offline' | 'report_ignore' | 'board' | 'unmute';
interface ReasonTarget { action: ReasonAction; id: string; type?: ForumContentType; userId?: string; nextStatus?: 0 | 1 }

const moderationNames = { 0: '待审核', 1: '已通过', 2: '已驳回' } as const;

export function ForumModerationPage() {
  const [api, contextHolder] = message.useMessage();
  const [pending, setPending] = useState<ForumQueueResult>(); const [errors, setErrors] = useState<ForumQueueResult>();
  const [reports, setReports] = useState<ListResult<ReportItem>>(); const [restrictions, setRestrictions] = useState<ForumRestrictionItem[]>([]);
  const [audit, setAudit] = useState<ListResult<ForumAuditItem>>(); const [boards, setBoards] = useState<ForumBoardItem[]>([]);
  const [loading, setLoading] = useState(false); const [type, setType] = useState<ForumContentType | undefined>();
  const [preview, setPreview] = useState<ForumContentPreview>(); const [reasonTarget, setReasonTarget] = useState<ReasonTarget>(); const [reason, setReason] = useState('');
  const [muteUser, setMuteUser] = useState<{ id: string; nickname: string }>(); const [muteReason, setMuteReason] = useState(''); const [muteEnd, setMuteEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingData, errorData, reportData, restrictionData, auditData, boardData] = await Promise.all([
        adminApi.forumModeration({ queue: 'pending', type, page: 1, pageSize: 50 }),
        adminApi.forumModeration({ queue: 'errors', type, page: 1, pageSize: 50 }),
        adminApi.forumReports({ status: 0, page: 1, pageSize: 50 }),
        adminApi.forumRestrictions(), adminApi.forumAudit({ page: 1, pageSize: 50 }), adminApi.forumBoards(),
      ]);
      setPending(pendingData); setErrors(errorData); setReports(reportData); setRestrictions(restrictionData.items); setAudit(auditData); setBoards(boardData.items);
    } catch (error) { api.error(error instanceof Error ? error.message : '论坛治理数据加载失败'); }
    finally { setLoading(false); }
  }, [api, type]);
  useEffect(() => { void load(); }, [load]);

  const openPreview = async (item: ForumModerationItem) => {
    try { setPreview(await adminApi.forumPreview(item.type, item.id)); }
    catch (error) { api.error(error instanceof Error ? error.message : '预览失败'); }
  };
  const openReason = (target: ReasonTarget) => { setReasonTarget(target); setReason(''); };
  const executeReason = async () => {
    if (!reasonTarget || reason.trim().length < 2) { api.warning('原因至少填写 2 个字'); return; }
    const target = reasonTarget; const value = reason.trim();
    try {
      if (target.action === 'approve') await adminApi.approveForumContent(target.type!, target.id, value);
      if (target.action === 'reject') await adminApi.rejectForumContent(target.type!, target.id, value);
      if (target.action === 'retry') await adminApi.retryForumContent(target.type!, target.id, value);
      if (target.action === 'offline') await adminApi.offlineForumContent(target.type!, target.id, value);
      if (target.action === 'report_offline') await adminApi.handleReport(target.id, 'offline', value);
      if (target.action === 'report_ignore') await adminApi.handleReport(target.id, 'ignore', value);
      if (target.action === 'board') await adminApi.setForumBoardStatus(target.id, target.nextStatus!, value);
      if (target.action === 'unmute') await adminApi.unrestrictForumUser(target.userId!, target.id, value);
      api.success('操作完成，审计记录已追加'); setReasonTarget(undefined); setPreview(undefined); await load();
    } catch (error) { api.error(error instanceof Error ? error.message : '操作失败'); }
  };
  const openMute = (user: { id: string; nickname: string }) => {
    const end = new Date(Date.now() + 7 * 86_400_000); setMuteUser(user); setMuteReason(''); setMuteEnd(end.toISOString().slice(0, 16));
  };
  const executeMute = async () => {
    if (!muteUser || muteReason.trim().length < 2 || !muteEnd) { api.warning('请填写禁言截止时间和原因'); return; }
    try { await adminApi.restrictForumUser(muteUser.id, { ends_at: new Date(muteEnd).toISOString(), reason: muteReason.trim() }); api.success('禁言已即时生效并写入审计'); setMuteUser(undefined); await load(); }
    catch (error) { api.error(error instanceof Error ? error.message : '禁言失败'); }
  };

  const moderationColumns = [
    { title: '类型', dataIndex: 'type', width: 80, render: (value: ForumContentType) => value === 'post' ? '帖子' : '回复' },
    { title: '内容', key: 'content', render: (_: unknown, item: ForumModerationItem) => <Space direction="vertical" size={2}><Typography.Text strong>{item.title || item.post?.title || '回复'}</Typography.Text><Typography.Text type="secondary" ellipsis style={{ maxWidth: 360 }}>{item.content_preview}</Typography.Text></Space> },
    { title: '作者', key: 'author', render: (_: unknown, item: ForumModerationItem) => <Space direction="vertical" size={2}><span>{item.author.nickname}</span><Typography.Text type="secondary">ID {item.author.id}</Typography.Text></Space> },
    { title: '审核信息', key: 'moderation', render: (_: unknown, item: ForumModerationItem) => <Space direction="vertical" size={2}><span>尝试 {item.attempts}/3</span>{item.error_code ? <Tag color="error">{item.error_code}</Tag> : <Tag color="warning">等待审核</Tag>}</Space> },
    { title: '提交时间', dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString() },
    { title: '操作', key: 'actions', width: 310, render: (_: unknown, item: ForumModerationItem) => <Space wrap><Button size="small" onClick={() => void openPreview(item)}>预览</Button><Button size="small" type="primary" onClick={() => openReason({ action: 'approve', id: item.id, type: item.type })}>通过</Button><Button size="small" danger onClick={() => openReason({ action: 'reject', id: item.id, type: item.type })}>驳回</Button>{item.error_code ? <Button size="small" onClick={() => openReason({ action: 'retry', id: item.id, type: item.type })}>补偿重试</Button> : null}<Button size="small" onClick={() => openMute(item.author)}>禁言</Button></Space> },
  ];
  const reportColumns = [
    { title: '对象', key: 'target', render: (_: unknown, item: ReportItem) => `${item.content_type} #${item.content_id || '-'}` },
    { title: '举报人', key: 'reporter', render: (_: unknown, item: ReportItem) => item.reporter.nickname },
    { title: '原因', key: 'reason', render: (_: unknown, item: ReportItem) => <Space direction="vertical"><span>原因码 {item.reason}</span><Typography.Text type="secondary">{item.description || '无补充说明'}</Typography.Text></Space> },
    { title: '证据快照', dataIndex: 'evidence_snapshot', render: (value: unknown) => <Typography.Text code>{value ? JSON.stringify(value) : '—'}</Typography.Text> },
    { title: '时间', dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString() },
    { title: '操作', key: 'actions', render: (_: unknown, item: ReportItem) => <Space><Button size="small" danger onClick={() => openReason({ action: 'report_offline', id: item.id })}>下架对象</Button><Button size="small" onClick={() => item.reported_user && openMute(item.reported_user)}>禁言用户</Button><Button size="small" onClick={() => openReason({ action: 'report_ignore', id: item.id })}>忽略</Button></Space> },
  ];
  const restrictionColumns = [
    { title: '用户', key: 'user', render: (_: unknown, item: ForumRestrictionItem) => `${item.user.nickname} (#${item.user.id})` },
    { title: '原因', dataIndex: 'reason' }, { title: '开始', dataIndex: 'starts_at', render: (value: string) => new Date(value).toLocaleString() },
    { title: '截止', dataIndex: 'ends_at', render: (value: string) => new Date(value).toLocaleString() }, { title: '创建人', key: 'creator', render: (_: unknown, item: ForumRestrictionItem) => item.creator.username },
    { title: '操作', key: 'actions', render: (_: unknown, item: ForumRestrictionItem) => <Button size="small" onClick={() => openReason({ action: 'unmute', id: item.id, userId: item.user.id })}>解除禁言</Button> },
  ];
  const auditColumns = [
    { title: '时间', dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString() }, { title: '管理员', key: 'admin', render: (_: unknown, item: ForumAuditItem) => item.admin.username },
    { title: '动作', dataIndex: 'action' }, { title: '对象', key: 'object', render: (_: unknown, item: ForumAuditItem) => `${item.object_type} #${item.object_id}` },
    { title: '原因', dataIndex: 'reason' }, { title: 'request_id', dataIndex: 'request_id', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
  ];
  const boardColumns = [
    { title: '板块', dataIndex: 'name' }, { title: '说明', dataIndex: 'description' }, { title: '排序', dataIndex: 'sort_order' },
    { title: '状态', dataIndex: 'status', render: (value: number) => <Tag color={value === 1 ? 'success' : 'default'}>{value === 1 ? '开放' : '关闭'}</Tag> },
    { title: '操作', key: 'actions', render: (_: unknown, item: ForumBoardItem) => <Button danger={item.status === 1} onClick={() => openReason({ action: 'board', id: item.id, nextStatus: item.status === 1 ? 0 : 1 })}>{item.status === 1 ? '关闭板块' : '恢复板块'}</Button> },
  ];

  return <div><>{contextHolder}</><Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}><div><Typography.Title level={2} style={{ margin: 0 }}>论坛治理</Typography.Title><Typography.Text type="secondary">待审、举报和审核异常分队列处理；所有高风险操作必须填写原因。</Typography.Text></div><Space><Select allowClear placeholder="全部内容类型" value={type} onChange={setType} options={[{ value: 'post', label: '帖子' }, { value: 'reply', label: '回复' }]} /><Button onClick={() => void load()} loading={loading}>刷新</Button></Space></Space>
    {errors?.counts.errors ? <Alert type="warning" showIcon message={`存在 ${errors.counts.errors} 条审核异常；异常内容仍为 PENDING，不会公开。`} style={{ marginBottom: 16 }} /> : null}
    <Tabs items={[
      { key: 'pending', label: <Badge count={pending?.counts.pending || 0} offset={[12, 0]}>待审内容</Badge>, children: <Table rowKey={(item) => `${item.type}-${item.id}`} loading={loading} dataSource={pending?.list || []} columns={moderationColumns} pagination={false} /> },
      { key: 'errors', label: <Badge count={errors?.counts.errors || 0} offset={[12, 0]}>审核异常</Badge>, children: <><Alert type="info" message={`进程指标：尝试 ${errors?.metrics.attempts || 0}，通过 ${errors?.metrics.passed || 0}，驳回 ${errors?.metrics.rejected || 0}，失败 ${errors?.metrics.failed || 0}`} style={{ marginBottom: 12 }} /><Table rowKey={(item) => `${item.type}-${item.id}`} loading={loading} dataSource={errors?.list || []} columns={moderationColumns} pagination={false} /></> },
      { key: 'reports', label: <Badge count={reports?.pagination.total || 0} offset={[12, 0]}>用户举报</Badge>, children: <Table rowKey="id" loading={loading} dataSource={reports?.list || []} columns={reportColumns} pagination={false} /> },
      { key: 'restrictions', label: '禁言管理', children: <Table rowKey="id" loading={loading} dataSource={restrictions} columns={restrictionColumns} pagination={false} /> },
      { key: 'boards', label: '板块状态', children: <Table rowKey="id" loading={loading} dataSource={boards} columns={boardColumns} pagination={false} /> },
      { key: 'audit', label: '审计记录', children: <Table rowKey="id" loading={loading} dataSource={audit?.list || []} columns={auditColumns} pagination={false} scroll={{ x: 1100 }} /> },
    ]} />
    <Drawer open={Boolean(preview)} onClose={() => setPreview(undefined)} width={680} title="内容预览（纯文本安全渲染）" extra={preview ? <Space><Button type="primary" onClick={() => openReason({ action: 'approve', id: preview.id, type: preview.type })}>通过</Button><Button danger onClick={() => openReason({ action: preview.moderation_status === 1 ? 'offline' : 'reject', id: preview.id, type: preview.type })}>{preview.moderation_status === 1 ? '下架' : '驳回'}</Button></Space> : null}>{preview ? <Space direction="vertical" size="large" style={{ width: '100%' }}><Descriptions column={2} items={[{ key: 'type', label: '类型', children: preview.type }, { key: 'state', label: '状态', children: moderationNames[preview.moderation_status as 0 | 1 | 2] }, { key: 'author', label: '作者', children: preview.author.nickname }, { key: 'attempts', label: '审核次数', children: `${preview.attempts}/3` }]} /><Typography.Title level={4}>{preview.title || preview.post?.title || '回复内容'}</Typography.Title><Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{preview.content}</Typography.Paragraph>{preview.images?.length ? <Image.PreviewGroup>{preview.images.map((image) => <Image key={image.id} width={140} src={image.url} />)}</Image.PreviewGroup> : null}{preview.error_code ? <Alert type="warning" message={`审核异常：${preview.error_code}`} /> : null}</Space> : null}</Drawer>
    <Modal open={Boolean(reasonTarget)} title="二次确认并填写操作原因" okText="确认执行" okButtonProps={{ danger: ['reject', 'offline', 'report_offline', 'board'].includes(reasonTarget?.action || '') }} onOk={() => void executeReason()} onCancel={() => setReasonTarget(undefined)}><Alert type="warning" message="操作将立即生效并追加不可由普通接口删除的管理员审计记录。" style={{ marginBottom: 16 }} /><Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} placeholder="必填：说明判断依据或处置原因" showCount /></Modal>
    <Modal open={Boolean(muteUser)} title={`禁言 ${muteUser?.nickname || ''}`} okText="确认禁言" okButtonProps={{ danger: true }} onOk={() => void executeMute()} onCancel={() => setMuteUser(undefined)}><Space direction="vertical" style={{ width: '100%' }}><label>禁言截止时间</label><Input type="datetime-local" value={muteEnd} onChange={(event) => setMuteEnd(event.target.value)} /><label>原因（必填）</label><Input.TextArea value={muteReason} onChange={(event) => setMuteReason(event.target.value)} maxLength={500} rows={4} showCount /></Space></Modal>
  </div>;
}
