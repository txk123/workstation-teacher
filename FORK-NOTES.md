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
| 2026-11-07 | 改造版 r1 | P0-P6 基础改造（详见上节），初始 schemaVersion = 1 | 1 |

## 数据格式变更登记

每次发布带数据结构变更的新版本时，在此登记：

- `schemaVersion 1`（2026-11-07）：envelope 格式 `{ schemaVersion, rev, updatedAt, state }`，state 内为原应用 S 对象，无迁移函数。

## 合规声明

- 本项目及衍生版本仅供个人非商业使用；商用需原作者（cyberdaddyleo@outlook.com）书面授权
- 修改者：txk123
