# 测试报告（2026-11-28）— Alpha 冲刺回归轮

- 执行人：060725（Wang Shaojie，测试岗）
- 关联 Issue：[#17](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/17)（测试与缺陷跟踪）、[#18](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/18)（bug-fix buffer）
- 回归范围：`e11bb3c`（11-24 22:17）之后至 `c3b1123`（11-28 14:15），共 **13 笔提交**
- 目标：确认上一轮报告的 DEF-01 / DEF-02 是否真的修好，并检查新合入功能有没有回归

## 一、结论速览

| 检查项 | 结果 | 判定 |
|---|---|---|
| 后端全量测试 | **76 passed**（`10.79s`），上轮为 54 → 新增 22 条 | 通过 |
| 代码规范 `ruff check .` | **All checks passed**，0 错误 | **DEF-02 已关闭** |
| 并发探针 `tools/race_probe.py` | 容量 2 / 12 并发，**连续 4 次**全部 `201=2`、`joined=2`、`exit 0` | **DEF-01 已关闭** |
| 容量-状态联动回归（自建用例） | 满员→取消后恢复 `open`、`slots_left=1`、第三人可报名；取消后可重新报名 | 无回归 |
| 演示种子 `seed_demo.py` | 首次 3 账号 / 3 活动 / 2 报名；**重复执行数量不变** | 通过（幂等） |
| UI 端到端（真后端） | **9 个断言全部通过，退出码 0** | 通过（DEF-03 修复后重跑） |

一句话：**上轮报的两个缺陷都被修掉了；UI E2E 又抓到一个阻断性的 DEF-03，已当场修复并复验通过（9/9 全绿）**，另有两个非阻断问题待处理。

## 二、用例规模变化

| 测试文件 | 用例数 | 说明 |
|---|---|---|
| `test_flow.py` | 26 | 端到端业务流程（API 层） |
| `test_issue4_auth_acceptance.py` | 2 | 登录 / 注册 / token 持久化 |
| `test_issue6_create_activity_acceptance.py` | 2 | 发起活动 |
| `test_issue7_activity_list_acceptance.py` | 2 | 活动列表 + 筛选 |
| `test_issue8_activity_detail_acceptance.py` | 4 | 活动详情（新增） |
| `test_issue9_join_leave_acceptance.py` | 5 | 报名 / 取消 + 信用分（新增） |
| `test_issue10_persistence_acceptance.py` | 2 | 数据持久化 |
| `test_issue11_checkin_acceptance.py` | 4 | 签到（新增） |
| `test_issue12_attendance_acceptance.py` | 3 | 考勤（新增） |
| `test_issue13_my_activities_acceptance.py` | 3 | 我的局（新增） |
| `test_issue14_reviews_acceptance.py` | 3 | 评价（新增） |
| `test_issue15_credit_matrix.py` | 12 | 信用分规则矩阵（上轮新增） |
| `test_startup.py` | 8 | 启动 / 健康检查 / 字典种子 |
| **合计** | **76** | 上轮 54，本轮 +22 |

新增的 6 个 Issue 验收文件（#8 #9 #11 #12 #13 #14）由开发侧在 11-24 / 11-26 补齐，本轮由测试侧统一复跑确认。

## 三、缺陷状态

| 编号 | 缺陷 | 状态 | 证据 |
|---|---|---|---|
| DEF-01 | 并发报名超员（容量被突破） | **已关闭** | `docs/test-logs-2026-11-28/race-probe-4runs.txt`（4/4 次守住容量） |
| DEF-02 | `ruff check` 非 0（两处 E501，103>100） | **已关闭** | `docs/test-logs-2026-11-28/ruff.txt`（`All checks passed!`） |
| DEF-03 | 前端登录不持久化 token，接真后端登录必然失败（阻断） | **已修复并复验** | `docs/e2e/e2e-report-2026-11-28.md`、`02-DEF03-login-blocked-before-fix.png` → `02-login-success.png` |
| DEF-04 | 考勤把发起人自动记为「已到场」，人数出现 3/2、信用分虚增 | **新增 / 未修复** | `docs/e2e/09-detail-finished.png` |
| DEF-05 | 活动卡片把项目图标渲染成英文键名 `badminton`，压住标题 | **新增 / 未修复** | `docs/e2e/03-activities.png` |

DEF-03 修复涉及 1 个文件（`src/frontend/frontend/src/api/index.js`）：`register()` 与 `login()` 拿到 `access_token` 后立即 `tokenStore.set()`。修复后重跑 E2E → **9/9 通过、退出码 0**；前端 mock 自检 `node tools/verify.mjs` → **161 项全部通过**（无回归）。

DEF-01 修复方式（供日志引用）：SQLite 侧在 `db.py` 里把每个事务改成 `BEGIN IMMEDIATE`（读之前先拿写锁），Postgres 侧在 `services.py` 里对活动行做 `SELECT … FOR UPDATE`，并把容量判断从「读 `slots_left`」改成「按有效报名数 `count()` 比较」，最后用 `(activity_id, user_id)` 唯一约束兜底。

## 四、自建回归用例（容量与状态联动）

针对 DEF-01 修复后「满员 → 取消 → 能否恢复可报名」这条容易漏的路径，补了一次临时回归（未入库为固定用例）：

| 场景 | 期望 | 实测 |
|---|---|---|
| 容量 2，两人报名 | `status=full`、`slots_left=0`、`joined=2` | 一致 |
| 满员时第三人报名 | 409 拒绝 | 409 |
| 其中一人取消 | `status=open`、`slots_left=1`、`joined=1` | 一致 |
| 取消后第三人报名 | 201 成功 | 201 |
| 同一人取消后重新报名 | 成功，`joined_count` 回到 1 | 一致 |

结论：没有出现「活动被永久锁在 full」这类回归。

## 五、命令与日志

```bash
cd src/backend
python -m pytest                      # 76 passed
python -m ruff check .                # All checks passed
python tools/race_probe.py            # exit 0 = 容量守住（DEF-01 已修复）
python seed_demo.py                   # 演示数据，可重复执行（幂等）
```

| 日志 | 内容 |
|---|---|
| `docs/test-logs-2026-11-28/pytest-76.txt` | 76 passed in 10.79s |
| `docs/test-logs-2026-11-28/ruff.txt` | All checks passed! |
| `docs/test-logs-2026-11-28/race-probe-4runs.txt` | 探针连续 4 次，全部 201=2 / exit 0 |

## 六、遗留与建议

1. **DEF-03 已修复**（`api/index.js` 里 register/login 补 `tokenStore.set`），E2E 复验 9/9 通过；改动仅前端 1 个文件，提交时请勿与后端改动混在一起。
2. **DEF-04 建议在 Beta 前处理**：考勤会把发起人自动记为到场，导致人数超容量、信用分虚增，会让「防爽约」这个项目差异点的数据失真。
3. **DEF-05 可顺手修**：卡片图标位输出英文键名 `badminton`，主列表页视觉异常，答辩截图很扎眼；建议前端加 `icon → emoji` 映射。
4. 六个新 Issue 验收文件都是「开发自测」，测试侧目前只做了复跑确认，未逐条设计反向用例；若时间允许，优先给 #9（报名/取消 + 信用分）补边界用例，因为它直接改动了信用分计算路径。
5. `race_probe.py` 头部注释仍写着「存在竞态窗口，高并发下可能超员」，与 README §11「已修复」不一致，建议订正为「回归探针」。
