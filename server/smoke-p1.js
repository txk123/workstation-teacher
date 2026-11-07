'use strict';
/* P1 冒烟测试：node server/smoke-p1.js
 * 覆盖：API 往返、乐观锁冲突、重启恢复、损坏文件保护、防降级只读、静态托管 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createApp } = require('./server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bzr-smoke-'));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

(async () => {
  const base = 'http://127.0.0.1';
  // ── 场景1：首次启动 ──
  let app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  let port = app.server.address().port;
  let U = base + ':' + port;
  console.log('场景1：首次启动 @ ' + U);
  let h = await (await fetch(U + '/api/health')).json();
  check('health ok', h.ok === true && h.rev === 1 && h.schemaVersion === 1, JSON.stringify(h));
  let s = await (await fetch(U + '/api/state')).json();
  check('初始 state 为空 rev=1', s.ok === true && s.data.state === null && s.data.rev === 1);
  let idx = await fetch(U + '/');
  check('静态托管 index.html', idx.status === 200 && (await idx.text()).includes('<!doctype html>'));

  // ── 场景2：乐观锁与保存 ──
  console.log('场景2：保存与冲突');
  let wrong = await fetch(U + '/api/state', { method: 'PUT', body: JSON.stringify({ state: { a: 1 }, rev: 99 }) });
  check('rev 不匹配 → 409', wrong.status === 409);
  let ok = await fetch(U + '/api/state', { method: 'PUT', body: JSON.stringify({ state: { settings: { x: 1 }, classes: [] }, rev: 1 }) });
  let okj = await ok.json();
  check('正确 rev 保存 → rev=2', ok.status === 200 && okj.rev === 2, JSON.stringify(okj));
  let s2 = await (await fetch(U + '/api/state')).json();
  check('读回一致', s2.data.state.settings.x === 1);
  let bad = await fetch(U + '/api/state', { method: 'PUT', body: 'not-json' });
  check('非法请求体 → 400', bad.status === 400);

  // ── 场景3：关闭进程后重启，数据完好 ──
  console.log('场景3：重启恢复');
  await new Promise(r => app.server.close(r));
  app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  U = base + ':' + app.server.address().port;
  s2 = await (await fetch(U + '/api/state')).json();
  check('重启后数据仍在 rev=2', s2.data.rev === 2 && s2.data.state.settings.x === 1);

  // ── 场景4：文件损坏 → 保护性报错 ──
  console.log('场景4：损坏保护');
  await new Promise(r => app.server.close(r));
  fs.writeFileSync(path.join(tmp, 'state.json'), '{broken json!!');
  app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  U = base + ':' + app.server.address().port;
  s2 = await (await fetch(U + '/api/state')).json();
  check('损坏文件 → 500 + 明确错误', s2.ok === false && /损坏/.test(s2.error));
  check('损坏文件保留未覆盖', fs.readFileSync(path.join(tmp, 'state.json'), 'utf8') === '{broken json!!');

  // ── 场景5：防降级 → 只读 ──
  console.log('场景5：防降级');
  await new Promise(r => app.server.close(r));
  fs.writeFileSync(path.join(tmp, 'state.json'), JSON.stringify({ schemaVersion: 99, rev: 5, state: { a: 1 } }));
  app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  U = base + ':' + app.server.address().port;
  h = await (await fetch(U + '/api/health')).json();
  s2 = await (await fetch(U + '/api/state')).json();
  const putRO = await fetch(U + '/api/state', { method: 'PUT', body: JSON.stringify({ state: {}, rev: 5 }) });
  check('新版数据 → 只读模式标记', h.readOnly === true && s2.ok === false);
  check('只读模式拒绝写入', putRO.status === 500);

  await new Promise(r => app.server.close(r));
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('冒烟测试脚本错误：' + e.message); process.exit(1); });
