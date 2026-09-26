// ============================================================
// Komari 探针 · 现代原生卡片 (Scriptable / ListWidget)
// 原生矢量文字渲染，文字清晰、自动适配机型；进度条/波形用小图嵌入
// 每个组件画一个节点；多个同尺寸组件叠成一摞 → 桌面上下滑动切换
//
// 用法：填 baseURL → 桌面加多个同尺寸组件 → 各自参数填 节点名/序号 → 叠放
// 双节点大号卡片：组件选「大号」，参数填「节点A,节点B」（逗号分隔）
// ============================================================

// ======================= 配置区 =============================
const CONFIG = {
  baseURL: "https://komari.665663.xyz", // 必填，结尾不带斜杠
  apiKey: "", // 可选
  offlineThreshold: 120,
  pingHours: 1,
  netHours: 6, // 网络折线图时间窗（小时）
};
CONFIG.baseURL = CONFIG.baseURL.replace(/\/+$/, "");
const SELECTOR = (args.widgetParameter || "").trim();
const family = config.widgetFamily || "medium";
// 双节点：参数里包含逗号，且是大号组件时启用
const DUAL_SELECTORS = SELECTOR.includes(",")
  ? SELECTOR.split(",").map((s) => s.trim()).filter(Boolean)
  : null;
// ============================================================

const COL = {
  fg: new Color("#1c1c1e"),
  dim: new Color("#6e6e73"),
  dim2: new Color("#8e8e93"),
  green: new Color("#34a853"),
  amber: new Color("#c9890a"),
  red: new Color("#d93025"),
  blue: new Color("#1a73e8"),
  track: new Color("#000000", 0.1),
};
function usageColor(p) {
  return p < 50 ? COL.green : p < 80 ? COL.amber : COL.red;
}

// ----------------------- 指标图标 ---------------------------
const ICON_COLORS = {
  CPU: new Color("#4263eb"),
  内存: new Color("#2f9e44"),
  硬盘: new Color("#e8590c"),
  流量: new Color("#7048e8"),
};
const ICON_TYPES = { CPU: "cpu", 内存: "ram", 硬盘: "disk", 流量: "net" };

