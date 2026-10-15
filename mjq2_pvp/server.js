// ============================================================
// 马嘉棋2 - 双人联机服务器（多房间 + 观战版）
// 主机权威架构：房主(红方)浏览器运行全部逻辑，蓝方只发指令收状态，
//              观战者只收状态（收的是"完整状态"：双方手牌 / 指挥点 / 挂起反制 / 全部战报）
// 本服务器只做：静态托管 HTML + WebSocket 房间管理与消息转发（不含任何游戏逻辑）
//
// 页面路由（2026-10-05 第八批起）：
//   /                        → 主页（3 个按钮 + 房间号输入框）
//   /doc                     → 项目说明文档（markdown 渲染页）
//   /deck   (/deck_builder.html) → 卡组编辑器
//   /play/<房间号>            → 自动分房：空房→房主，已有房主→蓝方，满员→观战
//   /watch/<房间号>           → 强制观战
//   /host/<房间号> /join/<房间号> → 强制房主 / 强制蓝方（局域网脚本与旧链接沿用）
//   WebSocket: /ws/<房间号>?want=auto|host|blue|watch
//   兼容旧写法：/?host 与 /?join（默认房间 "1"）
// ============================================================
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');

// 端口可自定义：命令行参数 > 环境变量 PORT > 默认 3000
// 例：node server.js 8080   /   set PORT=8080 && node server.js
// 云托管（如 WorkBuddy 发布）会注入 PORT，此时自动关闭"自动开浏览器"。
const PORT = Number(process.argv[2] || process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT = __dirname;
const DEPLOYED = !!process.env.PORT;   // 云托管环境

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

// 对局页：/play/<房间号>、/room/<房间号>、/host/…、/join/…、/watch/…
const PAGE_RE = /^\/(?:play|room|host|join|watch)\/[A-Za-z0-9_-]{1,32}\/?$/;

function sendFile(res, file, type) {
  let body;
  try { body = fs.readFileSync(path.join(ROOT, file)); }
  catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('找不到文件：' + file);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// ---- HTTP 静态托管 ----
// 每次请求重新读取 HTML，便于修改后无需重启服务器即可生效
const httpServer = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch (e) { pathname = '/'; }

  // 主页：/ 与 /index.html
  if (pathname === '/' || pathname === '/index.html' || pathname === '/home') {
    sendFile(res, 'home.html', MIME['.html']);
    return;
  }
  // 项目说明文档（自带 markdown 渲染）
  if (pathname === '/doc' || pathname === '/doc.html' || pathname === '/docs') {
    sendFile(res, 'doc.html', MIME['.html']);
    return;
  }
  // 卡组编辑器（/deck 是短链）
  if (pathname === '/deck') {
    sendFile(res, 'deck_builder.html', MIME['.html']);
    return;
  }
  // 对局页：/play/<房间号> 等，房间号与角色由前端从 URL 解析
  if (PAGE_RE.test(pathname)) {
    sendFile(res, 'ma_jia_qi_2.html', MIME['.html']);
    return;
  }

  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }

  // 同目录下的其它静态文件（如 deck_builder.html、两个 .md 文档）顺带托管，禁止越目录
  const rel = pathname.replace(/^\/+/, '');
  const target = path.normalize(path.join(ROOT, rel));
  if (rel && target.startsWith(ROOT) && fs.existsSync(target) && fs.statSync(target).isFile()) {
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(target));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

// ---- WebSocket 多房间（每间：host=红方房主、blue=蓝方，其余为观战者）
const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map();      // 房间号 -> { host, blue, spectators:Set }
const MAX_ROOMS = 1000;
const MAX_SPECTATORS = 20;

function roomIdFromUrl(url) {
  const m = (url || '').match(/^\/ws\/([A-Za-z0-9_-]{1,32})/);
  return m ? m[1] : 'default';
}
// 客户端在 WS 地址上声明"想要什么角色"：?want=auto|host|blue|watch
function wantFromUrl(url) {
  const m = (url || '').match(/[?&]want=(auto|host|blue|watch)/);
  return m ? m[1] : 'auto';
}

function send(sock, obj) {
  if (sock && sock.readyState === 1) {
    try { sock.send(JSON.stringify(obj)); } catch (e) { /* 忽略 */ }
  }
}

// 按"想要的角色 + 当前空位"决定实际角色（满员一律降级为观战，绝不踢人）
function pickRole(room, want) {
  if (want === 'watch') return 'spectator';
  if (want === 'host') return room.host ? (room.blue ? 'spectator' : 'blue') : 'host';
  if (want === 'blue') return room.blue ? 'spectator' : 'blue';
  if (!room.host) return 'host';
  if (!room.blue) return 'blue';
  return 'spectator';
}

function spectatorNote(want, role) {
  if (role === 'spectator' && want === 'host') return '房主与蓝方席位都已占用，你以观战身份进入';
  if (role === 'spectator' && want === 'blue') return '蓝方席位已被占用，你以观战身份进入';
  if (role === 'spectator' && want === 'auto') return '房间已满（房主与蓝方都在），你进入观战模式';
  if (role === 'blue' && want === 'host') return '房主席位已被占用，你以蓝方加入';
  return '';
}

function broadcastPeers(room) {
  const n = room.spectators.size;
  send(room.host, {
    type: 'peerState',
    msg: room.blue ? '蓝方已连接，开始游戏！' : '等待蓝方加入…',
    connected: !!room.blue,
    spectators: n
  });
  send(room.blue, {
    type: 'peerState',
    msg: room.host ? '已连接房主，开始游戏！' : '房主未连接',
    connected: !!room.host
  });
  for (const sp of room.spectators) {
    send(sp, {
      type: 'peerState',
      msg: room.host ? '观战中…' : '房主不在，等待房主开局…',
      connected: !!room.host
    });
  }
}

wss.on('connection', (ws, req) => {
  const roomId = roomIdFromUrl(req.url);
  const want = wantFromUrl(req.url);
  let room = rooms.get(roomId);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      send(ws, { type: 'error', msg: '服务器房间数已达上限，请稍后再试' });
      ws.close();
      return;
    }
    room = { host: null, blue: null, spectators: new Set() };
    rooms.set(roomId, room);
  }
  ws._roomId = roomId;
  ws._role = null;

  const role = pickRole(room, want);
  if (role === 'spectator' && room.spectators.size >= MAX_SPECTATORS) {
    send(ws, { type: 'error', msg: '房间「' + roomId + '」观战人数已满，请稍后再试' });
    ws.close();
    return;
  }

  if (role === 'host') room.host = ws;
  else if (role === 'blue') room.blue = ws;
  else room.spectators.add(ws);
  ws._role = role;

  send(ws, { type: 'assign', role: role, room: roomId, note: spectatorNote(want, role) });
  broadcastPeers(room);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }

    if (ws === room.host) {
      // 房主 → 蓝方（保密裁剪版）+ 观战者（完整版，仅在真有观战者时才带 sw）
      if (msg.type === 'state') {
        send(room.blue, { type: 'state', s: msg.s });
        if (msg.sw && room.spectators.size) {
          for (const sp of room.spectators) send(sp, { type: 'state', s: msg.sw });
        }
      }
      // 语言系统：房主广播"某方发了表情"给蓝方与观战者（不含游戏状态，纯表现层）
      else if (msg.type === 'emote') {
        send(room.blue, { type: 'emote', side: msg.side, index: msg.index, text: msg.text || '' });
        for (const sp of room.spectators) send(sp, { type: 'emote', side: msg.side, index: msg.index, text: msg.text || '' });
      }
    } else if (ws === room.blue) {
      // 蓝方 → 房主（操作指令）
      if (msg.type === 'click' || msg.type === 'next' || msg.type === 'reset') {
        send(room.host, { type: 'peerCmd', cmd: { type: msg.type, id: msg.id } });
      }
      // 蓝方卡牌指令（统一 cmd 包装）
      else if (msg.type === 'cmd') {
        send(room.host, { type: 'peerCmd', cmd: msg.cmd });
      }
    }
    // 观战者不发任何指令：直接忽略
  });

  ws.on('close', () => {
    const r = rooms.get(roomId);
    if (!r) return;
    if (ws === r.host) {
      r.host = null;
      send(r.blue, { type: 'peerState', msg: '房主已断开，本局结束，请刷新页面重新开局', connected: false });
      for (const sp of r.spectators) send(sp, { type: 'peerState', msg: '房主已断开，本局结束', connected: false });
    } else if (ws === r.blue) {
      r.blue = null;
      send(r.host, { type: 'peerState', msg: '蓝方已断开，等待重连…', connected: false });
      // 蓝方席位空出：通知观战者可以刷新顶替
      for (const sp of r.spectators) {
        send(sp, { type: 'peerState', msg: '蓝方席位已空出，刷新页面即可顶替蓝方', connected: true });
      }
    } else if (r.spectators.delete(ws)) {
      if (r.spectators.size === 0) broadcastPeers(r);   // 只剩观战时不必广播
    }
    // 全部走光就回收房间，避免房间号泄漏
    if (!r.host && !r.blue && r.spectators.size === 0) rooms.delete(roomId);
  });

  ws.on('error', () => { /* 忽略 */ });
});

