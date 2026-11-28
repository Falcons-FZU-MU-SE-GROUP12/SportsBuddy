# Alpha Sprint 关闭依据 —— Issue #4 / #6 / #10

> 日期：2026-11-28 ｜ 结论：以下三个 Issue 的功能与验收测试均已通过，可以关闭。
> 全量回归：`cd src/backend && py -m pytest -q` → **80 项全部通过**。

| Issue | 任务 | 验收测试文件 | 用例数 | 结果 | 引用提交 |
| --- | --- | --- | --- | --- | --- |
| #4 | S1 认证：登录/注册 API + token 持久化 | `tests/test_issue4_auth_acceptance.py` | 2 | ✅ 通过 | [`2b3b446`](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/commit/2b3b446) |
| #6 | S3 发起活动 API + 表单 | `tests/test_issue6_create_activity_acceptance.py` | 2 | ✅ 通过 | [`406908a`](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/commit/406908a) |
| #10 | S7 数据持久化 + 种子数据 | `tests/test_issue10_persistence_acceptance.py` | 2 | ✅ 通过 | [`02ad3f5`](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/commit/02ad3f5) |

## 各 Issue 关闭依据

### #4 认证（S1）
- **验收覆盖**：注册即得 token、登录、`/me` 鉴权、退出吊销 token。
- **证据**：`test_issue4_auth_acceptance.py` 2 条用例全过；提交 `2b3b446` 引用本 Issue。
- **补充**：前端 token 持久化（DEF-03）已于 11-28 修复（`src/frontend/frontend/src/api/index.js` 注册/登录后 `tokenStore.set()`），UI E2E 9/9 通过。

### #6 发起活动（S3）
- **验收覆盖**：创建活动返回新活动 + 签到码（仅发起人可见）、非法时间窗被 422 拒绝。
- **证据**：`test_issue6_create_activity_acceptance.py` 2 条用例全过；提交 `406908a` 引用本 Issue。

### #10 数据持久化 + 种子数据（S7）
- **验收覆盖**：文件库重启后数据仍在（持久化）、种子运动项目目录就绪。
- **证据**：`test_issue10_persistence_acceptance.py` 2 条用例全过；提交 `02ad3f5` 引用本 Issue。
- **补充**：演示种子 `seed_demo.py`（S16 #19）提供 3 账号 + 3 活动 + 2 报名，可幂等重复执行。

> 关闭方式：由队长在对应 Issue 上勾选「Evidence required」清单并点击 Close，引用本文件作为依据。
