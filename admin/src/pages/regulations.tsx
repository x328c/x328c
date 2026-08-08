import { CheckOutlined, CloudUploadOutlined, EditOutlined, EyeOutlined, FileDoneOutlined, PlusOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth-store';
import type { RegulationFeedbackItem, RegulationImportListItem, RegulationImportTask, RegulationItem, RegulationPayload, RegulationStatus } from '../types';

const statusMap: Record<RegulationStatus, { text: string; color: string }> = {
  0: { text: '草稿', color: 'default' }, 1: { text: '待复核', color: 'orange' },
  2: { text: '现行有效', color: 'green' }, 3: { text: '已失效', color: 'default' },
  4: { text: '已替代', color: 'blue' }, 5: { text: '已下架', color: 'red' },
};
const revisionStatus = ['草稿', '待复核', '已通过', '已发布'];
const categories = [
  { value: 'city_policy', label: '城市政策' }, { value: 'license', label: '驾驶证' },
  { value: 'vehicle', label: '车辆管理' }, { value: 'traffic', label: '交通规则' },
];
const authorities = [
  { value: 'law', label: '法律' }, { value: 'administrative', label: '行政法规' },
  { value: 'departmental', label: '部门规章' }, { value: 'local', label: '地方规定' },
];

type RegulationForm = Omit<RegulationPayload, 'regions' | 'tags'> & { regions_text?: string; tags_text?: string };
const defaults: RegulationForm = { title: '', issuer: '', authority_level: 'local', category: 'traffic', scope: 'REGIONAL', source_url: '', summary: '', content: '', change_note: '', review_cycle_days: 30 };

function fromItem(item?: RegulationItem): RegulationForm {
  if (!item) return defaults;
  const draft = item.latest_revision?.source_snapshot;
  return {
    title: draft?.title ?? item.title, document_no: draft?.document_no ?? item.document_no ?? undefined,
    document_no_empty_reason: draft?.document_no_empty_reason ?? item.document_no_empty_reason ?? undefined,
    issuer: draft?.issuer ?? item.issuer, authority_level: draft?.authority_level ?? item.authority_level,
    category: draft?.category ?? item.category, scope: draft?.scope ?? item.scope,
    regions_text: (draft?.regions ?? item.regions).map((region) => `${region.region_code}:${region.region_name}`).join('\n'),
    tags_text: (draft?.tags ?? item.tags).join('|'), source_url: draft?.source_url ?? item.source_url,
    published_at: draft?.published_at ?? item.published_at ?? undefined, effective_at: draft?.effective_at ?? item.effective_at ?? undefined,
    expired_at: draft?.expired_at ?? item.expired_at ?? undefined, effective_note: draft?.effective_note ?? item.effective_note ?? undefined,
    last_verified_at: draft?.last_verified_at ?? item.last_verified_at ?? undefined,
    review_cycle_days: draft?.review_cycle_days ?? item.review_cycle_days,
    replacement_regulation_id: draft?.replacement_regulation_id ?? item.replacement_regulation_id ?? undefined,
    summary: item.latest_revision?.summary ?? '', content: item.latest_revision?.content ?? '',
    change_note: item.latest_revision?.change_note ?? '修订法规信息',
  };
}

function payload(values: RegulationForm): RegulationPayload {
  const regions = values.regions_text?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [region_code, ...rest] = line.split(':'); return { region_code, region_name: rest.join(':') };
  }) ?? [];
  return { ...values, title: values.title.trim(), issuer: values.issuer.trim(), source_url: values.source_url?.trim() || undefined, summary: values.summary.trim(), content: values.content, change_note: values.change_note.trim(), regions, tags: values.tags_text?.split('|').map((tag) => tag.trim()).filter(Boolean) ?? [] };
}

