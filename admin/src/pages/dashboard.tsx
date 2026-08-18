import { Card, Col, Radio, Row, Statistic, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { TrendChart } from '../components/trend-chart';
import type { TrendItem } from '../types';

interface Overview {
  total_users: number;
  dau: number;
  today_new_users: number;
  total_rides: number;
}

export function DashboardPage() {
  const [overview, setOverview] = useState<Overview>();
  const [days, setDays] = useState<7 | 30>(7);
  const [trend, setTrend] = useState<TrendItem[]>([]);

  useEffect(() => { void adminApi.overview().then(setOverview); }, []);
  useEffect(() => { void adminApi.trend(days).then((result) => setTrend(result.list)); }, [days]);

  const statistics: Array<[string, number | undefined]> = [
    ['总用户数', overview?.total_users],
    ['日活跃用户（DAU）', overview?.dau],
    ['今日新增用户', overview?.today_new_users],
    ['约骑总数', overview?.total_rides],
  ];

  return <>
    <Typography.Title level={3}>数据概览</Typography.Title>
    <Row gutter={[16, 16]}>
      {statistics.map(([title, value]) => <Col xs={24} sm={12} xl={4} key={title}><Card><Statistic title={title} value={value ?? 0} /></Card></Col>)}
    </Row>
    <Card
      className="page-card"
      title="增长趋势"
      extra={<Radio.Group value={days} onChange={(event) => setDays(event.target.value)}><Radio.Button value={7}>近7天</Radio.Button><Radio.Button value={30}>近30天</Radio.Button></Radio.Group>}
    >
      <TrendChart data={trend} />
    </Card>
  </>;
}
