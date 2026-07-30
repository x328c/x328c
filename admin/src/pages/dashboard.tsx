import { Line } from '@ant-design/plots';
import { Card, Col, Radio, Row, Statistic, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/admin';
import type { TrendItem } from '../types';

export function DashboardPage() {
  const [overview, setOverview] = useState<{ total_users: number; dau: number; today_new_users: number; total_rides: number; total_activities: number }>(); const [days, setDays] = useState<7 | 30>(7); const [trend, setTrend] = useState<TrendItem[]>([]);
  useEffect(() => { void adminApi.overview().then(setOverview); }, []); useEffect(() => { void adminApi.trend(days).then((x) => setTrend(x.list)); }, [days]);
  const chartData = useMemo(() => trend.flatMap((row) => [{ date: row.date.slice(5), value: row.new_users, type: '新增用户' }, { date: row.date.slice(5), value: row.new_rides, type: '发布约骑' }, { date: row.date.slice(5), value: row.new_activities, type: '发布活动' }]), [trend]);
  return <><Typography.Title level={3}>数据概览</Typography.Title><Row gutter={[16, 16]}>{[['总用户数', overview?.total_users], ['日活跃用户（DAU）', overview?.dau], ['今日新增用户', overview?.today_new_users], ['约骑总数', overview?.total_rides], ['活动总数', overview?.total_activities]].map(([title, value]) => <Col xs={24} sm={12} xl={4} key={String(title)}><Card><Statistic title={title as string} value={(value as number | undefined) ?? 0} /></Card></Col>)}</Row><Card className="page-card" title="增长趋势" extra={<Radio.Group value={days} onChange={(event) => setDays(event.target.value)}><Radio.Button value={7}>近7天</Radio.Button><Radio.Button value={30}>近30天</Radio.Button></Radio.Group>}>{chartData.length ? <Line data={chartData} xField="date" yField="value" colorField="type" smooth height={360} /> : '暂无趋势数据'}</Card></>;
}
