'use strict';
/* P4 冒烟测试：node server/smoke-p4.js
 * 迁移引擎机制验证：链式升级、迁移前快照、失败保护（不写回）、防降级只读 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Store, registerMigration } = require('./store');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

function freshDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'bzr-smoke4-')); }
function newStore(dir) { const s = new Store(dir); s.init(); return s; }

console.log('场景1：单级迁移 v1→v2');
{
  const dir = freshDir();
  const s1 = newStore(dir);
  s1.save({ hello: 'v1 数据', n: 1 }, 1);
  registerMigration(1, state => ({ ...state, extra: 'v2 新增字段' }));
  const s2 = newStore(dir);   // 重新加载：应自动升级
  check('schemaVersion 升到 2', s2.env.schemaVersion === 2, String(s2.env.schemaVersion));
  check('数据字段保留', s2.env.state.hello === 'v1 数据' && s2.env.state.n === 1);
  check('迁移函数生效', s2.env.state.extra === 'v2 新增字段');
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  check('迁移前快照已生成', backups.some(f => f.startsWith('pre-migrate-v1-')), backups.join(','));
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  check('升级结果已写回文件', raw.schemaVersion === 2 && raw.state.extra === 'v2 新增字段');
}

console.log('场景2：多级链式迁移 v1→v2→v3');
{
  const dir = freshDir();
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  // 直接构造 v1 原始文件（绕过 save()，save 会按当前版本号写盘）
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ schemaVersion: 1, rev: 1, updatedAt: 't', state: { step: 0 } }));
  registerMigration(1, state => ({ ...state, step: state.step + 1 }));
  registerMigration(2, state => ({ ...state, step: state.step + 10 }));
  const s3 = new Store(dir); s3.init();
  check('两级迁移都执行（0→1→11）', s3.env.schemaVersion === 3 && s3.env.state.step === 11, JSON.stringify(s3.env.state));
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  check('每一级都有快照', backups.some(f => f.startsWith('pre-migrate-v1-')) && backups.some(f => f.startsWith('pre-migrate-v2-')));
}

console.log('场景3：迁移失败 → 不写回、报错明确');
{
  const dir = freshDir();
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  const raw = JSON.stringify({ schemaVersion: 1, rev: 1, updatedAt: 't', state: { keep: '原始数据' } });
  fs.writeFileSync(path.join(dir, 'state.json'), raw);
  registerMigration(1, () => { throw new Error('模拟迁移崩溃'); });
  let err = null;
  try { const s = new Store(dir); s.init(); } catch (e) { err = e; }
  check('抛出迁移错误', !!err && /模拟迁移崩溃/.test(err.message), err ? err.message : '没抛错');
  check('原文件未被覆盖', fs.readFileSync(path.join(dir, 'state.json'), 'utf8') === raw);
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  check('失败前快照仍保留', backups.some(f => f.startsWith('pre-migrate-v1-')));
}

console.log('场景4：缺迁移函数 → 拒绝加载');
{
  // 用一个独立的 Store 实例组（清空 MIGRATIONS 不可行，这里用未注册的高版本文件代替）
  const dir = freshDir();
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ schemaVersion: 99, rev: 3, state: { x: 1 } }));
  const s = new Store(dir);
  let err = null;
  try { s.init(); } catch (e) { err = e; }
  check('版本过高 → 只读模式', s.readOnly === true && !!err && /比程序.*新/.test(err.message));
}

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
