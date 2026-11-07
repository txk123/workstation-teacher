'use strict';
/* P3 冒烟测试：node server/smoke-p3.js
 * 用本地 mock 上游验证：配置存取（Key 掩码）、chat 流式透传、错误透传、未配置拦截 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bzr-smoke3-'));
process.env.AI_CONFIG = path.join(tmp, 'config.json');
process.env.DATA_DIR = tmp;
const { createApp } = require('./server');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

/* mock 上游：含 /err 的路径返回 401 JSON；其余一律返回 OpenAI SSE 流 */
const mock = http.createServer((rq, rs) => {
  if (rq.url.includes('/err')) { rs.writeHead(401, { 'content-type': 'application/json' }); rs.end('{"error":{"message":"Invalid API key"}}'); }
  else {
    rs.writeHead(200, { 'content-type': 'text/event-stream' });
    rs.write('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
    setTimeout(() => { rs.write('data: {"choices":[{"delta":{"content":"，老师"}}]}\n\n'); rs.write('data: [DONE]\n\n'); rs.end(); }, 50);
  }
});

(async () => {
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockBase = 'http://127.0.0.1:' + mock.address().port;

  const app = createApp(tmp);
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const U = 'http://127.0.0.1:' + app.server.address().port;

  console.log('场景1：未配置拦截');
  let r = await fetch(U + '/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
  let j = await r.json();
  check('未配置 → 400 提示', r.status === 400 && /还没配置/.test(j.error));

  console.log('场景2：配置存取');
  r = await fetch(U + '/api/ai/config', { method: 'PUT', body: JSON.stringify({ provider: 'custom', base: mockBase, key: 'sk-test-1234567890abcd', model: 'mock-1' }) });
  j = await r.json();
  check('PUT 成功 configured=true', j.ok === true && j.configured === true, JSON.stringify(j));
  check('响应不含明文 Key', !JSON.stringify(j).includes('sk-test-1234567890abcd'));
  check('Key 掩码', j.keyMasked === 'sk-***abcd', j.keyMasked);
  r = await fetch(U + '/api/ai/config');
  j = await r.json();
  check('GET 配置一致', j.ok && j.model === 'mock-1' && j.keyMasked === 'sk-***abcd');
  const cfgFile = JSON.parse(fs.readFileSync(process.env.AI_CONFIG, 'utf8'));
  check('config.json 含 Key（服务端本地）', cfgFile.ai.key === 'sk-test-1234567890abcd');

  console.log('场景3：chat 流式透传');
  r = await fetch(U + '/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], temperature: 0.5 }) });
  const text = await r.text();
  check('HTTP 200 + SSE 类型', r.status === 200 && (r.headers.get('content-type') || '').includes('text/event-stream'));
  check('SSE 内容原样透传', text.includes('"content":"你好"') && text.includes('data: [DONE]'), text.slice(0, 80));
  check('不回传 Key', !text.includes('sk-test'));

  console.log('场景4：上游错误透传');
  r = await fetch(U + '/api/ai/config', { method: 'PUT', body: JSON.stringify({ base: mockBase + '/err' }) });
  r = await fetch(U + '/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
  check('401 状态透传', r.status === 401);
  const errBody = await r.text();
  check('错误体透传（前端 httpErr 可解析）', errBody.includes('Invalid API key'));

  console.log('场景5：Key 更新与保留');
  r = await fetch(U + '/api/ai/config', { method: 'PUT', body: JSON.stringify({ key: '' , model: 'mock-2' }) });
  j = await r.json();
  const cfgFile2 = JSON.parse(fs.readFileSync(process.env.AI_CONFIG, 'utf8'));
  check('空 key 不覆盖原 Key', cfgFile2.ai.key === 'sk-test-1234567890abcd' && j.model === 'mock-2');
  r = await fetch(U + '/api/ai/config', { method: 'PUT', body: JSON.stringify({ key: 'sk-new-key-9999' }) });
  const cfgFile3 = JSON.parse(fs.readFileSync(process.env.AI_CONFIG, 'utf8'));
  check('新 Key 覆盖成功', cfgFile3.ai.key === 'sk-new-key-9999');

  app.server.close(); mock.close();
  console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('冒烟脚本错误：' + e.message); process.exit(1); });
