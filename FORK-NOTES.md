# FORK-NOTES · 修改说明

本仓库是基于 [cyberdaddyleo/workstation-teacher](https://github.com/cyberdaddyleo/workstation-teacher)（v2.0.0，commit f28ca56）的二次开发版本。

按原项目《教师班主任工作台非商业许可协议》第三条要求，本文件登记全部修改内容；原作者版权声明与署名保留于 [LICENSE](LICENSE) 和应用「设置 → 关于」页。

## 本分支的改动目标

将单文件 HTML 应用改造为「Node.js 本地服务 + 浏览器」形态：

- 数据从浏览器 localStorage 迁移到本机 `data/state.json`（原子写 + 轮转备份）
- AI 请求改为服务端流式转发（根治部分服务商不允许网页直连的跨域问题）
- 数据文件带 `schemaVersion` envelope 与链式迁移引擎，支持本产品自身版本演进
- 打包为免安装成品分发给老师用户

## 修改清单

| 日期 | 版本 | 修改内容 | 涉及 schemaVersion |
|---|---|---|---|
| 2026-11-07 | 改造版 r1 | P0-P6 基础改造，初始 schemaVersion = 1 | 1 |

### r1 详细改动（2026-11-07）

**P0 基线**
- 新增 `.gitignore`（data/、config.json、dist/、node_modules/）与本文件

**P1 后端骨架（新增 server/，零 npm 依赖）**
- `server.js`：静态托管 + REST API，端口 8788 起自动避让，启动自动开浏览器（失败不致命）
- `store.js`：envelope 数据文件 `{schemaVersion, rev, updatedAt, state}`、原子写（临时文件+rename）、每日轮转备份 + 每 20 次保存留样（保留 30 份）、乐观锁、损坏文件保护、防降级只读模式

**P2 前端存储切换（index.html）**
- localStorage 包装器 → `ServerStore`（/api/state 读写、失败自动重试、sendBeacon 关页兜底）
- 启动改异步；服务未启动时显示引导页
- 数据相关文案从“浏览器存储”改为“data 目录”
- `start.bat` / `start.sh` 一键启动

**P3 AI 服务端化**
- `server/ai.js`：`/api/ai/chat` 按服务商协议（OpenAI 兼容 / Claude）注入鉴权后转发，响应原样管道透传（SSE 流式不变）；`/api/ai/config` 读写配置，Key 掩码永不回显
- AI 配置（Key/base/model）从浏览器 state 迁移到 `server/config.json`
- 前端 `AIC` 改走本地服务；AI 设置页改为服务端配置 + 自动保存
- 智谱 GLM 等不支持浏览器 CORS 的服务商从此可直接使用

**P4 数据迁移引擎**
- `registerMigration(n, fn)` 链式迁移：升级自动执行、每级迁移前自动快照、失败不写回、完成后写回并日志
- 防降级：数据文件版本高于程序 → 只读模式拒绝覆盖
- 前端 `migrate()` 对导入备份剥除 `ai.key/base/model`（凭据统一归服务端 config.json）

**P5 打包**
- `scripts/build-dist.ps1`：构建绿色版 zip（便携 node.exe + 应用 + 启动脚本 + 使用说明，约 32MB）

**P6 收尾**
- 本 README 重写（原版移至 docs/UPSTREAM-README.md）
- 关于页保留原作者署名与协议说明，追加修改者信息
- 界面可见签名（教室水印、引导页、欢迎页）替换为修改者署名 "Developed by @txk"（欢迎页页脚的来源说明后缀应用户要求移除）；原作者署名保留于关于页与 LICENSE（合规最低集合）

## 数据格式变更登记

每次发布带数据结构变更的新版本时，在此登记：

- `schemaVersion 1`（2026-11-07）：envelope 格式 `{ schemaVersion, rev, updatedAt, state }`，state 内为原应用 S 对象，无迁移函数。

## 合规声明

- 本项目及衍生版本仅供个人非商业使用；商用需原作者（cyberdaddyleo@outlook.com）书面授权
- 修改者：txk123