function drawIcon(dc, type, x, y, size, color) {
  const s = size / 24;
  dc.setStrokeColor(color);
  dc.setLineWidth(Math.max(1, 1.4 * s * (24 / size) * (size / 16)));
  dc.setLineWidth(1.3);

  if (type === "cpu") {
    const body = new Path();
    body.addRoundedRect(new Rect(x + 7 * s, y + 7 * s, 10 * s, 10 * s), 1 * s, 1 * s);
    const pins = [
      [9, 2, 9, 7], [12, 2, 12, 7], [15, 2, 15, 7],
      [9, 17, 9, 22], [12, 17, 12, 22], [15, 17, 15, 22],
      [2, 9, 7, 9], [2, 12, 7, 12], [2, 15, 7, 15],
      [17, 9, 22, 9], [17, 12, 22, 12], [17, 15, 22, 15],
    ];
    pins.forEach(([x1, y1, x2, y2]) => {
      body.move(new Point(x + x1 * s, y + y1 * s));
      body.addLine(new Point(x + x2 * s, y + y2 * s));
    });
    dc.addPath(body);
    dc.strokePath();

    const inner = new Path();
    inner.addRect(new Rect(x + 10 * s, y + 10 * s, 4 * s, 4 * s));
    dc.addPath(inner);
    dc.setFillColor(color);
    dc.fillPath();
  } else if (type === "ram") {
    const p = new Path();
    p.addRoundedRect(new Rect(x + 2 * s, y + 8 * s, 20 * s, 9 * s), 1.5 * s, 1.5 * s);
    [6, 9.5, 13, 16.5, 20].forEach((dx) => {
      p.move(new Point(x + dx * s, y + 8 * s));
      p.addLine(new Point(x + dx * s, y + 17 * s));
    });
    [5, 9, 13, 17].forEach((dx) => {
      p.move(new Point(x + dx * s, y + 5 * s));
      p.addLine(new Point(x + dx * s, y + 8 * s));
    });
    dc.addPath(p);
    dc.strokePath();
  } else if (type === "disk") {
    const bars = new Path();
    [4, 10, 16].forEach((dy) => {
      bars.addRoundedRect(new Rect(x + 2 * s, y + dy * s, 20 * s, 5 * s), 1.5 * s, 1.5 * s);
    });
    dc.addPath(bars);
    dc.strokePath();

    const dots = new Path();
    [6.5, 12.5, 18.5].forEach((dy) => {
      dots.addEllipse(new Rect(x + 6 * s - 0.9 * s, y + dy * s - 0.9 * s, 1.8 * s, 1.8 * s));
    });
    dc.addPath(dots);
    dc.setFillColor(color);
    dc.fillPath();
  } else if (type === "net") {
    const p = new Path();
    p.move(new Point(x + 7.5 * s, y + 19 * s));
    p.addLine(new Point(x + 7.5 * s, y + 5 * s));
    p.move(new Point(x + 7.5 * s, y + 5 * s));
    p.addLine(new Point(x + 4.5 * s, y + 8.5 * s));
    p.move(new Point(x + 7.5 * s, y + 5 * s));
    p.addLine(new Point(x + 10.5 * s, y + 8.5 * s));
    p.move(new Point(x + 16.5 * s, y + 5 * s));
    p.addLine(new Point(x + 16.5 * s, y + 19 * s));
    p.move(new Point(x + 16.5 * s, y + 19 * s));
    p.addLine(new Point(x + 13.5 * s, y + 15.5 * s));
    p.move(new Point(x + 16.5 * s, y + 19 * s));
    p.addLine(new Point(x + 19.5 * s, y + 15.5 * s));
    dc.addPath(p);
    dc.strokePath();
  }
}

// ----------------------- 网络 ------------------------------
async function fetchJSON(path) {
  const req = new Request(CONFIG.baseURL + path);
  req.timeoutInterval = 15;
  if (CONFIG.apiKey) req.headers = { Authorization: "Bearer " + CONFIG.apiKey };
  return await req.loadJSON();
}
async function loadNodes() {
  const res = await fetchJSON("/api/nodes");
  const nodes = (res && res.data) || [];
  nodes.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return nodes;
}
async function loadRecentArr(uuid) {
  try {
    const r = await fetchJSON("/api/recent/" + uuid);
    return (r && r.data) || [];
  } catch (e) {
    return [];
  }
}
async function loadPing(uuid) {
  try {
    const r = await fetchJSON(`/api/records/ping?uuid=${uuid}&hours=${CONFIG.pingHours}`);
    const d = (r && r.data) || {};
    const t = (d.tasks || [])[0];
    if (t) return { ping: Math.round(t.avg), loss: Math.round(t.loss) };
    const bi = (d.basic_info || [])[0];
    if (bi) return { ping: null, loss: Math.round(bi.loss) };
  } catch (e) {}
  return { ping: null, loss: null };
}

function pickNode(nodes, sel) {
  if (!sel) return nodes[0] || null;
  if (/^\d+$/.test(sel)) return nodes[parseInt(sel, 10) - 1] || null;
  const s = sel.toLowerCase();
  return (
    nodes.find(
      (n) =>
        (n.name || "").toLowerCase().includes(s) ||
        (n.group || "").toLowerCase().includes(s)
    ) || null
  );
}

// ----------------------- 工具 ------------------------------
function isOnline(stat) {
  if (!stat || !stat.updated_at) return false;
  return (Date.now() - new Date(stat.updated_at).getTime()) / 1000 < CONFIG.offlineThreshold;
}

