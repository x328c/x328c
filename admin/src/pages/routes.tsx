import { EditOutlined, EyeOutlined, PlusOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Form, Image, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuthStore } from '../stores/auth-store';
import type { RouteCommentAdminItem, RouteItem, RoutePayload, RoutePointInput, RouteStatus, UserRouteAdminItem } from '../types';
import { RouteMapEditor } from '../components/route-map-editor';

const statusMap: Record<RouteStatus, { text: string; color: string }> = {
  0: { text: '草稿', color: 'default' }, 1: { text: '已发布', color: 'green' }, 2: { text: '已下架', color: 'red' },
};
const typeOptions = [
  { value: 'scenic', label: '风景路线' }, { value: 'mountain', label: '跑山路线' },
  { value: 'touring', label: '摩旅路线' }, { value: 'urban', label: '城市路线' },
];
const difficultyOptions = [
  { value: 'easy', label: '轻松' }, { value: 'moderate', label: '适中' }, { value: 'hard', label: '挑战' },
];
type RouteFormValues = Omit<RoutePayload, 'images' | 'polyline' | 'related_ride_ids' | 'points'> & {
  images_text?: string; related_ride_ids_text?: string; points?: RoutePointInput[];
};

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function validateImagesText(_: unknown, value?: string): Promise<void> {
  const images = value?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) ?? [];
  if (images.length > 6) throw new Error('最多填写 6 张图片');
  if (images.some((item) => item.length > 500 || !isHttpUrl(item))) {
    throw new Error('图片必须是长度不超过 500 的 HTTP(S) URL');
  }
}

async function validateRelatedRideIds(_: unknown, value?: string): Promise<void> {
  const ids = value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  if (ids.length > 20) throw new Error('最多关联 20 个约骑');
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error('关联约骑 ID 必须是正整数');
  if (new Set(ids).size !== ids.length) throw new Error('关联约骑 ID 不能重复');
}

function toForm(route?: RouteItem): RouteFormValues {
  return route ? {
    title: route.title,
    summary: route.summary ?? undefined,
    cover_image: route.cover_image ?? undefined,
    city_code: route.city_code ?? undefined,
    district_code: route.district_code ?? undefined,
    city_name: route.city_name ?? undefined,
    type: route.type ?? undefined,
    difficulty: route.difficulty ?? undefined,
    distance_km: route.distance_km ? Number(route.distance_km) : undefined,
    duration_min: route.duration_min ?? undefined,
    road_condition: route.road_condition ?? undefined,
    suitable_motorcycles: route.suitable_motorcycles ?? undefined,
    best_season: route.best_season ?? undefined,
    safety_notice: route.safety_notice ?? undefined,
    sort_weight: route.sort_weight,
    images_text: route.images.join('\n'),
    external_route_url: route.external_route_url ?? undefined,
    related_ride_ids_text: route.related_ride_ids.join(','),
    points: route.points,
  } : { title: '', sort_weight: 0, points: [] };
}

function toPayload(values: RouteFormValues): RoutePayload {
  const images = values.images_text?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const relatedRideIds = values.related_ride_ids_text?.split(',').map((item) => item.trim()).filter(Boolean);
  const polyline = (values.points ?? []).map((point) => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }));
  const startPoint = (values.points ?? []).find((point) => point.type === 'start') ?? values.points?.[0];
  return {
    title: values.title.trim(), summary: values.summary || undefined, cover_image: values.cover_image || undefined,
    images, city_code: startPoint?.city_code || values.city_code || undefined, district_code: startPoint ? startPoint.district_code || '' : values.district_code || undefined, city_name: values.city_name || undefined,
    type: values.type, difficulty: values.difficulty, distance_km: values.distance_km, duration_min: values.duration_min,
    polyline, road_condition: values.road_condition || undefined,
    suitable_motorcycles: values.suitable_motorcycles || undefined, best_season: values.best_season || undefined,
    safety_notice: values.safety_notice || undefined, sort_weight: values.sort_weight ?? 0,
    external_route_url: values.external_route_url || undefined,
    points: (values.points ?? []).map((point, order) => ({
      order, name: point.name, latitude: Number(point.latitude), longitude: Number(point.longitude),
      type: point.type, description: point.description || undefined, address: point.address || undefined,
      province_code: point.province_code || undefined, city_code: point.city_code || undefined, district_code: point.district_code || undefined,
    })),
    related_ride_ids: relatedRideIds,
  };
}

