# SportsBuddy · Alpha 冲刺测试报告

| 项目 | 内容 |
|---|---|
| 课程 | EE308FZ Software Engineering |
| 团队 | Falcons（Group 12） |
| 仓库 | https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy |
| 对应 Issue | **#17 [Cross][TEST] Automated E2E + test report**（Owner: Wang Shaojie） |
| 报告日期 | 2026-11-24 |
| 测试岗 | Wang Shaojie |

---

## 1. 测试范围

本次针对 Alpha 冲刺已交付的后端代码执行回归与专项测试，重点验证：

1. 既有业务闭环是否仍完整（注册 → 发起 → 报名 → 签到 → 考勤 → 评价）；
2. **Issue #15「信用分规则」** 的六条规则是否被逐条守住（该 Issue 已标记关闭，但此前没有独立验收测试）；
3. 后端 README §11 自述的**并发报名竞态**是否真实存在；
4. 代码规范（`ruff check`）是否与「0 错误」的声明一致。

## 2. 测试环境

| 项 | 值 |
|---|---|
| 操作系统 | Windows（本地实机） |
| Python | 3.13.18 |
| pytest | 8.3.4 |
| FastAPI | 0.115.6 |
| SQLAlchemy | 2.1.2 |
| 数据库 | SQLite（测试用内存库；竞态探针用临时文件库） |
| 代码版本 | `main` 分支，2026-11-24 拉取（codeload zip，62.31 MB） |

## 3. 测试结果总览

| 指标 | 数值 |
|---|---|
| 用例总数 | **54** |
| 通过 | **54** |
| 失败 | **0** |
| 通过率 | **100%** |
| 执行耗时 | 约 4 s（全量） |

### 3.1 按文件分布

| 测试文件 | 用例数 | 职责 |
|---|---|---|
| `tests/test_flow.py` | 26 | 端到端业务闭环（既有） |
| `tests/test_issue15_credit_matrix.py` | 12 | **信用分规则矩阵（本次新增）** |
| `tests/test_startup.py` | 8 | 启动路径与路由注册（既有） |
| `tests/test_issue4_auth_acceptance.py` | 2 | 认证验收（既有） |
| `tests/test_issue6_create_activity_acceptance.py` | 2 | 发起活动验收（既有） |
| `tests/test_issue7_activity_list_acceptance.py` | 2 | 活动列表验收（既有） |
| `tests/test_issue10_persistence_acceptance.py` | 2 | 持久化验收（既有） |

## 4. Issue #15 信用分规则矩阵（本次新增，12/12 通过）

| 编号 | 规则 | 断言结果 |
|---|---|---|
| R1 | 新账号初始分 = 80 | 通过 |
| R2 | 签到成功 +2（80 → 82） | 通过 |
| R3 | 考勤确认不重复加分（仍为 82） | 通过 |
| R4 | 临近开始（<2h）取消 −2（80 → 78） | 通过 |
| R5 | 提前取消不扣分（保持 80） | 通过 |
| R6 | 爽约 −10（80 → 70） | 通过 |
| R7 | 恰好 60 分仍可报名（边界） | 通过 |
| R8 | 低于 60 分报名返回 403 且提示含「信用分」 | 通过 |
| R9 | 一次考勤惩罚全部缺席者（到场 +2、缺席各 −10） | 通过 |
| R10 | 分数由全量历史重算，重复读取不漂移（连读 5 次均为 70） | 通过 |
| R11 | 下限截断：9 次爽约后为 0，不为负 | 通过 |
| R12 | 上限截断：封顶 100，不为 102 | 通过 |

> 说明：R11 的用例设计需要先把 9 场活动全部报名（此时分数仍为 80），再逐场确认考勤；因为分数一旦跌破 60，接口就会拒绝新的报名，无法再制造爽约。这是测试过程中发现的**接口约束**，已体现在用例注释里。

## 5. 发现的缺陷

### DEF-01 并发报名可超员（严重）

| 项 | 内容 |
|---|---|
| 位置 | `POST /activities/{id}/join` |
| 期望 | 容量为 2 的活动，最多只能有 2 人报名成功 |
| 实际 | 12 个并发请求中，**5–9 人（多次复现依次为 7、7、8、9、5）**报名成功 |
| 复现率 | **5/5（100%）**，每次均突破容量，入队人数在 5–9 之间波动 |
| 根因 | `services.py` 中「检查容量 → 写入报名」之间没有唯一约束与事务保护，存在竞态窗口（后端 README §11 已自述该风险） |
| 影响 | 活动超员、签到码/考勤/评价的人数统计与信用分结算随之错误；高并发下可被用于恶意占位 |
| 建议修复 | ① 对 `registrations(activity_id, user_id)` 加唯一约束；② 报名写入改为 `SELECT ... FOR UPDATE` 或带条件更新的原子语句；③ 冲突时返回 409 并提示「已满员」 |

