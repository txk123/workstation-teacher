'use strict';
/*
 * 教师班主任工作台（改造版）· 数据持久化层
 * - envelope 格式：{ schemaVersion, rev, updatedAt, state }
 * - 原子写（临时文件 + 同盘 rename），杜绝写一半断电损坏
 * - 轮转备份：每日一份 + 迁移前快照 + 每 20 次保存留样，保留最近 30 份
 * - 链式迁移引擎：MIGRATIONS[n] 把 schemaVersion n 升到 n+1（纯函数）
 * - 防降级：数据文件比程序新 → 只读模式，绝不静默覆盖
 * 详见 FORK-NOTES.md
 */
const fs = require('fs');
const path = require('path');

let CURRENT_SCHEMA_VERSION = 1;

/* 迁移链：MIGRATIONS[n] = (state) => newState，把 v n 升到 v n+1。
 * 纯函数：只准改对象，禁止任何 I/O。前端业务字段的补默认值交给 index.html 的 migrate()。 */
const MIGRATIONS = {};

/* 注册迁移步骤（产品代码启动时或测试注入）：registerMigration(1, fn) 表示 v1 → v2，并自动把当前版本抬到 2 */
function registerMigration(from, fn) {
  if (typeof fn !== 'function') throw new Error('迁移函数必须是函数');
  if (from < 1) throw new Error('迁移起始版本必须 ≥ 1');
  MIGRATIONS[from] = fn;
  if (from + 1 > CURRENT_SCHEMA_VERSION) CURRENT_SCHEMA_VERSION = from + 1;
}

class StoreError extends Error {
  constructor(msg) { super(msg); this.name = 'StoreError'; }
}

function nowIso() { return new Date().toISOString(); }

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.env = null;        // envelope：{ schemaVersion, rev, updatedAt, state }
    this.readOnly = false;  // 防降级或迁移失败时置 true，拒绝一切写入
    this.lastError = null;
    this.lastDailyBackup = '';
  }

  /* 初始化存储目录并加载/迁移数据。成功返回 envelope，失败抛 StoreError（server 捕获后仍可启动，供前端展示错误） */
  init() {
    fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.env = { schemaVersion: CURRENT_SCHEMA_VERSION, rev: 1, updatedAt: nowIso(), state: null };
      this.writeAtomic(this.file, JSON.stringify(this.env, null, 1));
      return this.env;
    }
    let raw;
    try { raw = fs.readFileSync(this.file, 'utf8'); }
    catch (e) { throw new StoreError('数据文件无法读取：' + e.message); }

    let env;
    try { env = JSON.parse(raw); }
    catch (e) { throw new StoreError('数据文件损坏（不是合法 JSON），已停止加载以保护数据，原始文件未改动。可从 data/backups 里找最近一份恢复。'); }

    if (!env || typeof env !== 'object' || !('schemaVersion' in env)) {
      // 容错：用户直接把旧应用的备份 JSON（裸 S 对象）拷进来当数据文件
      if (env && typeof env === 'object' && env.settings && Array.isArray(env.classes)) {
        env = { schemaVersion: 1, rev: 1, updatedAt: nowIso(), state: env };
      } else {
        throw new StoreError('数据文件格式无法识别（缺少 schemaVersion）。');
      }
    }

    if (env.schemaVersion > CURRENT_SCHEMA_VERSION) {
      this.readOnly = true;
      this.lastError = '数据文件版本（v' + env.schemaVersion + '）比程序（v' + CURRENT_SCHEMA_VERSION + '）新，已进入只读模式。请升级程序后再打开，数据不会被覆盖。';
      throw new StoreError(this.lastError);
    }

    const fromVersion = env.schemaVersion;
    env = this.migrateChain(env);
    this.env = env;
    if (env.schemaVersion !== fromVersion) {
      // 迁移完成后立即写回，避免下次启动重复迁移（迁移前快照已在 migrateChain 里生成）
      this.writeAtomic(this.file, JSON.stringify(this.env));
      console.log('[数据迁移] v' + fromVersion + ' → v' + env.schemaVersion + ' 完成，快照在 ' + this.backupDir);
    }
    this.dailyBackup();
    return env;
  }

  /* 逐级升级到 CURRENT_SCHEMA_VERSION */
  migrateChain(env) {
    let v = env.schemaVersion;
    while (v < CURRENT_SCHEMA_VERSION) {
      const fn = MIGRATIONS[v];
      if (typeof fn !== 'function') throw new StoreError('缺少 v' + v + ' 的迁移函数，无法升级数据。');
      this.snapshot('pre-migrate-v' + v + '-' + Date.now());
      let next;
      try { next = fn(env.state); }
      catch (e) { throw new StoreError('数据迁移 v' + v + '→v' + (v + 1) + ' 失败：' + e.message + '（迁移前快照已保留，未写回）'); }
      env = { schemaVersion: v + 1, rev: (env.rev || 0) + 1, updatedAt: nowIso(), state: next };
      v++;
    }
    return env;
  }

  snapshot(name) {
    if (!fs.existsSync(this.file)) return;
    try { fs.copyFileSync(this.file, path.join(this.backupDir, name + '.json')); } catch (e) { /* 快照失败不阻塞主流程 */ }
  }

  dailyBackup() {
    const d = nowIso().slice(0, 10);
    if (d === this.lastDailyBackup) return;
    this.lastDailyBackup = d;
    this.snapshot('daily-' + d + '-rev' + (this.env ? this.env.rev : 0));
    const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.json')).sort();
    while (files.length > 30) {
      const f = files.shift();
      try { fs.unlinkSync(path.join(this.backupDir, f)); } catch (e) { /* 忽略 */ }
    }
  }

  /* 乐观锁保存：clientRev 必须与当前一致；返回新 rev */
  save(state, clientRev) {
    if (this.readOnly) throw new StoreError('只读模式：数据文件版本比程序新，禁止写入。');
    if (this.env && clientRev !== this.env.rev) {
      const e = new StoreError('数据已被其他窗口修改（版本号不匹配），请刷新页面后重试。');
      e.conflict = true;
      throw e;
    }
    const baseRev = this.env ? this.env.rev : 0;
    this.env = { schemaVersion: CURRENT_SCHEMA_VERSION, rev: baseRev + 1, updatedAt: nowIso(), state };
    if (this.env.rev % 20 === 0) this.snapshot('rev' + this.env.rev + '-' + Date.now());
    this.writeAtomic(this.file, JSON.stringify(this.env));
    this.dailyBackup();
    return this.env.rev;
  }

  writeAtomic(file, text) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  }
}

module.exports = { Store, StoreError, currentVersion: () => CURRENT_SCHEMA_VERSION, registerMigration };