export function RoutesPage() {
  const [filterForm] = Form.useForm();
  const [userRouteFilterForm] = Form.useForm();
  const [editorForm] = Form.useForm<RouteFormValues>();
  const [items, setItems] = useState<RouteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [editing, setEditing] = useState<RouteItem | null>();
  const [preview, setPreview] = useState<RouteItem>();
  const [userRouteItems, setUserRouteItems] = useState<UserRouteAdminItem[]>([]);
  const [userRouteTotal, setUserRouteTotal] = useState(0);
  const [userRoutePage, setUserRoutePage] = useState(1);
  const [userRouteLoading, setUserRouteLoading] = useState(false);
  const [userRoutePreview, setUserRoutePreview] = useState<UserRouteAdminItem>();
  const [comments, setComments] = useState<RouteCommentAdminItem[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentReportOrder, setCommentReportOrder] = useState<'asc' | 'desc'>('desc');
  const role = useAuthStore((state) => state.admin?.role);

  const load = useCallback(async (next = 1) => {
    setLoading(true);
    try {
      const result = await adminApi.routes({ page: next, pageSize: 20, ...filterForm.getFieldsValue() });
      setItems(result.list); setTotal(result.pagination.total); setPage(next); setDisabled(false);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.code === 52001) setDisabled(true);
    } finally { setLoading(false); }
  }, [filterForm]);

  useEffect(() => { void load(1); }, [load]);

  const loadUserRoutes = useCallback(async (next = 1) => {
    setUserRouteLoading(true);
    try {
      const result = await adminApi.userRoutes({ page: next, pageSize: 20, ...userRouteFilterForm.getFieldsValue() });
      setUserRouteItems(result.list); setUserRouteTotal(result.pagination.total); setUserRoutePage(next);
    } catch (error) {
      message.error(axios.isAxiosError(error) ? (error.response?.data?.message ?? '用户路线加载失败') : '用户路线加载失败');
    } finally { setUserRouteLoading(false); }
  }, [userRouteFilterForm]);

  useEffect(() => { void loadUserRoutes(1); }, [loadUserRoutes]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    try {
      const result = await adminApi.routeComments({ page: 1, pageSize: 100, report_order: commentReportOrder });
      setComments(result.list);
    } catch (error) {
      message.error(axios.isAxiosError(error) ? (error.response?.data?.message ?? '评论加载失败') : '评论加载失败');
    } finally { setCommentsLoading(false); }
  }, [commentReportOrder]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  const removeComment = (item: RouteCommentAdminItem) => {
    let reason = '';
    Modal.confirm({
      title: '确认删除该路线评论？',
      content: <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入删除原因（必填）" onChange={(event) => { reason = event.target.value; }} />,
      okText: '确认删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('请填写至少 2 个字的删除原因'); throw new Error('delete reason required'); }
        await adminApi.deleteRouteComment(item.id, reason.trim());
        message.success('评论已删除');
        await loadComments();
      },
    });
  };

  const openEditor = (route?: RouteItem) => {
    setEditing(route ?? null);
    editorForm.setFieldsValue(toForm(route));
  };

  const save = async () => {
    const values = await editorForm.validateFields();
    let payload: RoutePayload;
    try { payload = toPayload(values); }
    catch { message.error('路线点位坐标无效'); return; }
    if (editing) await adminApi.updateRoute(editing.id, payload); else await adminApi.createRoute(payload);
    message.success(editing ? '路线已保存' : '草稿已创建');
    setEditing(undefined); editorForm.resetFields(); await load(1);
  };

  const publish = (route: RouteItem) => {
    Modal.confirm({
      title: '确认发布路线？', content: '发布后将立即对小程序用户可见，请确认点位和安全信息已经复核。', okText: '确认发布',
      onOk: async () => { await adminApi.publishRoute(route.id); message.success('路线已发布'); await load(page); },
    });
  };

  const offline = (route: RouteItem) => {
    let reason = '';
    Modal.confirm({
      title: '确认下架路线？',
      content: <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入下架原因（必填）" onChange={(event) => { reason = event.target.value; }} />,
      okText: '确认下架', okButtonProps: { danger: true },
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('请填写至少 2 个字的下架原因'); throw new Error('offline reason required'); }
        await adminApi.offlineRoute(route.id, reason.trim()); message.success('路线已下架'); await load(page);
      },
    });
  };

  const offlineUserRoute = (route: UserRouteAdminItem) => {
    let reason = '';
    Modal.confirm({
      title: '确认下架用户路线？',
      content: <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入下架原因（必填）" onChange={(event) => { reason = event.target.value; }} />,
      okText: '确认下架', okButtonProps: { danger: true },
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('请填写至少 2 个字的下架原因'); throw new Error('offline reason required'); }
        await adminApi.offlineUserRoute(route.id, reason.trim());
        message.success('用户路线已下架');
        await loadUserRoutes(userRoutePage);
      },
    });
  };

  const restoreUserRoute = (route: UserRouteAdminItem) => {
    let reason = '';
    Modal.confirm({
      title: '确认恢复用户路线？',
      content: <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入恢复原因（必填）" onChange={(event) => { reason = event.target.value; }} />,
      okText: '确认恢复',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('请填写至少 2 个字的恢复原因'); throw new Error('restore reason required'); }
        await adminApi.restoreUserRoute(route.id, reason.trim());
        message.success('用户路线已恢复');
        await loadUserRoutes(userRoutePage);
      },
    });
  };

  const userRouteColumns: ColumnsType<UserRouteAdminItem> = [
    { title: '封面', dataIndex: 'images', width: 84, render: (images: string[]) => images?.[0] ? <Image width={54} height={40} style={{ objectFit: 'cover' }} src={images[0]} /> : '-' },
    { title: '路线', dataIndex: 'title', ellipsis: true },
    { title: '发布用户', dataIndex: ['creator', 'nickname'], width: 140, ellipsis: true },
    { title: '行程', width: 260, ellipsis: true, render: (_, row) => `${row.start_location} → ${row.end_location || '未设置终点'}` },
    { title: '可见性', dataIndex: 'visibility', width: 90, render: (value: number) => <Tag color={value === 2 ? 'green' : 'default'}>{value === 2 ? '公开' : '私密'}</Tag> },
    { title: '状态', width: 110, render: (_, row) => row.status === 1 ? <Tag color="green">正常</Tag> : row.offlined_at ? <Tag color="red">后台下架</Tag> : <Tag>用户删除</Tag> },
    { title: '收藏/评论', width: 110, render: (_, row) => `${row.favorite_count} / ${row.counts.comments}` },
    { title: '更新时间', dataIndex: 'updated_at', width: 170, render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '操作', width: 190, fixed: 'right', render: (_, route) => <Space size="small" wrap>
      <Button type="link" icon={<EyeOutlined />} onClick={() => setUserRoutePreview(route)}>详情</Button>
      {route.status === 1 ? <Button type="link" danger icon={<StopOutlined />} onClick={() => offlineUserRoute(route)}>下架</Button> : null}
      {route.status === 2 && route.offlined_at && role === 9 ? <Button type="link" icon={<RocketOutlined />} onClick={() => restoreUserRoute(route)}>恢复</Button> : null}
    </Space> },
  ];

  const columns: ColumnsType<RouteItem> = [
    { title: '封面', dataIndex: 'cover_image', width: 84, render: (src: string | null) => src ? <Image width={54} height={40} style={{ objectFit: 'cover' }} src={src} /> : '-' },
    { title: '路线', dataIndex: 'title', ellipsis: true },
    { title: '城市', render: (_, row) => row.city_name || row.city_code || '-' },
    { title: '难度', dataIndex: 'difficulty', render: (value) => difficultyOptions.find((item) => item.value === value)?.label || '-' },
    { title: '状态', dataIndex: 'status', render: (status: RouteStatus) => <Tag color={statusMap[status].color}>{statusMap[status].text}</Tag> },
    { title: '收藏', dataIndex: 'favorite_count', width: 72 },
    { title: '维护人', render: (_, row) => row.maintainer.username },
    { title: '更新时间', dataIndex: 'updated_at', render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
    { title: '操作', width: 290, fixed: 'right', render: (_, route) => <Space size="small" wrap>
      <Button type="link" icon={<EyeOutlined />} onClick={() => setPreview(route)}>预览</Button>
      <Button type="link" icon={<EditOutlined />} onClick={() => openEditor(route)}>编辑</Button>
      {route.status !== 1 && role === 9 ? <Button type="link" icon={<RocketOutlined />} onClick={() => publish(route)}>发布</Button> : null}
      {route.status === 1 ? <Button type="link" danger icon={<StopOutlined />} onClick={() => offline(route)}>下架</Button> : null}
    </Space> },
  ];

  return <>
    {disabled ? <Alert className="page-card" type="warning" showIcon message="路线发布功能已关闭" description="服务端 route.enabled 当前为 false；评论治理仍可在下方继续使用。" /> : <>
      <Form form={filterForm} layout="inline" className="filter-bar" onFinish={() => void load(1)}>
        <Form.Item name="keyword"><Input allowClear placeholder="路线名 / 城市" /></Form.Item>
        <Form.Item name="status"><Select allowClear placeholder="全部状态" style={{ width: 120 }} options={Object.entries(statusMap).map(([value, item]) => ({ value: Number(value), label: item.text }))} /></Form.Item>
        <Form.Item name="city_code"><Input allowClear placeholder="城市码" /></Form.Item>
        <Button type="primary" htmlType="submit">查询</Button>
        <Button onClick={() => { filterForm.resetFields(); void load(1); }}>重置</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新建草稿</Button>
      </Form>
      <Table className="page-card" rowKey="id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1100 }} pagination={{ current: page, pageSize: 20, total, onChange: (next) => void load(next) }} />
    </>}
    <Card className="page-card" title="用户发布路线管理" extra={<Button onClick={() => void loadUserRoutes(userRoutePage)}>刷新</Button>}>
      <Typography.Paragraph type="secondary">展示公开、私密及已下架的用户路线。管理员只能查看和执行内容治理，不能修改用户原始路线；后台下架操作需填写原因并写入审计日志。</Typography.Paragraph>
      <Form form={userRouteFilterForm} layout="inline" className="filter-bar" onFinish={() => void loadUserRoutes(1)}>
        <Form.Item name="keyword"><Input allowClear placeholder="路线名 / 起终点 / 用户" /></Form.Item>
        <Form.Item name="status"><Select allowClear placeholder="全部状态" style={{ width: 130 }} options={[{ value: 1, label: '正常' }, { value: 2, label: '已移除/下架' }]} /></Form.Item>
        <Form.Item name="visibility"><Select allowClear placeholder="全部可见性" style={{ width: 130 }} options={[{ value: 2, label: '公开' }, { value: 1, label: '私密' }]} /></Form.Item>
        <Form.Item name="city_code"><Input allowClear placeholder="城市码" /></Form.Item>
        <Button type="primary" htmlType="submit">查询</Button>
        <Button onClick={() => { userRouteFilterForm.resetFields(); void loadUserRoutes(1); }}>重置</Button>
      </Form>
      <Table rowKey="id" loading={userRouteLoading} columns={userRouteColumns} dataSource={userRouteItems} scroll={{ x: 1250 }} pagination={{ current: userRoutePage, pageSize: 20, total: userRouteTotal, onChange: (next) => void loadUserRoutes(next) }} />
    </Card>
    <Card className="page-card" title="路线评论管理" extra={<Button onClick={() => void loadComments()}>刷新评论</Button>}>
      <Typography.Paragraph type="secondary">评论提交后立即公开，不设强制审核。用户可举报评论，管理员核实后可直接删除；删除原因会写入审计日志。</Typography.Paragraph>
      <Space style={{ marginBottom: 16 }}><Typography.Text>排序</Typography.Text><Select value={commentReportOrder} onChange={setCommentReportOrder} style={{ width: 170 }} options={[{ value: 'desc', label: '举报次数从高到低' }, { value: 'asc', label: '举报次数从低到高' }]} /></Space>
      <Table loading={commentsLoading} rowKey="id" dataSource={comments} pagination={{ pageSize: 20 }} columns={[
        { title: '路线', dataIndex: ['route', 'title'], ellipsis: true },
        { title: '作者', dataIndex: ['author', 'nickname'], width: 140 },
        { title: '评论内容', dataIndex: 'content', ellipsis: true },
        { title: '图片', dataIndex: 'images', width: 150, render: (images: string[]) => images?.length ? <Image.PreviewGroup>{images.map((src) => <Image key={src} width={48} height={48} style={{ marginRight: 6, objectFit: 'cover' }} src={src} />)}</Image.PreviewGroup> : '-' },
        { title: '举报次数', dataIndex: 'report_count', width: 100, sorter: (a: RouteCommentAdminItem, b: RouteCommentAdminItem) => a.report_count - b.report_count },
        { title: '最近举报', dataIndex: 'reported_at', width: 170, render: (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-' },
        { title: '提交时间', dataIndex: 'created_at', width: 170, render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm') },
        { title: '操作', width: 100, render: (_, item: RouteCommentAdminItem) => <Button type="link" danger onClick={() => removeComment(item)}>删除</Button> },
      ]} />
    </Card>
    <Modal open={editing !== undefined} width={1000} title={editing ? `编辑路线：${editing.title}` : '创建路线草稿'} okText="保存草稿" onCancel={() => { setEditing(undefined); editorForm.resetFields(); }} onOk={() => void save()} destroyOnHidden>
      {editing?.status === 1 ? <Alert className="route-editor__alert" type="warning" showIcon message="编辑已发布路线后会自动转为草稿，必须重新发布。" /> : null}
      <Form form={editorForm} layout="vertical" initialValues={toForm()}>
        <div className="route-editor__grid">
          <Form.Item label="路线名称" name="title" rules={[{ required: true, message: '请输入路线名称' }, { max: 80 }]}><Input /></Form.Item>
          <Form.Item label="封面 URL" name="cover_image" rules={[{ type: 'url', message: '请输入有效 URL' }]}><Input maxLength={500} /></Form.Item>
          <Form.Item label="城市码" name="city_code"><Input maxLength={20} /></Form.Item>
          <Form.Item label="区县码" name="district_code"><Input maxLength={20} /></Form.Item>
          <Form.Item label="城市名称" name="city_name"><Input maxLength={50} /></Form.Item>
          <Form.Item label="路线类型" name="type"><Select allowClear options={typeOptions} /></Form.Item>
          <Form.Item label="难度" name="difficulty"><Select allowClear options={difficultyOptions} /></Form.Item>
          <Form.Item label="里程（km）" name="distance_km"><InputNumber min={0.1} precision={2} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="预计时长（分钟）" name="duration_min"><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="推荐权重" name="sort_weight"><InputNumber precision={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="最佳季节" name="best_season"><Input maxLength={100} /></Form.Item>
        </div>
        <Form.Item label="简介" name="summary"><Input.TextArea rows={2} maxLength={300} showCount /></Form.Item>
        <Form.Item label="附图 URL（每行一个，最多 6 张）" name="images_text" rules={[{ validator: validateImagesText }]}><Input.TextArea rows={3} /></Form.Item>
        <Form.Item label="路况" name="road_condition"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
        <Form.Item label="适合车型" name="suitable_motorcycles"><Input maxLength={200} /></Form.Item>
        <Form.Item label="安全提示" name="safety_notice"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        <Form.Item label="第三方路线链接" name="external_route_url" tooltip="支持腾讯、高德、百度地图的 HTTPS 路线链接" rules={[{ type: 'url', message: '请输入有效 HTTPS URL' }]}><Input maxLength={1000} placeholder="https://..." /></Form.Item>
        <Form.Item label="关联约骑 ID（逗号分隔，最多 20 个）" name="related_ride_ids_text" rules={[{ validator: validateRelatedRideIds }]}><Input /></Form.Item>
        <Typography.Title level={5}>路线点位</Typography.Title>
        <Form.Item name="points" rules={[{ validator: (_, points?: RoutePointInput[]) => { if ((points?.length ?? 0) > 50) return Promise.reject(new Error('最多 50 个点位')); const unresolved = points?.findIndex((point) => !point.city_code) ?? -1; if (unresolved >= 0) return Promise.reject(new Error(`请确认第 ${unresolved + 1} 个点位所属城市`)); return Promise.resolve(); } }]}><RouteMapEditor /></Form.Item>
      </Form>
    </Modal>
    <Modal open={Boolean(preview)} width={760} title="路线预览" footer={null} onCancel={() => setPreview(undefined)}>
      {preview ? <>
        {preview.cover_image ? <Image width="100%" height={260} style={{ objectFit: 'cover' }} src={preview.cover_image} /> : <Alert message="草稿尚未配置封面" type="info" />}
        <Typography.Title level={3}>{preview.title}</Typography.Title>
        <Descriptions bordered column={2} items={[
          { key: 'status', label: '状态', children: statusMap[preview.status].text },
          { key: 'city', label: '城市', children: preview.city_name || preview.city_code || '-' },
          { key: 'distance', label: '里程', children: preview.distance_km ? `${preview.distance_km} km` : '-' },
          { key: 'duration', label: '时长', children: preview.duration_min ? `${preview.duration_min} 分钟` : '-' },
          { key: 'road', label: '路况', children: preview.road_condition || '-', span: 2 },
          { key: 'safety', label: '安全提示', children: preview.safety_notice || '-', span: 2 },
        ]} />
        <Table size="small" rowKey="order" pagination={false} dataSource={preview.points} columns={[
          { title: '顺序', dataIndex: 'order' }, { title: '类型', dataIndex: 'type' }, { title: '点位', dataIndex: 'name' },
          { title: '坐标', render: (_, point: RoutePointInput) => `${point.latitude}, ${point.longitude}` },
        ]} />
      </> : null}
    </Modal>
    <Modal open={Boolean(userRoutePreview)} width={820} title="用户路线详情" footer={null} onCancel={() => setUserRoutePreview(undefined)}>
      {userRoutePreview ? <>
        {userRoutePreview.images.length ? <Image.PreviewGroup><Space wrap>{userRoutePreview.images.map((src) => <Image key={src} width={120} height={90} style={{ objectFit: 'cover' }} src={src} />)}</Space></Image.PreviewGroup> : null}
        <Typography.Title level={3}>{userRoutePreview.title}</Typography.Title>
        <Descriptions bordered column={2} items={[
          { key: 'creator', label: '发布用户', children: `${userRoutePreview.creator.nickname}（ID ${userRoutePreview.creator.id}）` },
          { key: 'visibility', label: '可见性', children: userRoutePreview.visibility === 2 ? '公开' : '私密' },
          { key: 'status', label: '状态', children: userRoutePreview.status === 1 ? '正常' : userRoutePreview.offlined_at ? '后台下架' : '用户删除' },
          { key: 'city', label: '地区', children: [userRoutePreview.city_code, userRoutePreview.district_code].filter(Boolean).join(' / ') || '-' },
          { key: 'start', label: '起点', children: userRoutePreview.start_location },
          { key: 'end', label: '终点', children: userRoutePreview.end_location || '-' },
          { key: 'distance', label: '里程', children: userRoutePreview.total_distance != null ? `${userRoutePreview.total_distance} km` : '-' },
          { key: 'duration', label: '时长', children: userRoutePreview.estimated_time != null ? `${userRoutePreview.estimated_time} 分钟` : '-' },
          { key: 'counts', label: '收藏 / 评论 / 关联同行', children: `${userRoutePreview.favorite_count} / ${userRoutePreview.counts.comments} / ${userRoutePreview.counts.ride_links}` },
          { key: 'updated', label: '更新时间', children: dayjs(userRoutePreview.updated_at).format('YYYY-MM-DD HH:mm') },
          { key: 'description', label: '路线说明', children: userRoutePreview.description || '-', span: 2 },
          { key: 'offline', label: '下架原因', children: userRoutePreview.offline_reason || '-', span: 2 },
        ]} />
        <Typography.Title level={5}>路线点位</Typography.Title>
        <Table size="small" rowKey="id" pagination={false} dataSource={userRoutePreview.points} columns={[
          { title: '顺序', dataIndex: 'order', width: 70 }, { title: '类型', dataIndex: 'type', width: 90 }, { title: '点位', dataIndex: 'name' },
          { title: '地区', render: (_, point: RoutePointInput) => [point.city_code, point.district_code].filter(Boolean).join(' / ') || '-' },
          { title: '坐标', render: (_, point: RoutePointInput) => `${point.latitude}, ${point.longitude}` },
        ]} />
      </> : null}
    </Modal>
  </>;
}