**复现命令**

```powershell
cd src/backend
py tools/race_probe.py
# 退出码 1 = 已复现缺陷；输出会打印 201 数量与 joined_count
```

> 测试证据图展示的是 3 次连续复现（7 / 7 / 8）；本节另记录 9、5 两次，合计 5/5。

实测输出：

```
容量 capacity       : 2
并发报名线程数      : 12
返回 201 的数量     : 8
接口返回值分布      : [201, 409, 201, 201, 201, 201, 409, 409, 201, 201, 201, 409]
joined_count (实况) : 8
slots_left   (实况) : 0
```

另有一次复现为 9 人入队：返回 9 个 201，joined_count = 9，slots_left = 0。

> 该缺陷为非确定性竞态：每次复现入队人数在 5–9 之间波动（已观测 7、7、8、9、5），但**五次全部突破容量 2 的上限**。因此缺陷的存在性可稳定复现，具体超员人数不固定。

### DEF-02 代码规范回归（一般）

| 项 | 内容 |
|---|---|
| 位置 | `tests/test_issue7_activity_list_acceptance.py:27`、`:28` |
| 实际 | `ruff check .` 报 2 处 `E501 Line too long (103 > 100)` |
| 期望 | 与工作日志中「`ruff check .` 0 错误」的声明一致 |
| 影响 | 18% 的「代码规范」评分项存在被扣分的风险；规范声明与仓库现状不一致 |
| 建议修复 | 两行 `assert ... .post(...)` 拆行即可，约 2 分钟 |

## 6. 测试过程中的一处假设修正（非缺陷）

首轮执行 R2 时断言 `completed_count == 1`，实际返回 0，初步按缺陷记录。核对 `services.py` 后确认：

```python
# ``completed_count`` tracks confirmed attendance, not raw check-ins.
user.completed_count = attended
```

即 `completed_count` 统计的是**考勤确认到场**，而非签到次数。该语义在后端注释中已明确，**判定为测试用例的假设错误，不是产品缺陷**，已修正断言并复跑通过。此项记录保留，用于说明结论的可追溯性。

## 7. 遗留风险与未覆盖项

| 风险 | 说明 | 建议 |
|---|---|---|
| 前端 UI 级 E2E 未执行 | 本次全部为后端接口层测试，前端仅能依赖队友的 `tools/verify.mjs`（走 mock，不碰真后端） | 补 Playwright/无头 Edge 脚本，用 `?mock=0` 跑真实链路 |
| #8 #9 #11 #12 #13 #14 无独立验收测试 | 这 6 个 Issue 目前只有 `test_flow.py` 的间接覆盖 | 按 #4/#6/#7/#10 的命名规范补齐 |
| 并发仅覆盖报名接口 | 取消报名、考勤、评价的并发一致性未测 | 扩展探针脚本 |
| SQLite 与生产库差异 | SQLite 的写锁行为掩盖了部分并发问题，PostgreSQL 下表现可能不同 | 在 Render 实例上复测一次 |

## 8. 复现命令汇总

```powershell
cd src/backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m pytest tests/test_issue15_credit_matrix.py -v
python -m ruff check .
python tools/race_probe.py
# 退出码 1 = 已复现并发超员缺陷 DEF-01
```

## 9. 结论

- Alpha 版本**后端业务闭环可用**：54 项用例全部通过，无阻断性缺陷。
- **Issue #15 的六条信用分规则全部按设计生效**，含 60 分阈值与 0/100 截断两个边界。
- **DEF-02 已修复**（拆行，ruff 恢复 0 错误）；**DEF-01 严重并发缺陷仍待修复**，建议挂入 Issue #18（bug-fix buffer）。
- 前端 UI 级 E2E 仍是最大空白，对应 Issue #17 的「E2E covers login to review」尚未真正达成。

---

*本报告所有数字均来自 2026-11-24 本机实测，证据图见 `docs/shots/alpha-test-evidence-2026-11-24.png`。*
