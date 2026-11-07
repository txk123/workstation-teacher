'use strict';
/*
 * 教师班主任工作台（改造版）· 本地服务
 * 零依赖（Node >= 18 内置模块）：静态托管 + 数据 API + AI 服务端转发
 * 直接运行：node server/server.js  →  自动选端口(8788起)并打开浏览器
 * 作为模块：const { start } = require('./server')  →  便于测试
 * 详见 FORK-NOTES.md
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Store, StoreError } = require('./store');
const ai = require('./ai');

const ROOT = path.join(__dirname, '..');
const BASE_PORT = Number(process.env.PORT) || 8788;
const MAX_BODY = 64 * 1024 * 1024; // state JSON 上限 64MB

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ics': 'text/calendar; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};

function send(res, code, body, headers) {
  const h = Object.assign({ 'Cache-Control': 'no-store' }, headers || {});
  if (Buffer.isBuffer(body)) {
    h['Content-Type'] = h['Content-Type'] || 'application/octet-stream';
  } else if (typeof body === 'object' && body !== null) {
    h['Content-Type'] = h['Content-Type'] || 'application/json; charset=utf-8';
    body = JSON.stringify(body);
  }
  res.writeHead(code, h);
  res.end(body);
}

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) return send(res, 403, { ok: false, error: 'forbidden' }); // 防目录穿越
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { ok: false, error: 'not found' });
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createApp(dataDir) {
  const store = new Store(dataDir);
  let bootError = null;
  try { store.init(); }
  catch (e) { bootError = e instanceof StoreError ? e.message : ('数据加载失败：' + e.message); }

  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    try {
      if (url === '/api/health') {
        return send(res, 200, {
          ok: true, readOnly: store.readOnly, rev: store.env ? store.env.rev : null,
          schemaVersion: store.env ? store.env.schemaVersion : null, error: bootError || store.lastError || null
        });
      }
      if (url === '/api/state' && req.method === 'GET') {
        if (!store.env) return send(res, 500, { ok: false, error: bootError || '数据未加载' });
        return send(res, 200, { ok: true, data: store.env });
      }
      if (url === '/api/state' && (req.method === 'PUT' || req.method === 'POST')) {  // POST：关页 sendBeacon 兜底，语义同 PUT
        const raw = await readBody(req);
        let body; try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
        if (!body || typeof body !== 'object' || !('state' in body) || !('rev' in body)) {
          return send(res, 400, { ok: false, error: '请求格式应为 { state, rev }' });
        }
        try {
          const rev = store.save(body.state, body.rev);
          return send(res, 200, { ok: true, rev });
        } catch (e) {
          if (e.conflict) return send(res, 409, { ok: false, error: e.message, conflict: true });
          return send(res, 500, { ok: false, error: e.message });
        }
      }
      if (url === '/api/ai/config' && req.method === 'GET') return ai.getConfig(res, send);
      if (url === '/api/ai/config' && req.method === 'PUT') { const raw = await readBody(req); return ai.putConfig(req, res, raw, send); }
      if (url === '/api/ai/chat' && req.method === 'POST') { const raw = await readBody(req); return ai.chat(req, res, raw, send); }
      if (url.startsWith('/api/')) return send(res, 404, { ok: false, error: 'unknown api' });
      return serveStatic(req, res);
    } catch (e) {
      return send(res, 500, { ok: false, error: e.message });
    }
  });

  return { server, store, bootError: () => bootError };
}

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32' ? 'cmd /c start "" "' + url + '"'
    : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
  // 自动开浏览器失败（受限环境/无默认浏览器）不影响服务，提示手动访问即可
  try {
    exec(cmd, function (e) {
      if (e) console.log('（未能自动打开浏览器，请手动访问 ' + url + '）');
    });
  } catch (e) {
    console.log('（未能自动打开浏览器，请手动访问 ' + url + '）');
  }
}

/* 直接运行：选端口 → 启动 → 打开浏览器 */
if (require.main === module) {
  const dataDir = process.env.DATA_DIR || path.join(ROOT, 'data');
  const app = createApp(dataDir);
  let currentPort = BASE_PORT;

  app.server.on('listening', () => {
    const url = 'http://127.0.0.1:' + currentPort + '/';
    console.log('教师班主任工作台（本地服务版）已启动 → ' + url);
    console.log('数据目录：' + dataDir);
    if (app.bootError()) console.error('[数据警告] ' + app.bootError());
    if (app.store.readOnly) console.error('[只读模式] ' + app.store.lastError);
    openBrowser(url);
    console.log('按 Ctrl + C 关闭（数据不受影响）');
  });
  app.server.on('error', e => {
    if (e.code === 'EADDRINUSE' && currentPort < BASE_PORT + 10) {
      currentPort++;
      console.log('端口 ' + (currentPort - 1) + ' 被占用，改用 ' + currentPort);
      app.server.listen(currentPort, '127.0.0.1');
    } else {
      console.error('启动失败：' + e.message);
      process.exit(1);
    }
  });
  app.server.listen(currentPort, '127.0.0.1');
}

module.exports = { createApp, BASE_PORT };
