'use strict'
/*
 * 教师班主任工作台（改造版）· AI 服务端转发
 * - Key/base/model 存本文件旁的 config.json（gitignore），永不回传给页面
 * - /api/ai/chat：按服务商协议（OpenAI 兼容 / Claude）注入模型与鉴权后转发，
 *   响应原样管道透传（SSE 流式不被破坏，前端已有双协议解析器）
 * - 客户端中断（停止生成）同步断开上游请求
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const CFG_FILE = process.env.AI_CONFIG || path.join(__dirname, 'config.json');

function loadConfig() {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) { /* 不存在/损坏 → 用默认 */ }
  if (!cfg || typeof cfg !== 'object') cfg = {};
  if (!cfg.ai || typeof cfg.ai !== 'object') cfg.ai = { provider: '', base: '', key: '', model: '' };
  return cfg;
}

function saveConfig(patch) {
  const cfg = loadConfig();
  ['provider', 'base', 'model'].forEach(k => { if (typeof patch[k] === 'string') cfg.ai[k] = patch[k].trim(); });
  if (typeof patch.key === 'string' && patch.key.trim()) cfg.ai.key = patch.key.trim(); // key 为空 = 保留原值
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

function configured(cfg) {
  const a = cfg.ai;
  return !!(a.base && a.model && (a.key || /localhost|127\.0\.0\.1/.test(a.base)));
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '***';
  return k.slice(0, 3) + '***' + k.slice(-4);
}

/* GET /api/ai/config */
function getConfig(res, send) {
  const cfg = loadConfig();
  send(res, 200, {
    ok: true, provider: cfg.ai.provider, base: cfg.ai.base, model: cfg.ai.model,
    keyMasked: maskKey(cfg.ai.key), configured: configured(cfg)
  });
}

/* PUT /api/ai/config */
function putConfig(req, res, rawBody, send) {
  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return send(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
  if (!body || typeof body !== 'object') return send(res, 400, { ok: false, error: '请求格式错误' });
  const cfg = saveConfig(body);
  send(res, 200, {
    ok: true, provider: cfg.ai.provider, base: cfg.ai.base, model: cfg.ai.model,
    keyMasked: maskKey(cfg.ai.key), configured: configured(cfg)
  });
}

/* POST /api/ai/chat —— 流式转发 */
function chat(req, res, rawBody, send) {
  const cfg = loadConfig();
  if (!configured(cfg)) return send(res, 400, { ok: false, error: 'AI 还没配置：请到「设置 → AI 接口」填写接口地址、模型名称和 API Key' });
  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return send(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return send(res, 400, { ok: false, error: '缺少 messages' });
  if (!cfg.ai.model) return send(res, 400, { ok: false, error: '模型名称未填写，请到「设置 → AI 接口」填写' });

  const maxTokens = +body.maxTokens > 0 ? +body.maxTokens : 4096;
  const temp = typeof body.temperature === 'number' ? body.temperature : 0.7;
  const isClaude = cfg.ai.provider === 'claude' || /anthropic\.com/.test(cfg.ai.base || '');
  let url, headers, payload;
  if (isClaude) {
    url = cfg.ai.base.replace(/\/+$/, '') + '/messages';
    const sys = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    headers = { 'content-type': 'application/json', 'x-api-key': cfg.ai.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    payload = { model: cfg.ai.model, max_tokens: maxTokens, system: sys, stream: body.stream !== false, temperature: Math.min(1, temp), messages: body.messages.filter(m => m.role !== 'system') };
  } else {
    url = cfg.ai.base.replace(/\/+$/, '') + '/chat/completions';
    headers = { 'content-type': 'application/json' };
    if (cfg.ai.key) headers['authorization'] = 'Bearer ' + cfg.ai.key;
    payload = { model: cfg.ai.model, messages: body.messages, stream: body.stream !== false, temperature: temp };
    if (body.maxTokens) payload.max_tokens = body.maxTokens;
  }

  const lib = url.startsWith('https:') ? https : http;
  let up;
  try { up = lib.request(new URL(url), { method: 'POST', headers, timeout: 180000 }, r => {
    const h = {};
    Object.keys(r.headers).forEach(k => { if (k.toLowerCase().indexOf('access-control-') !== 0) h[k] = r.headers[k]; });
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  }); }
  catch (e) { return send(res, 502, '本地服务无法连接 AI 服务：' + e.message); }

  up.on('timeout', () => up.destroy(new Error('上游服务响应超时')));
  up.on('error', e => {
    if (!res.headersSent) send(res, 502, '本地服务无法连接 AI 服务：' + e.message + '。请检查接口地址和网络。');
    else res.end();
  });
  req.on('aborted', () => up.destroy());
  req.on('close', () => { if (!res.writableEnded) up.destroy(); });
  up.end(JSON.stringify(payload));
}

module.exports = { getConfig, putConfig, chat, loadConfig, configured };
