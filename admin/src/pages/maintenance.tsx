import { Alert, Button, Card, Input, Space, Statistic, Table, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import type { MetricsSnapshot, TaskFailureItem } from '../types';

export function MaintenancePage() {
  const [metrics, setMetrics] = useState<MetricsSnapshot>();
  const [failures, setFailures] = useState<TaskFailureItem[]>([]);
  const [note, setNote] = useState('');
  const load = async () => { const [nextMetrics, nextFailures] = await Promise.all([adminApi.metrics(), adminApi.taskFailures({ status: 0 })]); setMetrics(nextMetrics); setFailures(nextFailures.list); };
  useEffect(() => { void load(); }, []);
  const reconcile = async () => { if (note.trim().length < 2) { message.error('请填写操作说明'); return; } const result = await adminApi.reconcileCounters(note.trim()); message.success(`对账完成，修正 ${result.total} 条记录`); await load(); };
  return <Space direction="vertical" size={16} style={{ width: '100%' }}>
    <Typography.Title level={3}>集成运维</Typography.Title>
    <Alert type="info" message="仅用于监控、计数对账和失败任务补偿；所有补偿操作都会追加管理员审计记录。" />
    <Card title="API 运行指标"><Space wrap>{(metrics?.api || []).slice(0, 8).map((item) => <Statistic key={item.route} title={item.route} value={`${item.p95_ms} ms`} suffix={`错误率 ${(item.error_rate * 100).toFixed(2)}%`} />)}</Space></Card>
    <Card title="计数对账"><Space><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="操作说明（必填）" maxLength={500} /><Button type="primary" onClick={() => void reconcile()}>执行对账</Button></Space></Card>
    <Card title="失败任务人工补偿"><Table rowKey="id" dataSource={failures} pagination={false} columns={[{ title: '任务', dataIndex: 'task_key' }, { title: '错误码', dataIndex: 'last_error_code' }, { title: '尝试次数', dataIndex: 'attempts' }, { title: '最近失败', dataIndex: 'last_failed_at' }, { title: '操作', render: (_: unknown, row: TaskFailureItem) => <Space><Button onClick={async () => { await adminApi.retryTaskFailure(row.id); message.success('已请求重试'); await load(); }}>重试</Button><Button danger onClick={async () => { if (note.trim().length < 2) { message.error('请先填写操作说明'); return; } await adminApi.resolveTaskFailure(row.id, note.trim()); message.success('已记录人工补偿'); await load(); }}>结案</Button></Space> }]} /></Card>
  </Space>;
}