// ---- 启动 ----
function getLanIP() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  const isPrivate = (a) =>
    /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
  const isVirtual = (name, a) =>
    /(vmware|virtualbox|virtual|vbox|vethernet|hyper-v|wsl|venet|hamachi|zerotier|docker|tun|tap|loopback|vmnet|nordvpn|tailscale|vpn|以太网 3)/i.test(name) ||
    /^192\.168\.(56|137|138|139|152|128|192|10\d|11\d|12\d)\./.test(a); // VirtualBox Host-Only 等常见虚拟网段
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      candidates.push({ name, address: iface.address });
      if (isPrivate(iface.address) && !isVirtual(name, iface.address)) {
        return iface.address; // 优先：真实局域网私有地址
      }
    }
  }
  // 兜底：优先私有网段，其次任意非虚拟网卡
  for (const c of candidates) {
    if (isPrivate(c.address)) return c.address;
    if (!isVirtual(c.name, c.address)) return c.address;
  }
  return candidates.length ? candidates[0].address : '127.0.0.1';
}

httpServer.listen(PORT, HOST, () => {
  const lanIP = getLanIP();
  console.log('============================================');
  console.log('  马嘉棋2 双人联机服务器已启动（多房间 + 观战）');
  console.log('  主页（推荐入口，自动分房）: http://localhost:' + PORT + '/');
  console.log('  项目说明文档              : http://localhost:' + PORT + '/doc');
  console.log('  卡组编辑器                : http://localhost:' + PORT + '/deck');
  console.log('  房间号随便取（字母/数字/_/-），两人用同一个号即同桌');
  console.log('  第 3 人及以后自动进入观战（可看双方手牌与完整战报）');
  console.log('  房主(红方): http://localhost:' + PORT + '/play/1');
  console.log('  蓝方(另一台电脑): http://' + lanIP + ':' + PORT + '/play/1');
  console.log('  旧式写法（默认房间 1）: http://localhost:' + PORT + '/?host 与 /?join');
  console.log('  所有本机IPv4地址:');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('    ' + name + ' -> http://' + iface.address + ':' + PORT + '/');
      }
    }
  }
  console.log('============================================');
  // 自动打开主页（设置 MJQ2_NO_OPEN=1 可禁用，便于自动化测试；云托管不自动打开）
  if (!process.env.MJQ2_NO_OPEN && !DEPLOYED) {
    exec('start http://localhost:' + PORT + '/');
  }
});
