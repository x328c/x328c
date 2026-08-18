import { DeleteOutlined, EyeOutlined, StopOutlined } from '@ant-design/icons';
import { Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth-store';
import type { ContentItem } from '../types';

const statusMap: Record<number, { text: string; color: string }> = { 0: { text: '已取消', color: 'default' }, 1: { text: '报名中', color: 'green' }, 2: { text: '即将开始', color: 'orange' }, 3: { text: '进行中', color: 'blue' }, 4: { text: '已结束', color: 'default' }, 5: { text: '已下架', color: 'red' } };
export function RidesPage() {
  const [form] = Form.useForm(); const [items, setItems] = useState<ContentItem[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [selected, setSelected] = useState<ContentItem>(); const [loading, setLoading] = useState(false); const role = useAuthStore((state) => state.admin?.role);
  const load = useCallback(async (next = 1) => { setLoading(true); try { const values = form.getFieldsValue(); const range = values.range as [dayjs.Dayjs, dayjs.Dayjs] | undefined; const result = await adminApi.rides({ page: next, pageSize: 20, keyword: values.keyword || undefined, status: values.status, start_time: range?.[0]?.startOf('day').toISOString(), end_time: range?.[1]?.endOf('day').toISOString() }); setItems(result.list); setTotal(result.pagination.total); setPage(next); } finally { setLoading(false); } }, [form]);
  useEffect(() => { void load(1); }, [load]);
  const offline = async (id: string) => { await adminApi.offlineRide(id); message.success('已下架'); void load(); };
  const remove = async (id: string) => { await adminApi.deleteRide(id); message.success('已删除'); void load(); };
  const columns: ColumnsType<ContentItem> = [
    { title: 'ID', dataIndex: 'id', width: 90 }, { title: '标题', dataIndex: 'title', ellipsis: true }, { title: '发起人', render: (_, row) => row.creator.nickname },
    { title: '状态', dataIndex: 'status', render: (value: number) => <Tag color={statusMap[value]?.color}>{statusMap[value]?.text || value}</Tag> },
    { title: '待复审', dataIndex: 'audit_status', render: (value?: number) => value === 0 ? <Tag color="gold">待复审</Tag> : '-' },
    { title: '报名人数', render: (_, row) => row.join_count ?? 0 }, { title: '出发时间', render: (_, row) => row.departure_time ? dayjs(row.departure_time).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '发布时间', dataIndex: 'created_at', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '操作', width: 190, render: (_, row) => <Space size="small"><Button type="link" icon={<EyeOutlined />} onClick={() => setSelected(row)}>查看</Button><Popconfirm title="确定下架该内容？" onConfirm={() => void offline(row.id)}><Button type="link" danger icon={<StopOutlined />}>下架</Button></Popconfirm>{role === 9 ? <Popconfirm title="删除不可恢复，确定继续？" onConfirm={() => void remove(row.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null}</Space> },
  ];
  return <><Form form={form} layout="inline" className="filter-bar" onFinish={() => void load(1)}><Form.Item name="keyword"><Input allowClear placeholder="标题 / 发起人" /></Form.Item><Form.Item name="status"><Select allowClear placeholder="全部状态" style={{ width: 128 }} options={Object.entries(statusMap).map(([value, item]) => ({ value: Number(value), label: item.text }))} /></Form.Item><Form.Item name="range"><DatePicker.RangePicker /></Form.Item><Button type="primary" htmlType="submit">查询</Button><Button onClick={() => { form.resetFields(); void load(1); }}>重置</Button></Form><Table className="page-card" rowKey="id" loading={loading} columns={columns} dataSource={items} pagination={{ current: page, total, pageSize: 20, onChange: (next) => void load(next) }} /><Modal open={Boolean(selected)} title="约骑详情" footer={null} onCancel={() => setSelected(undefined)}><pre className="detail-json">{JSON.stringify(selected, null, 2)}</pre></Modal></>;
}
