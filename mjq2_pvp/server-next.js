const http = require('http');
const os = require('os');
const { exec } = require('child_process');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.argv[2] || process.env.PORT) || 3000;
const hostname = '0.0.0.0';
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const rooms = new Map();
const MAX_ROOMS = 1000;
const MAX_SPECTATORS = 20;

const send = (socket, message) => {
  if (socket && socket.readyState === 1) {
    try { socket.send(JSON.stringify(message)); } catch (_) {}
  }
};

function roomIdFromUrl(url) {
  const match = (url || '').match(/^\/ws\/([A-Za-z0-9_-]{1,32})/);
  return match ? match[1] : 'default';
}

function wantFromUrl(url) {
  const match = (url || '').match(/[?&]want=(auto|host|blue|watch)/);
  return match ? match[1] : 'auto';
}

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
  send(room.host, { type: 'peerState', msg: room.blue ? '蓝方已连接，开始游戏！' : '等待蓝方加入…', connected: !!room.blue, spectators: room.spectators.size });
  send(room.blue, { type: 'peerState', msg: room.host ? '已连接房主，开始游戏！' : '房主未连接', connected: !!room.host });
  for (const spectator of room.spectators) {
    send(spectator, { type: 'peerState', msg: room.host ? '观战中…' : '房主不在，等待房主开局…', connected: !!room.host });
  }
}

function attachWebSocket(wss) {
  wss.on('connection', (ws, request) => {
    const roomId = roomIdFromUrl(request.url);
    const want = wantFromUrl(request.url);
    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', msg: '服务器房间数已达上限，请稍后再试' });
      room = { host: null, blue: null, spectators: new Set() };
      rooms.set(roomId, room);
    }

    const role = pickRole(room, want);
    if (role === 'spectator' && room.spectators.size >= MAX_SPECTATORS) {
      send(ws, { type: 'error', msg: '房间「' + roomId + '」观战人数已满，请稍后再试' });
      return ws.close();
    }
    if (role === 'host') room.host = ws;
    else if (role === 'blue') room.blue = ws;
    else room.spectators.add(ws);
    ws._roomId = roomId;
    ws._role = role;

    send(ws, { type: 'assign', role, room: roomId, note: spectatorNote(want, role) });
    broadcastPeers(room);

    ws.on('message', (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch (_) { return; }
      if (ws === room.host) {
        if (message.type === 'state') {
          send(room.blue, { type: 'state', s: message.s });
          if (message.sw && room.spectators.size) for (const spectator of room.spectators) send(spectator, { type: 'state', s: message.sw });
        } else if (message.type === 'emote') {
          send(room.blue, { type: 'emote', side: message.side, index: message.index, text: message.text || '' });
          for (const spectator of room.spectators) send(spectator, { type: 'emote', side: message.side, index: message.index, text: message.text || '' });
        }
      } else if (ws === room.blue) {
        if (['click', 'next', 'reset'].includes(message.type)) send(room.host, { type: 'peerCmd', cmd: { type: message.type, id: message.id } });
        else if (message.type === 'cmd') send(room.host, { type: 'peerCmd', cmd: message.cmd });
      }
    });

    ws.on('close', () => {
      const current = rooms.get(roomId);
      if (!current) return;
      if (ws === current.host) {
        current.host = null;
        send(current.blue, { type: 'peerState', msg: '房主已断开，本局结束，请刷新页面重新开局', connected: false });
        for (const spectator of current.spectators) send(spectator, { type: 'peerState', msg: '房主已断开，本局结束', connected: false });
      } else if (ws === current.blue) {
        current.blue = null;
        send(current.host, { type: 'peerState', msg: '蓝方已断开，等待重连…', connected: false });
        for (const spectator of current.spectators) send(spectator, { type: 'peerState', msg: '蓝方席位已空出，刷新页面即可顶替蓝方', connected: true });
      } else current.spectators.delete(ws);
      if (!current.host && !current.blue && current.spectators.size === 0) rooms.delete(roomId);
    });
  });
}

function getLanIP() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal && /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) return iface.address;
    }
  }
  return '127.0.0.1';
}

app.prepare().then(() => {
  const server = http.createServer((request, response) => handle(request, response));
  const wss = new WebSocketServer({ noServer: true });
  attachWebSocket(wss);
  server.on('upgrade', (request, socket, head) => {
    if (!request.url.startsWith('/ws/')) return socket.destroy();
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  server.listen(port, hostname, () => {
    console.log(`马嘉棋2 Next.js 服务已启动: http://localhost:${port}/`);
    console.log(`局域网地址: http://${getLanIP()}:${port}/`);
    if (!process.env.MJQ2_NO_OPEN && !process.env.PORT) exec(`open http://localhost:${port}/`);
  });
});
