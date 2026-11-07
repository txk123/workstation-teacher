# 教师班主任工作台 · 本地服务版

> 基于 [@赛博老爸](https://github.com/cyberdaddyleo) 的开源项目 [workstation-teacher](https://github.com/cyberdaddyleo/workstation-teacher)（v2.0.0）二次开发。
> 原版功能说明见 [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md)，本改造版的全部修改登记在 [FORK-NOTES.md](FORK-NOTES.md)。

## 这个版本改了什么

| | 原版（单文件应用） | 本地服务版（本仓库） |
|---|---|---|
| 运行方式 | 双击 index.html 用浏览器打开 | 双击「启动工作台」，浏览器访问 http://127.0.0.1:8788 |
| 数据存储 | 浏览器 localStorage（~5MB，清浏览器数据即丢） | 本机 `data/state.json`（原子写 + 每日轮转备份，保留 30 份） |
| AI 直连 | 受浏览器跨域限制，部分服务商（如智谱）连不上 | 服务端转发，各家服务商都能直连；流式输出不变 |
| API Key | 存浏览器 | 存本机 `app/server/config.json`，页面永不回显 |
| 数据升级 | — | 数据文件带 `schemaVersion`，升级自动迁移（迁移前自动留快照，失败不写回） |
| 多标签页 | 互相覆盖 | 乐观锁保护，冲突时提示刷新 |

功能本身与原版一致：教室、考勤、课堂点评、课表、教学进度、作业、成绩、值日表、学生档案、AI 助手等。

## 快速开始

**给老师用（免安装）：**

1. 拿到绿色版压缩包，解压到任意文件夹
2. 双击「启动工作台.bat」——浏览器自动打开即用
3. 数据在包内 `data` 目录，换电脑拷走整个文件夹即可

**开发者：**

```bash
git clone https://github.com/txk123/workstation-teacher.git
cd workstation-teacher
git switch dev           # 二开都在 dev 分支
node server/server.js    # 启动本地服务，自动打开浏览器
node server/smoke-p1.js  # 冒烟测试（p1/p3/p4 同理）
pwsh -File scripts/build-dist.ps1   # 构建绿色版交付包
```

要求 Node.js ≥ 18（打包用 22），无任何 npm 依赖。

## 目录结构

```
├── index.html            # 前端本体（7946 行原版 UI，只动了存储层与 AI 层）
├── server/
│   ├── server.js         # 零依赖 HTTP 服务：静态托管 + REST + AI 转发
│   ├── store.js          # 数据持久化：envelope、原子写、备份、迁移引擎
│   ├── ai.js             # AI 服务端转发（OpenAI 兼容 / Claude 双协议）
│   ├── config.example.json
│   └── smoke-p*.js       # 各阶段冒烟测试
├── scripts/build-dist.ps1 # 打包绿色版
├── data/                  # 运行时数据（gitignore）
└── docs/UPSTREAM-README.md # 原版说明留档
```

## 数据文件格式

`data/state.json`：

```json
{ "schemaVersion": 1, "rev": 42, "updatedAt": "...", "state": { /* 应用全部数据 */ } }
```

- `schemaVersion`：存储格式版本。升级程序后首次启动自动逐级迁移（迁移前快照存 `data/backups/`）
- `rev`：乐观锁版本号，多标签页写入冲突时返回 409
- 发布带结构变更的新版本时：在 store.js 里 `registerMigration(n, fn)` 并在 FORK-NOTES.md 登记

## 开源协议

本项目遵循原版《教师班主任工作台非商业许可协议》（见 [LICENSE](LICENSE)）：

- ✅ 个人免费使用、修改、二次开发、分发（衍生版须保留原作者署名与本协议）
- ❌ 禁止任何形式的商业使用，商用需原作者书面授权（cyberdaddyleo@outlook.com）

## 致谢与署名

- 原项目与全部产品设计：**@赛博老爸**（cyberdaddyleo）
- 本地服务版改造：txk123 —— 改动清单见 [FORK-NOTES.md](FORK-NOTES.md)
