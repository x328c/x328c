const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '我的截图');
const OUT = __dirname;
const W = 1080;
const H = 1920;
const ORANGE = '#ff6500';
const WHITE = '#ffffff';
const MUTED = '#aeb3bf';
const FONT = "'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";

const assets = {
  bg: path.join(OUT, 'campaign-background.png'),
  logo: path.join(ROOT, 'logo.png'),
  qr: path.join(ROOT, '小程序二维码.jpg'),
  rideHome: path.join(SHOTS, 'Screenshot_2026-08-28-23-58-20-575_com.tencent.mm.jpg'),
  rideDetail: path.join(SHOTS, 'Screenshot_2026-08-28-23-59-28-969_com.tencent.mm.jpg'),
  rideCreate: path.join(SHOTS, 'Screenshot_2026-08-29-00-03-27-008_com.tencent.mm.jpg'),
  routes: path.join(SHOTS, 'Screenshot_2026-08-28-23-58-25-432_com.tencent.mm.jpg'),
  routeCreate: path.join(SHOTS, 'Screenshot_2026-08-28-23-58-41-098_com.tencent.mm.jpg'),
  safety: path.join(SHOTS, 'Screenshot_2026-08-29-00-00-28-229_com.tencent.mm.jpg'),
  regulation: path.join(SHOTS, 'Screenshot_2026-08-29-00-00-42-630_com.tencent.mm.jpg'),
  profile: path.join(SHOTS, 'Screenshot_2026-08-28-23-59-36-289_com.tencent.mm.jpg'),
  settings: path.join(SHOTS, 'Screenshot_2026-08-29-00-05-33-730_com.tencent.mm.jpg'),
};

function esc(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}

