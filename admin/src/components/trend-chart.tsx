import { Space, Typography } from 'antd';
import { useMemo } from 'react';
import type { TrendItem } from '../types';

const WIDTH = 800;
const HEIGHT = 320;
const PADDING = { top: 20, right: 20, bottom: 44, left: 54 };
const SERIES = [
  { key: 'new_users', label: '新增用户', color: '#0958d9' },
  { key: 'new_rides', label: '发布约骑', color: '#c74700' },
] as const;

export function TrendChart({ data }: { data: TrendItem[] }) {
  const chart = useMemo(() => {
    const max = Math.max(1, ...data.flatMap((item) => SERIES.map((series) => item[series.key])));
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const x = (index: number) => PADDING.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = (value: number) => PADDING.top + plotHeight - (value / max) * plotHeight;
    return { max, plotWidth, plotHeight, x, y };
  }, [data]);

  if (!data.length) return <Typography.Text type="secondary">暂无趋势数据</Typography.Text>;
  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  return <div style={{ width: '100%', overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="新增用户和发布约骑趋势折线图" style={{ display: 'block', width: '100%', minWidth: 640, height: 'auto' }}>
      {[0, 1, 2, 3, 4].map((step) => {
        const value = Math.round((chart.max * step) / 4);
        const y = PADDING.top + chart.plotHeight - (chart.plotHeight * step) / 4;
        return <g key={step}><line x1={PADDING.left} y1={y} x2={PADDING.left + chart.plotWidth} y2={y} stroke="#e5e5e5" strokeWidth="1" /><text x={PADDING.left - 10} y={y + 4} fill="#767676" fontSize="12" textAnchor="end">{value}</text></g>;
      })}
      {data.map((item, index) => index % labelStep === 0 || index === data.length - 1 ? <text key={item.date} x={chart.x(index)} y={HEIGHT - 14} fill="#767676" fontSize="12" textAnchor="middle">{item.date.slice(5)}</text> : null)}
      {SERIES.map((series) => <g key={series.key}>
        <polyline fill="none" stroke={series.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={data.map((item, index) => `${chart.x(index)},${chart.y(item[series.key])}`).join(' ')} />
        {data.map((item, index) => <circle key={item.date} cx={chart.x(index)} cy={chart.y(item[series.key])} r="3.5" fill="#fff" stroke={series.color} strokeWidth="2"><title>{`${item.date} ${series.label}：${item[series.key]}`}</title></circle>)}
      </g>)}
    </svg>
    <Space wrap size="large" style={{ display: 'flex', justifyContent: 'center' }}>
      {SERIES.map((series) => <Space key={series.key} size={6}><span aria-hidden style={{ display: 'inline-block', width: 18, height: 3, borderRadius: 2, background: series.color }} /><Typography.Text type="secondary">{series.label}</Typography.Text></Space>)}
    </Space>
  </div>;
}
