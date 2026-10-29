# Falcons 工作日志（Work Log）

团队成员每次在仓库中**新增 / 修改 / 删除**文件后，都要在本文件登记一行。

## 为什么写

- 追溯「谁、在什么时候、改了什么」
- 作为绩效考核与贡献占比的依据
- 避免重复劳动、文件覆盖和协作冲突
- 让队长和助教快速了解项目进展

## 填写规则

1. 每次改动后，在日志表**最上方**新增一行（最新的在最上面）。
2. 必填：日期、成员（GitHub 用户名）、类型、涉及文件/目录、内容说明、关联作业。
3. 一次提交或一个 PR 对应一行；批量上传可合并为一行，在说明里列出主要文件。
4. 只写事实，不夸大；不确定的内容写「待确认」。
5. 修改他人负责的文件前，先在群里沟通，并在日志中注明。
6. 每周例会由队长检查日志是否完整。

**类型**：新增 / 修改 / 删除 / 重构 / 修复 / 文档

## 工作日志表

| 日期 | 成员 (GitHub) | 类型 | 涉及文件/目录 | 内容说明 | 关联作业 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-29 | Betty-bear86 | 新增 | `assignment4/evidence/` | 完成匹配算法与大模型 API 接入调研报告：梳理双塔召回 + DeepFM 精排架构与 LLM 重排 / 解释方案，对比 Qwen、DeepSeek、豆包定价并测算日活 1 万下月成本约 1—3 万元，明确靠谱度页面分层逻辑（召回→精排→Top5 LLM 评分→前端展示） | 作业四 |
| 2026-10-29 | 060725 | 新增 | `assignment3/testing/`、`WORKLOG.md` | 上传 sportmate-app 交付包测试报告：verify.mjs 自检 99/99、5 个入口页 36 个本地资源可达、HTTP 状态/MIME 正常、类图 15 类无溢出、乱码校验通过、原型再生成 0 差异；过程中处理 3 个环境问题（GBK 编码、缺 Pillow、需先起服务），未发现代码缺陷，真机 UI 人工验收待确认 | 作业三 |
| 2026-10-27 | JorgeHUANG7 | 新增 | `assignment4/`、`WORKLOG.md`、`CONTRIBUTING.md` | 创建作业四目录与上传说明；新增团队工作日志并纳入协作规范 | 作业四 / 基础设施 |
| 2026-10-27 | L1n2iJVn | 新增 | `src/sportmate-app/` | 上传原型交付包：前端应用、单文件移动端原型（12 屏可点）、12 屏展板、类图、分享包 | 作业四 |
| 2026-10-18 | JorgeHUANG7 | 新增/修改 | `assignment3/srs/`、`assignment3/slides/`、`assignment3/blog/` | 上传 SRS V3.1（Word/PDF）、需求分析 PPT（PPTX/PDF）、作业三博客；更新 README | 作业三 |
| 2026-10-17 | Haoze Li | 新增/修改 | `assignment3/diagrams/`、`assignment3/prototypes/`、`src/` | 上传类图、12 屏原型与前后端源码；删除临时 zip | 作业三 |
| 2026-10-16 | snowball457 | 新增 | `src/backend/`、`src/frontend/`、`src/frontend-starter/`、`assignment3/` | 新增 FastAPI 后端、前端应用、类图与原型，按目录约定归档 | 作业三 |
| 2026-10-16 | snowball6657 | 合并 | PR #3 | 合并作业三交付物分支 | 作业三 |
| 2026-10-15 | Falcons_Group12 | 修改 | `README.md`、`CONTRIBUTING.md`、`assignment3/` | 按作业重构仓库结构，补充协作规范与作业三目录 | 基础设施 |
| 2026-10-11 | Falcons_Group12 | 新增 | `assignment2/` | 作业二博客、SRS V2.2、选题 PPT | 作业二 |

## 新增日志模板（复制这一行到表格最上方）

```markdown
| 2026-MM-DD | 你的GitHub用户名 | 新增/修改/删除 | `文件或目录` | 一句话说明改了什么、为什么 | 作业X |
```

## 示例

```markdown
| 2026-10-28 | example-user | 修改 | `assignment4/blog/` | 新增作业四博客的墨刀工具说明与原型链接 | 作业四 |
```