// 将到期时间格式化为“YYYY/MM/DD 到期”或“长期”
function formatExpire(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days > 3650) return "长期";
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day} 到期`;
}

function fb(b) {
  if (b == null) return "-";
  b = Math.abs(b);
  const u = ["B", "K", "M", "G", "T"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return (b < 10 && i > 0 ? b.toFixed(1) : Math.round(b)) + u[i];
}
function fuZh(s) {
  if (!s) return "-";
  const d = Math.floor(s / 86400);
  if (d > 0) return d + "天";
  const h = Math.floor(s / 3600);
  if (h > 0) return h + "小时";
  return Math.floor(s / 60) + "分钟";
}
function pc(u, t) {
  return t > 0 ? (u / t) * 100 : 0;
}
function trafficUsed(d) {
  const up = d.totalUp || 0,
    down = d.totalDown || 0;
  switch (d.trafficType) {
    case "sum":
      return up + down;
    case "min":
      return Math.min(up, down);
    case "up":
      return up;
    case "down":
      return down;
    default:
      return Math.max(up, down);
  }
}

function slim(m, arr) {
  const stat = arr.length ? arr[arr.length - 1] : null;
  const online = isOnline(stat);
  const s = stat || {};
  const net = s.network || {},
    ram = s.ram || {},
    disk = s.disk || {},
    load = s.load || {},
    cpu = s.cpu || {};
  return {
    name: m.name || "未命名",
    region: m.region || "",
    sys: m.os || "",
    price: m.price, // 价格原始值
    cycle: m.billing_cycle || m.cycle, // 账单周期
    online,
    uptime: s.uptime || 0,
    expireText: formatExpire(m.expired_at), // 使用新的格式化函数
    cpu: online ? cpu.usage || 0 : 0,
    load1: load.load1 || 0,
    ramUsed: ram.used || 0,
    ramTotal: ram.total || m.mem_total || 0,
    diskUsed: disk.used || 0,
    diskTotal: disk.total || m.disk_total || 0,
    totalDown: net.totalDown || 0,
    totalUp: net.totalUp || 0,
    trafficLimit: m.traffic_limit || 0,
    trafficType: m.traffic_limit_type || "max",
    ping: null,
    loss: null,
  };
}

// ----------------------- 绘制组件 ---------------------------
function baseWidget() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#ffffff", 0.78), new Color("#f2f2f7", 0.7)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = URLScheme.forRunningScript();
  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);
  return w;
}

function metricImg(label, p, blockW, large) {
  const fs = large ? 13 : 11;
  const barH = large ? 7 : 6;
  const gapY = large ? 6 : 5;
  const totalH = fs + gapY + barH + 2;
  const iconSize = fs + 2;
  const iconGap = 5;
  const color = ICON_COLORS[label];
  const type = ICON_TYPES[label];
  const iconYOffset = (type === "cpu" || type === "disk") ? 0 : 2;

  const dc = new DrawContext();
  dc.size = new Size(blockW, totalH);
  dc.opaque = false;
  dc.respectScreenScale = true;

  if (type && color) {
    drawIcon(dc, type, 0, iconYOffset, iconSize, color);
  }
  const textX = type && color ? iconSize + iconGap : 0;

  dc.setFont(Font.semiboldSystemFont(fs));
  dc.setTextColor(COL.dim);
  dc.drawText(label, new Point(textX, 0));

  dc.setFont(Font.semiboldSystemFont(fs));
  dc.setTextColor(COL.fg);
  dc.setTextAlignedRight();
  dc.drawTextInRect(Math.round(p) + "%", new Rect(0, 0, blockW, fs + 4));

  const barY = fs + gapY;
  const track = new Path();
  track.addRoundedRect(new Rect(0, barY, blockW, barH), barH / 2, barH / 2);
  dc.addPath(track);
  dc.setFillColor(COL.track);
  dc.fillPath();
  const fillW = Math.max(barH, (blockW * Math.min(Math.max(p, 0), 100)) / 100);
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, barY, fillW, barH), barH / 2, barH / 2);
  dc.addPath(fill);
  dc.setFillColor(usageColor(p));
  dc.fillPath();

  return dc.getImage();
}

function metricBlock(parent, label, p, detail, blockW, large) {
  const col = parent.addStack();
  col.layoutVertically();
  col.spacing = 3;

  const fs = large ? 13 : 11;
  const barH = large ? 7 : 6;
  const gapY = large ? 6 : 5;
  const totalH = fs + gapY + barH + 2;
  const img = col.addImage(metricImg(label, p, blockW, large));
  img.imageSize = new Size(blockW, totalH);

  if (detail) {
    const dt = col.addText(detail);
    dt.font = Font.systemFont(large ? 11 : 9.5);
    dt.textColor = COL.dim2;
    dt.lineLimit = 1;
  }
}

// 格式化价格与剩余天数
function getExpireAndPriceText(d) {
  const parts = [];

  // 1. 处理价格逻辑
  if (d.price != null && d.price !== "") {
    const pStr = String(d.price).trim();
    if (pStr === "-1") {
      parts.push("免费");
    } else {
      let cycleStr = "";
      const c = String(d.cycle || "").trim();
      if (c === "30" || c === "month") cycleStr = "/月";
      else if (c === "365" || c === "year") cycleStr = "/年";
      
      const numPrice = pStr.startsWith("$") ? pStr : "$" + pStr;
      parts.push(numPrice + cycleStr);
    }
  }

  // 2. 处理到期日/长期逻辑
  if (d.expireText != null) {
    parts.push(d.expireText);
  }

  return parts.join(" · ");
}

function buildCard(d, fam) {
  const w = baseWidget();
  const large = fam === "large";
  const small = fam === "small";
  w.setPadding(large ? 16 : 13, large ? 22 : 20, large ? 16 : 13, large ? 22 : 20);

  // ===== 头部 =====
  const head = w.addStack();
  head.centerAlignContent();
  const dot = head.addText("●");
  dot.font = Font.systemFont(small ? 9 : 10);
  dot.textColor = d.online ? COL.green : COL.dim2;
  head.addSpacer(6);
  const nm = head.addText((d.region ? d.region + " " : "") + d.name);
  nm.font = Font.boldSystemFont(small ? 14 : large ? 18 : 15);
  nm.textColor = COL.fg;
  nm.lineLimit = 1;
  if (!small) {
    head.addSpacer();
    const right = head.addText(d.online ? "在线" + fuZh(d.uptime) : "offline");
    right.font = Font.systemFont(large ? 13 : 11);
    right.textColor = COL.dim2;
  }

  if (large && d.online) {
    const sub = w.addStack();
    sub.centerAlignContent();
    const s2 = sub.addText(d.sys || "");
    s2.font = Font.systemFont(12);
    s2.textColor = COL.dim2;
    s2.lineLimit = 1;
  }

  if (!d.online) {
    w.addSpacer();
    const off = w.addText("● 节点离线");
    off.font = Font.mediumSystemFont(14);
    off.textColor = COL.dim;
    off.centerAlignText();
    w.addSpacer();
    return w;
  }

  w.addSpacer(large ? 14 : 10);

  // ===== 指标网格 =====
  const ramP = pc(d.ramUsed, d.ramTotal),
    diskP = pc(d.diskUsed, d.diskTotal);
  if (small) {
    metricBlock(w, "CPU", d.cpu, null, large ? 280 : 264, large);
    w.addSpacer(8);
    metricBlock(w, "内存", ramP, `${fb(d.ramUsed)} / ${fb(d.ramTotal)}`, large ? 280 : 264, large);
    return w;
  }
  const totalW = large ? 350 : 326;
  const gap = large ? 30 : 26;
  const blockW = (totalW - gap) / 2;

  const row1 = w.addStack();
  row1.layoutHorizontally();
  metricBlock(row1, "CPU", d.cpu, `${d.load1.toFixed(2)} 负载`, blockW, large);
  row1.addSpacer(gap);
  metricBlock(row1, "内存", ramP, `${fb(d.ramUsed)} / ${fb(d.ramTotal)}`, blockW, large);

  w.addSpacer(large ? 12 : 9);

  const row2 = w.addStack();
  row2.layoutHorizontally();
  metricBlock(row2, "硬盘", diskP, `${fb(d.diskUsed)} / ${fb(d.diskTotal)}`, blockW, large);
  row2.addSpacer(gap);
  if (d.trafficLimit > 0) {
    metricBlock(
      row2,
      "流量",
      pc(trafficUsed(d), d.trafficLimit),
      `${fb(trafficUsed(d))} / ${fb(d.trafficLimit)}`,
      blockW,
      large
    );
  } else {
    metricBlock(row2, "流量", 0, `↑ ${fb(d.totalUp)} ↓ ${fb(d.totalDown)}`, blockW, large);
  }

  w.addSpacer(large ? 14 : 11);

  // ===== 底栏：价格 · 剩余天数 =====
  const nr = w.addStack();
  nr.centerAlignContent();
  const expireText = getExpireAndPriceText(d);
  if (expireText) {
    const sv = nr.addText(expireText);
    sv.font = Font.systemFont(large ? 12 : 11);
    sv.textColor = COL.dim; // 调整为浅灰色，与右侧延迟一致
  }
  if (d.ping != null || d.loss != null) {
    nr.addSpacer();
    const df = new DateFormatter();
    df.dateFormat = "HH:mm";
    df.timeZone = "GMT+8";
    const timeStr = df.string(new Date());
    const pingStr = d.ping != null ? d.ping + "ms" : "--";
    const pl = nr.addText(`${pingStr} · ${timeStr}`);
    pl.font = Font.systemFont(large ? 12 : 11);
    pl.textColor = COL.dim;
  }

  return w;
}

// ===== 双节点精简卡片（仅大号） =====
function buildOneOfDual(w, d, totalW) {
  const head = w.addStack();
  head.centerAlignContent();
  const dot = head.addText("●");
  dot.font = Font.systemFont(10);
  dot.textColor = d.online ? COL.green : COL.dim2;
  head.addSpacer(6);
  const nm = head.addText((d.region ? d.region + " " : "") + d.name);
  nm.font = Font.boldSystemFont(15);
  nm.textColor = COL.fg;
  nm.lineLimit = 1;
  head.addSpacer();
  const right = head.addText(d.online ? "在线" + fuZh(d.uptime) : "offline");
  right.font = Font.systemFont(11);
  right.textColor = COL.dim2;

  if (!d.online) {
    w.addSpacer(14);
    const off = w.addText("● 节点离线");
    off.font = Font.mediumSystemFont(14);
    off.textColor = COL.dim;
    return;
  }

  w.addSpacer(14);

  const ramP = pc(d.ramUsed, d.ramTotal),
    diskP = pc(d.diskUsed, d.diskTotal);
  const gap = 26;
  const blockW = (totalW - gap) / 2;

  const row1 = w.addStack();
  row1.layoutHorizontally();
  metricBlock(row1, "CPU", d.cpu, `${d.load1.toFixed(2)} 负载`, blockW, false);
  row1.addSpacer(gap);
  metricBlock(row1, "内存", ramP, `${fb(d.ramUsed)} / ${fb(d.ramTotal)}`, blockW, false);

  w.addSpacer(12);

  const row2 = w.addStack();
  row2.layoutHorizontally();
  metricBlock(row2, "硬盘", diskP, `${fb(d.diskUsed)} / ${fb(d.diskTotal)}`, blockW, false);
  row2.addSpacer(gap);
  if (d.trafficLimit > 0) {
    metricBlock(
      row2,
      "流量",
      pc(trafficUsed(d), d.trafficLimit),
      `${fb(trafficUsed(d))} / ${fb(d.trafficLimit)}`,
      blockW,
      false
    );
  } else {
    metricBlock(row2, "流量", 0, `↑ ${fb(d.totalUp)} ↓ ${fb(d.totalDown)}`, blockW, false);
  }

  w.addSpacer(14);

  // 底栏
  const nr = w.addStack();
  nr.centerAlignContent();
  const expireText = getExpireAndPriceText(d);
  if (expireText) {
    const sv = nr.addText(expireText);
    sv.font = Font.systemFont(11);
    sv.textColor = COL.dim; // 调整为浅灰色，与右侧延迟一致
  }
  if (d.ping != null || d.loss != null) {
    nr.addSpacer();
    const df = new DateFormatter();
    df.dateFormat = "HH:mm";
    df.timeZone = "GMT+8";
    const timeStr = df.string(new Date());
    const pingStr = d.ping != null ? d.ping + "ms" : "--";
    const pl = nr.addText(`${pingStr} · ${timeStr}`);
    pl.font = Font.systemFont(11);
    pl.textColor = COL.dim;
  }
}

function buildDualCard(d2, d1) {
  const w = baseWidget();
  w.setPadding(12, 20, 12, 20);
  const totalW = 326;

  buildOneOfDual(w, d2, totalW);

  w.addSpacer(16);
  const divider = w.addStack();
  divider.size = new Size(totalW, 1);
  divider.backgroundColor = new Color("#000000", 0.08);
  w.addSpacer(16);

  buildOneOfDual(w, d1, totalW);

  return w;
}

// ----------------------- 主流程 ----------------------------
async function main() {
  let widget;
  try {
    if (CONFIG.baseURL.includes("example.com")) {
      widget = errWidget("请先在脚本顶部填写 baseURL");
    } else if (DUAL_SELECTORS && family === "large") {
      const nodes = await loadNodes();
      const n1 = pickNode(nodes, DUAL_SELECTORS[0]);
      const n2 = pickNode(nodes, DUAL_SELECTORS[1]);
      if (!n1 || !n2) {
        widget = errWidget(
          "未找到节点：" + [!n1 ? DUAL_SELECTORS[0] : null, !n2 ? DUAL_SELECTORS[1] : null].filter(Boolean).join(" / ")
        );
      } else {
        const [arr1, arr2] = await Promise.all([
          loadRecentArr(n1.uuid),
          loadRecentArr(n2.uuid),
        ]);
        const d1 = slim(n1, arr1);
        const d2 = slim(n2, arr2);
        const pingPromises = [];
        if (d1.online) pingPromises.push(loadPing(n1.uuid).then((p) => (d1.ping = p.ping, d1.loss = p.loss)));
        if (d2.online) pingPromises.push(loadPing(n2.uuid).then((p) => (d2.ping = p.ping, d2.loss = p.loss)));
        await Promise.all(pingPromises);
        widget = buildDualCard(d1, d2);
      }
    } else {
      const nodes = await loadNodes();
      const node = pickNode(nodes, SELECTOR);
      if (!node) {
        widget = errWidget(SELECTOR ? "未找到节点：" + SELECTOR : "无节点数据");
      } else {
        const arr = await loadRecentArr(node.uuid);
        const d = slim(node, arr);
        if (d.online && family !== "small") {
          const p = await loadPing(node.uuid);
          d.ping = p.ping;
          d.loss = p.loss;
        }
        widget = buildCard(d, family);
      }
    }
  } catch (e) {
    widget = errWidget("请求失败：" + (e.message || e));
  }

  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === "large") widget.presentLarge();
  else if (family === "small") widget.presentSmall();
  else widget.presentMedium();
  Script.complete();
}

function errWidget(msg) {
  const w = baseWidget();
  w.setPadding(14, 16, 14, 16);
  const t = w.addText("⚠️ Komari");
  t.font = Font.boldSystemFont(14);
  t.textColor = COL.red;
  w.addSpacer(6);
  const m = w.addText(msg);
  m.font = Font.systemFont(11);
  m.textColor = COL.fg;
  return w;
}

await main();