function svg(content) {
  return Buffer.from(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/></filter>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity=".34"/></filter>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090b11" stop-opacity=".15"/><stop offset=".68" stop-color="#090b11" stop-opacity=".18"/><stop offset="1" stop-color="#090b11" stop-opacity=".58"/></linearGradient>
      <linearGradient id="orange" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff8a2a"/><stop offset="1" stop-color="#ff4d00"/></linearGradient>
    </defs>
    ${content}
  </svg>`);
}

async function roundedImage(file, width, height, radius = 42, fit = 'cover', position = 'top') {
  const img = await sharp(file).resize(width, height, { fit, position }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp(img).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function phone(file, x, y, width, height, radius = 42) {
  const screen = await roundedImage(file, width, height, radius, 'cover', 'top');
  const frame = Buffer.from(`<svg width="${width + 18}" height="${height + 18}" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="${width}" height="${height}" rx="${radius}" fill="#fff" stroke="#fff" stroke-width="10"/></svg>`);
  return [
    { input: frame, left: x - 9, top: y - 9 },
    { input: screen, left: x, top: y },
  ];
}

async function logoImage(size) {
  return sharp(assets.logo).resize(size, size, { fit: 'contain', background: '#fff' }).png().toBuffer();
}

async function qrImage(size) {
  return sharp(assets.qr).resize(size, size, { fit: 'contain', kernel: 'nearest', background: '#fff' }).png().toBuffer();
}

async function backgroundImage() {
  return sharp(assets.bg).resize(W, H, { fit: 'cover', position: 'centre' }).png().toBuffer();
}

function brandHeader(index) {
  return `
    <rect x="44" y="42" width="86" height="86" rx="25" fill="#fff" filter="url(#soft)"/>
    <text x="151" y="80" fill="#fff" font-family="${FONT}" font-size="34" font-weight="800">摩搭子助手</text>
    <text x="151" y="114" fill="${MUTED}" font-family="${FONT}" font-size="20" letter-spacing="2">MOTORCYCLE RIDING COMPANION</text>
    `;
}

function titleBlock(kicker, title, subtitle) {
  return `
    <text x="48" y="205" fill="${ORANGE}" font-family="${FONT}" font-size="24" font-weight="800" letter-spacing="4">${esc(kicker)}</text>
    <text x="48" y="280" fill="#fff" font-family="${FONT}" font-size="66" font-weight="900">${esc(title)}</text>
    <text x="50" y="328" fill="#c5c9d1" font-family="${FONT}" font-size="26">${esc(subtitle)}</text>`;
}

function steps(items, y = 1210) {
  return items.map((s, i) => {
    const yy = y + i * 106;
    return `<g>
      <circle cx="700" cy="${yy}" r="30" fill="url(#orange)"/>
      <text x="700" y="${yy + 10}" text-anchor="middle" fill="#fff" font-family="${FONT}" font-size="27" font-weight="900">${i + 1}</text>
      <text x="745" y="${yy - 4}" fill="#fff" font-family="${FONT}" font-size="27" font-weight="800">${esc(s[0])}</text>
      <text x="745" y="${yy + 30}" fill="${MUTED}" font-family="${FONT}" font-size="20">${esc(s[1])}</text>
    </g>`;
  }).join('');
}

function highlight(cx, cy, label, tx, ty) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="#ff6500" stroke-width="8" filter="url(#soft)"/>
    <path d="M ${cx + 32} ${cy - 20} Q ${cx + 70} ${cy - 48} ${tx - 8} ${ty + 5}" fill="none" stroke="#ff6500" stroke-width="5" stroke-linecap="round"/>
    <rect x="${tx}" y="${ty - 29}" width="${Math.max(124, label.length * 30 + 36)}" height="58" rx="29" fill="#ff6500"/>
    <text x="${tx + 18}" y="${ty + 10}" fill="#fff" font-family="${FONT}" font-size="25" font-weight="800">${esc(label)}</text>
  </g>`;
}

function qrCard() {
  return `<g>
    <rect x="650" y="1548" width="382" height="276" rx="34" fill="#fff" filter="url(#soft)"/>
    <text x="680" y="1592" fill="#151823" font-family="${FONT}" font-size="27" font-weight="900">扫码进入小程序</text>
    <text x="680" y="1626" fill="#7d828d" font-family="${FONT}" font-size="19">即刻发现路线与同行</text>
    <text x="680" y="1780" fill="#ff6500" font-family="${FONT}" font-size="22" font-weight="800">长按识别</text>
  </g>`;
}

async function renderFeature(cfg) {
  const mainX = 44, mainY = 370, mainW = 566, mainH = 1258;
  const miniX = 684, miniY = 400, miniW = 310, miniH = 689;
  const comps = [{ input: await backgroundImage(), left: 0, top: 0 }];
  comps.push(...await phone(cfg.main, mainX, mainY, mainW, mainH, 44));
  comps.push(...await phone(cfg.secondary, miniX, miniY, miniW, miniH, 34));

  const mx = mainX + cfg.mark.x * mainW / 1080;
  const my = mainY + cfg.mark.y * mainH / 2400;
  const overlay = svg(`${brandHeader(cfg.index)}${titleBlock(cfg.kicker, cfg.title, cfg.subtitle)}
    <rect x="671" y="387" width="336" height="715" rx="44" fill="none" stroke="#ffffff38" stroke-width="2"/>
    <text x="700" y="1142" fill="${ORANGE}" font-family="${FONT}" font-size="21" font-weight="800" letter-spacing="2">操作指引</text>
    ${steps(cfg.steps, 1190)}
    ${highlight(mx, my, cfg.mark.label, cfg.mark.tx, cfg.mark.ty)}
    ${qrCard()}
    <text x="48" y="1858" fill="#ffffffaa" font-family="${FONT}" font-size="19">真实小程序界面 · V2.2 生产版</text>`);
  comps.push({ input: overlay, left: 0, top: 0 });
  comps.push({ input: await logoImage(70), left: 52, top: 50 });
  comps.push({ input: await qrImage(154), left: 850, top: 1648 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0d13' } })
    .composite(comps).png({ compressionLevel: 9 }).toFile(path.join(OUT, cfg.file));
}

async function renderCover() {
  const comps = [{ input: await backgroundImage(), left: 0, top: 0 }];
  comps.push(...await phone(assets.routes, 38, 650, 310, 689, 32));
  comps.push(...await phone(assets.rideHome, 347, 540, 386, 858, 40));
  comps.push(...await phone(assets.safety, 732, 650, 310, 689, 32));
  const overlay = svg(`
    <text x="210" y="113" fill="#fff" font-family="${FONT}" font-size="42" font-weight="900">摩搭子助手</text>
    <text x="211" y="154" fill="${MUTED}" font-family="${FONT}" font-size="22" letter-spacing="3">V2.2 · 骑行同行与安全知识服务</text>
    <text x="58" y="304" fill="#fff" font-family="${FONT}" font-size="76" font-weight="900">每一次出发</text>
    <text x="58" y="390" fill="#fff" font-family="${FONT}" font-size="76" font-weight="900">都有路线与同行</text>
    <rect x="58" y="427" width="248" height="9" rx="5" fill="url(#orange)"/>
    <text x="58" y="492" fill="#c7cbd3" font-family="${FONT}" font-size="27">发现附近骑友 · 记录骑行路线 · 查询安全知识</text>
    <rect x="58" y="1400" width="964" height="390" rx="44" fill="#ffffff" filter="url(#shadow)"/>
    <text x="102" y="1470" fill="#12151e" font-family="${FONT}" font-size="36" font-weight="900">四大核心能力，一站式骑行助手</text>
    <g font-family="${FONT}" font-size="24" font-weight="800">
      <rect x="102" y="1510" width="190" height="62" rx="31" fill="#fff1e8"/><text x="197" y="1550" text-anchor="middle" fill="#d34f00">同行组队</text>
      <rect x="312" y="1510" width="190" height="62" rx="31" fill="#fff1e8"/><text x="407" y="1550" text-anchor="middle" fill="#d34f00">路线发现</text>
      <rect x="102" y="1590" width="190" height="62" rx="31" fill="#fff1e8"/><text x="197" y="1630" text-anchor="middle" fill="#d34f00">安全手册</text>
      <rect x="312" y="1590" width="190" height="62" rx="31" fill="#fff1e8"/><text x="407" y="1630" text-anchor="middle" fill="#d34f00">个人中心</text>
    </g>
    <text x="102" y="1718" fill="#171a23" font-family="${FONT}" font-size="30" font-weight="900">微信扫码，马上体验</text>
    <text x="102" y="1758" fill="#7a7f89" font-family="${FONT}" font-size="21">安全出发，快乐抵达</text>
    <rect x="748" y="1550" width="260" height="260" rx="34" fill="#fff" stroke="#eceef2" stroke-width="2"/>
    <text x="58" y="1865" fill="#ffffffaa" font-family="${FONT}" font-size="20">MOTORCYCLE RIDING COMPANION · 2026</text>`);
  comps.push({ input: overlay, left: 0, top: 0 });
  comps.push({ input: await logoImage(114), left: 72, top: 75 });
  comps.push({ input: await qrImage(205), left: 774, top: 1576 });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0d13' } })
    .composite(comps).png({ compressionLevel: 9 }).toFile(path.join(OUT, '00-品牌总览.png'));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await renderCover();
  const configs = [
    {
      index: 2, file: '01-同行组队.png', kicker: 'RIDE TOGETHER', title: '发现同行，一键组队',
      subtitle: '按集合地点距离发现附近骑友，查看详情或发起同行',
      main: assets.rideHome, secondary: assets.rideDetail,
      steps: [['浏览附近同行', '活动按距离由近至远展示'], ['查看活动详情', '确认时间、地点与报名进度'], ['点击 + 发起', '关联路线，邀请摩友出发']],
      mark: { x: 950, y: 2035, label: '发起同行', tx: 420, ty: 1480 },
    },
    {
      index: 3, file: '02-路线发现.png', kicker: 'ROUTE DISCOVERY', title: '好路线，值得分享',
      subtitle: '官方精选与骑友路线统一展示，筛选、录入、分享更顺畅',
      main: assets.routes, secondary: assets.routeCreate,
      steps: [['筛选路线', '按来源、类型与难度查找'], ['查看路线详情', '地图、点位与里程清晰可见'], ['录入并发布', '公开分享或仅自己可见']],
      mark: { x: 335, y: 530, label: '录入路线', tx: 408, ty: 650 },
    },
    {
      index: 4, file: '03-安全手册.png', kicker: 'SAFE RIDING', title: '安全骑行，从规则开始',
      subtitle: '安全倡议、应急知识与官方法规索引，出发前随手可查',
      main: assets.safety, secondary: assets.regulation,
      steps: [['搜索安全知识', '按关键词、文号或机构查询'], ['阅读实用指南', '倡议与事故应急内容随时看'], ['核对官方来源', '法规详情提供原文入口']],
      mark: { x: 315, y: 1018, label: '查看内容', tx: 410, ty: 900 },
    },
    {
      index: 5, file: '04-个人中心.png', kicker: 'RIDER PROFILE', title: '管理你的骑行身份',
      subtitle: '资料、同行、路线与系统权限集中管理，分享边界由你掌控',
      main: assets.profile, secondary: assets.settings,
      steps: [['完善骑行资料', '头像、名称与骑行偏好'], ['管理个人内容', '查看我的同行与我的路线'], ['进入设置', '管理通知、权限与隐私']],
      mark: { x: 135, y: 1050, label: '进入设置', tx: 407, ty: 955 },
    },
  ];
  for (const cfg of configs) await renderFeature(cfg);
  console.log(`Rendered ${configs.length + 1} posters to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