function reasonAction(title: string, action: (reason: string) => Promise<void>, options?: { danger?: boolean; extra?: React.ReactNode }) {
  let reason = '';
  Modal.confirm({ title, content: <Space direction="vertical" style={{ width: '100%' }}>{options?.extra}<Input.TextArea autoFocus rows={3} maxLength={500} showCount placeholder="操作原因（必填）" onChange={(event) => { reason = event.target.value; }} /></Space>, okButtonProps: { danger: options?.danger }, onOk: async () => {
    if (reason.trim().length < 2) { message.error('请填写至少 2 个字的原因'); throw new Error('reason required'); }
    await action(reason.trim());
  } });
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File>(); const [task, setTask] = useState<RegulationImportTask>(); const [loading, setLoading] = useState(false); const [tasks, setTasks] = useState<RegulationImportListItem[]>([]);
  const loadTasks = useCallback(() => { void adminApi.regulationImports({ page: 1, pageSize: 20 }).then((result) => setTasks(result.list)); }, []);
  useEffect(loadTasks, [loadTasks]);
  const preview = async () => {
    if (!file) return message.warning('请选择 CSV 文件'); setLoading(true);
    try { setTask(await adminApi.previewRegulationImport(file, crypto.randomUUID())); }
    finally { setLoading(false); }
  };
  const confirm = () => task && reasonAction('确认将校验通过的行导入为草稿？', async (reason) => {
    const result = await adminApi.confirmRegulationImport(task.id, reason); message.success(`已导入 ${result.imported_count} 条草稿`); onImported(); loadTasks();
    setTask({ ...task, status: 1, imported_count: result.imported_count });
  });
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    <Alert showIcon type="info" message="CSV 仅导入草稿" description="流程固定为上传、字段/重复校验、预览、确认；不能通过 CSV 直接发布。限制 2MB、500 行。列名模板见项目验收文档。" />
    <Upload.Dragger accept=".csv,text/csv" maxCount={1} beforeUpload={(next) => { setFile(next); setTask(undefined); return false; }} onRemove={() => { setFile(undefined); setTask(undefined); }}><CloudUploadOutlined /><p>选择 CSV 文件</p></Upload.Dragger>
    <Button type="primary" loading={loading} disabled={!file} onClick={() => void preview()}>校验并预览</Button>
    {task ? <><Descriptions bordered items={[
      { key: 'file', label: '文件', children: task.original_filename }, { key: 'rows', label: '总行数', children: task.total_rows },
      { key: 'valid', label: '有效', children: task.valid_rows }, { key: 'errors', label: '错误', children: task.error_rows },
      { key: 'dup', label: '重复任务', children: task.duplicate ? '是（未重复创建）' : '否' },
    ]} /><Table rowKey="row_number" pagination={{ pageSize: 10 }} dataSource={task.rows} columns={[
      { title: 'CSV 行', dataIndex: 'row_number', width: 90 }, { title: '标题', render: (_, row) => row.payload.title || '-' },
      { title: '文号', render: (_, row) => row.payload.document_no || row.payload.document_no_empty_reason || '-' },
      { title: '校验结果', render: (_, row) => row.errors?.length ? <Typography.Text type="danger">{row.errors.join('；')}</Typography.Text> : <Tag color="green">通过</Tag> },
    ]} />
    <Button type="primary" icon={<FileDoneOutlined />} disabled={Boolean(task.error_rows) || task.status === 1} onClick={confirm}>确认导入草稿</Button></> : null}
    <Typography.Title level={5}>最近导入任务</Typography.Title><Table rowKey="id" pagination={false} dataSource={tasks} columns={[
      { title: '任务', dataIndex: 'id' }, { title: '文件', dataIndex: 'original_filename' }, { title: '有效/错误', render: (_, row) => `${row.valid_rows}/${row.error_rows}` },
      { title: '状态', dataIndex: 'status', render: (value) => ['待确认', '已导入', '校验失败'][value] || value }, { title: '导入数', dataIndex: 'imported_count' },
      { title: '创建时间', dataIndex: 'created_at', render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    ]} />
  </Space>;
}

function FeedbackPanel() {
  const [items, setItems] = useState<RegulationFeedbackItem[]>([]); const [loading, setLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setItems((await adminApi.regulationFeedbacks({ page: 1, pageSize: 50 })).list); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <Table rowKey="id" loading={loading} dataSource={items} columns={[
    { title: '法规', render: (_, row) => row.regulation.title }, { title: '反馈类型', dataIndex: 'type', render: (value) => ({ content_error: '内容错误', expired: '疑似过期', link_broken: '链接失效' }[value as string] || value) },
    { title: '反馈人', render: (_, row) => row.user.nickname }, { title: '说明', dataIndex: 'description', render: (value) => value || '-' },
    { title: '来源地址', render: (_, row) => row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">查看保留地址</a> : '-' },
    { title: '时间', dataIndex: 'created_at', render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '状态', dataIndex: 'status', render: (value) => value === 0 ? <Tag color="orange">待处理</Tag> : <Tag color="green">已处理</Tag> },
    { title: '操作', render: (_, row) => row.status === 0 ? <Button type="link" onClick={() => reasonAction('确认完成纠错处理？', async (reason) => { await adminApi.resolveRegulationFeedback(row.id, reason); message.success('反馈已处理'); await load(); })}>标记已处理</Button> : null },
  ]} />;
}

export function RegulationsPage() {
  const [filter] = Form.useForm(); const [editor] = Form.useForm<RegulationForm>();
  const [items, setItems] = useState<RegulationItem[]>([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false); const [disabled, setDisabled] = useState(false);
  const [editing, setEditing] = useState<RegulationItem | null>(); const [preview, setPreview] = useState<RegulationItem>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const role = useAuthStore((state) => state.admin?.role);
  const canManage = role === 1 || role === 9; const canReview = role === 2 || role === 9;
  const load = useCallback(async (next = 1) => { setLoading(true); try { const data = await adminApi.regulations({ page: next, pageSize: 20, ...filter.getFieldsValue() }); setItems(data.list); setTotal(data.pagination.total); setPage(next); setDisabled(false); } catch (error) { if (axios.isAxiosError(error) && error.response?.data?.code === 52001) setDisabled(true); } finally { setLoading(false); } }, [filter]);
  useEffect(() => { void load(); }, [load]);
  const open = async (item?: RegulationItem) => {
    const detail = item ? await adminApi.regulation(item.id) : undefined; setEditing(detail ?? null); editor.setFieldsValue(fromItem(detail));
  };
  const save = async () => { const values = payload(await editor.validateFields()); if (editing) await adminApi.updateRegulation(editing.id, values); else await adminApi.createRegulation(values); message.success(editing ? '修订草稿已保存' : '法规草稿已创建'); setEditing(undefined); editor.resetFields(); await load(); };
  const act = (title: string, call: (reason: string) => Promise<unknown>, success: string, danger = false) => reasonAction(title, async (reason) => { await call(reason); message.success(success); await load(page); }, { danger });
  const batchAct = (kind: 'submit' | 'review' | 'publish') => {
    const count = selectedIds.length;
    const label = kind === 'submit' ? '提交复核' : kind === 'review' ? '复核通过' : '发布';
    reasonAction(`确认批量${label} ${count} 条法规？`, async (reason) => {
      const result = kind === 'submit'
        ? await adminApi.batchSubmitRegulationReview(selectedIds, reason)
        : kind === 'review'
          ? await adminApi.batchReviewRegulations(selectedIds, reason)
          : await adminApi.batchPublishRegulations(selectedIds, reason);
      message.success(`已批量${label} ${result.count} 条法规`);
      setSelectedIds([]);
      await load(page);
    }, {
      danger: kind === 'publish',
      extra: <Alert showIcon type={kind === 'publish' ? 'warning' : 'info'} message="整批事务执行" description={kind === 'review' ? '最多 100 条；所有修订必须处于待复核状态，且当前账号不能是其中任一修订的录入人，否则整批取消。' : '最多 100 条；任一条不存在、状态不符或发布字段不完整时，整批取消且不产生部分结果。'} />,
    });
  };
  const replace = (row: RegulationItem) => { let replacement = ''; let reason = ''; Modal.confirm({ title: '确认标记为已替代？', content: <Space direction="vertical" style={{ width: '100%' }}><Input placeholder="替代法规 ID（必填）" onChange={(event) => { replacement = event.target.value; }} /><Input.TextArea placeholder="操作原因（必填）" onChange={(event) => { reason = event.target.value; }} /></Space>, onOk: async () => { if (!/^\d+$/.test(replacement) || reason.trim().length < 2) { message.error('请填写有效替代法规 ID 和原因'); throw new Error('invalid replacement'); } await adminApi.replaceRegulation(row.id, { replacement_regulation_id: replacement, reason: reason.trim() }); message.success('已标记替代'); await load(page); } }); };
  const columns: ColumnsType<RegulationItem> = [
    { title: '标题', dataIndex: 'title', ellipsis: true }, { title: '文号', render: (_, row) => row.document_no || '无文号' },
    { title: '机构', dataIndex: 'issuer', ellipsis: true }, { title: '分类', dataIndex: 'category', render: (value) => categories.find((item) => item.value === value)?.label ?? value },
    { title: '范围', render: (_, row) => row.scope === 'NATIONAL' ? '全国' : row.regions.map((region) => region.region_name).join('、') || '待填写' },
    { title: '状态', dataIndex: 'status', render: (status: RegulationStatus) => <Tag color={statusMap[status].color}>{statusMap[status].text}</Tag> },
    { title: '当前/最新版本', render: (_, row) => `${row.current_revision_id ? '已发布' : '未发布'} / v${row.latest_revision?.version ?? '-'}` },
    { title: '更新时间', dataIndex: 'updated_at', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '操作', width: 360, fixed: 'right', render: (_, row) => <Space size="small" wrap>
      <Button type="link" icon={<EyeOutlined />} onClick={() => void adminApi.regulation(row.id).then(setPreview)}>预览</Button>
      {canManage ? <Button type="link" icon={<EditOutlined />} onClick={() => void open(row)}>编辑/修订</Button> : null}
      {canManage && row.latest_revision?.status === 0 ? <Button type="link" onClick={() => act('提交复核？', (reason) => adminApi.submitRegulationReview(row.id, reason), '已提交复核')}>提交复核</Button> : null}
      {canReview && row.latest_revision?.status === 1 ? <Button type="link" icon={<CheckOutlined />} onClick={() => act('确认复核通过？', (reason) => adminApi.reviewRegulation(row.id, reason), '复核已通过')}>复核通过</Button> : null}
      {row.latest_revision?.status === 2 && role === 9 ? <Button type="link" icon={<RocketOutlined />} onClick={() => act('确认发布该修订？', (reason) => adminApi.publishRegulation(row.id, reason), '法规已发布')}>发布</Button> : null}
      {canManage && row.status === 2 ? <Button type="link" onClick={() => act('确认标记失效？', (reason) => adminApi.expireRegulation(row.id, { reason }), '已标记失效')}>失效</Button> : null}
      {canManage && row.status === 2 ? <Button type="link" onClick={() => replace(row)}>已替代</Button> : null}
      {canManage && [2, 3, 4].includes(row.status) ? <Button type="link" danger icon={<StopOutlined />} onClick={() => act('确认下架？', (reason) => adminApi.offlineRegulation(row.id, reason), '法规已下架', true)}>下架</Button> : null}
    </Space> },
  ];
  if (disabled) return <Alert type="warning" showIcon message="法规功能已关闭" description="服务端 regulation.enabled 当前为 false；路线与约骑不受影响。" />;
  return <><Tabs items={[
    { key: 'content', label: '法规内容', children: <>
      <Form form={filter} layout="inline" className="filter-bar" onFinish={() => void load(1)}><Form.Item name="keyword"><Input allowClear placeholder="标题 / 文号 / 机构" /></Form.Item><Form.Item name="status"><Select allowClear placeholder="全部状态" style={{ width: 130 }} options={Object.entries(statusMap).map(([value, item]) => ({ value: Number(value), label: item.text }))} /></Form.Item><Form.Item name="category"><Select allowClear placeholder="全部分类" style={{ width: 130 }} options={categories} /></Form.Item><Button type="primary" htmlType="submit">查询</Button><Button onClick={() => { filter.resetFields(); void load(); }}>重置</Button>{canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => void open()}>新建草稿</Button> : null}</Form>
      {canManage || canReview ? <Alert className="page-card" showIcon type="info" message={`批量工作流：已选择 ${selectedIds.length} 条`} description={<Space wrap><Typography.Text>可跨分页选择，单次最多 100 条。批量提交仅接受草稿；批量复核仅接受待复核且非本人录入的修订；批量发布仅超级管理员可执行。</Typography.Text>{canManage ? <Button icon={<FileDoneOutlined />} disabled={!selectedIds.length} onClick={() => batchAct('submit')}>批量提交复核</Button> : null}{canReview ? <Button type="primary" icon={<CheckOutlined />} disabled={!selectedIds.length} onClick={() => batchAct('review')}>批量复核通过</Button> : null}{role === 9 ? <Button danger icon={<RocketOutlined />} disabled={!selectedIds.length} onClick={() => batchAct('publish')}>批量发布</Button> : null}<Button disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>清空选择</Button></Space>} /> : null}
      <Table className="page-card" rowKey="id" rowSelection={canManage || canReview ? { selectedRowKeys: selectedIds, preserveSelectedRowKeys: true, onChange: (keys) => setSelectedIds(keys.map(String)) } : undefined} loading={loading} columns={columns} dataSource={items} scroll={{ x: 1500 }} pagination={{ current: page, pageSize: 20, total, onChange: (next) => void load(next) }} />
    </> },
    ...(canManage ? [
      { key: 'import', label: 'CSV 导入', children: <ImportPanel onImported={() => void load()} /> },
      { key: 'feedback', label: '纠错反馈', children: <FeedbackPanel /> },
    ] : []),
  ]} />
  <Modal open={editing !== undefined} width={920} title={editing ? `编辑/修订：${editing.title}` : '新建法规草稿'} okText="保存草稿" onOk={() => void save()} onCancel={() => { setEditing(undefined); editor.resetFields(); }} destroyOnHidden>
    {editing?.current_revision_id ? <Alert showIcon type="warning" message="已发布正文不会被原地覆盖；保存将编辑现有草稿或创建下一版修订。" /> : null}
    <Form form={editor} layout="vertical" initialValues={defaults}>
      <Space wrap align="start" style={{ width: '100%' }}>
        <Form.Item label="标题" name="title" rules={[{ required: true }, { min: 2 }, { max: 200 }]}><Input style={{ width: 420 }} /></Form.Item>
        <Form.Item label="文号" name="document_no"><Input style={{ width: 240 }} maxLength={100} /></Form.Item>
        <Form.Item label="无文号理由" name="document_no_empty_reason"><Input style={{ width: 240 }} maxLength={200} /></Form.Item>
        <Form.Item label="发布机构" name="issuer" rules={[{ required: true }, { max: 150 }]}><Input style={{ width: 280 }} /></Form.Item>
        <Form.Item label="效力层级" name="authority_level" rules={[{ required: true }]}><Select style={{ width: 160 }} options={authorities} /></Form.Item>
        <Form.Item label="分类" name="category" rules={[{ required: true }]}><Select style={{ width: 160 }} options={categories} /></Form.Item>
        <Form.Item label="适用范围" name="scope" rules={[{ required: true }]}><Select style={{ width: 140 }} options={[{ value: 'NATIONAL', label: '全国' }, { value: 'REGIONAL', label: '地方' }]} /></Form.Item>
        <Form.Item label="复核周期（天）" name="review_cycle_days" rules={[{ required: true }]}><InputNumber min={1} max={3650} /></Form.Item>
      </Space>
      <Form.Item label="适用地区（每行 6 位地区码:名称；全国 scope 必须留空）" name="regions_text"><Input.TextArea rows={2} placeholder="330100:杭州市" /></Form.Item>
      <Form.Item label="标签（| 分隔，最多 12 个）" name="tags_text"><Input placeholder="驾驶证|摩托车|交通规则" /></Form.Item>
      <Form.Item label="官方来源 URL（草稿可空，发布前必填）" name="source_url" rules={[{ type: 'url' }]}><Input maxLength={1000} /></Form.Item>
      <Space wrap align="start"><Form.Item label="发布日期（ISO）" name="published_at"><Input placeholder="2026-01-01" /></Form.Item><Form.Item label="生效日期（ISO）" name="effective_at"><Input placeholder="2026-02-01" /></Form.Item><Form.Item label="失效日期（ISO）" name="expired_at"><Input placeholder="可空" /></Form.Item><Form.Item label="最后复核时间（ISO）" name="last_verified_at"><Input placeholder="2026-08-01" /></Form.Item></Space>
      <Form.Item label="生效说明（无明确日期时必填）" name="effective_note"><Input maxLength={300} /></Form.Item>
      <Form.Item label="替代法规 ID" name="replacement_regulation_id"><Input /></Form.Item>
      <Form.Item label="摘要" name="summary" rules={[{ required: true }, { max: 1000 }]}><Input.TextArea rows={3} showCount maxLength={1000} /></Form.Item>
      <Form.Item label="正文" name="content" rules={[{ required: true }]}><Input.TextArea rows={10} showCount maxLength={100000} /></Form.Item>
      <Form.Item label="修订说明" name="change_note" rules={[{ required: true }, { min: 2 }, { max: 500 }]}><Input.TextArea rows={2} showCount maxLength={500} /></Form.Item>
    </Form>
  </Modal>
  <Modal open={Boolean(preview)} width={820} title="法规预览与修订历史" footer={null} onCancel={() => setPreview(undefined)}>
    {preview ? <Space direction="vertical" style={{ width: '100%' }}>
      <Descriptions bordered column={2} items={[
        { key: 'status', label: '状态', children: statusMap[preview.status].text }, { key: 'scope', label: '适用范围', children: preview.scope === 'NATIONAL' ? '全国' : preview.regions.map((item) => item.region_name).join('、') },
        { key: 'issuer', label: '发布机构', children: preview.issuer }, { key: 'document', label: '文号', children: preview.document_no || preview.document_no_empty_reason || '-' },
        { key: 'source', label: '官方来源', children: <a href={preview.source_url} target="_blank" rel="noreferrer">查看官方原文</a>, span: 2 },
      ]} />
      <Table size="small" rowKey="id" pagination={false} dataSource={preview.revisions} columns={[
        { title: '版本', dataIndex: 'version', render: (value) => `v${value}` }, { title: '状态', dataIndex: 'status', render: (value) => revisionStatus[value] },
        { title: '录入人', render: (_, row) => row.creator.username }, { title: '复核人', render: (_, row) => row.reviewer?.username || '-' },
        { title: '修订说明', dataIndex: 'change_note' }, { title: '发布时间', dataIndex: 'published_at', render: (value) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
      ]} />
    </Space> : null}
  </Modal></>;
}
