# Issue #9 · Sign up / cancel sign-up —— 验收与运行证据

> 截图引用的是 GitHub 仓库绝对地址（raw.githubusercontent.com），
> 需先把 `docs/shots/` 下 5 张 PNG 推上 `main`，否则图片会 404。

| 项 | 内容 |
|---|---|
| Issue | [#9 [P0][BE/FE] Sign up / cancel sign-up](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/9)（S6，Alpha Sprint 2026-11-21 ~ 11-28，5 点） |
| 页面 | P-04 活动详情 `#/activity/:id`（报名 / 取消报名） |
| 接口 | `POST /activities/{id}/join`、`DELETE /activities/{id}/join`、`GET /activities/mine` |
| 分支 | `feat/activity-join-leave-issue9` |
| 建议提交 | `feat(join): sync credit rules and wire join/cancel to real backend (#9)` |
| 运行方式 | 真实后端 FastAPI（127.0.0.1:8000）+ 前端 `?mock=0`，非离线示意数据 |

---

## 1. 验收标准逐条对照

| AC | 结论 | 实现 | 证据 |
|---|---|---|---|
| Join updates status | ✅ | `api.joinActivity()` 成功后刷新详情与「我报名的」；名额 -1、参与者列表出现本人、重复报名 409 提示 | H 段 AC1 共 7 项断言；[issue9-joined-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-joined-390.png)、[issue9-join-sheet-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-join-sheet-390.png) |
| Full activity cannot be joined | ✅ | 按钮按 `slots_left` 置灰为「名额已满」；后端返回 409「活动已满员」时红色错误条直接显示 | H 段 AC2 共 2 项断言；[issue9-full-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-full-390.png) |
| Credit < 60 cannot join | ✅ | 前端按 `reliability_score < 60` 提前禁用按钮并说明原因；后端 403 兜底 | H 段 AC3 共 3 项断言；[issue9-lowcredit-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-lowcredit-390.png) |
| Cancel works before start | ✅ | 取消后从「我报名的」移除、名额恢复、可重新报名；距开始 <2h 取消弹二次确认并提示扣 2 分，后端 `is_late_cancel=true` 实扣 2 分 | H 段 AC4 共 4 项断言；[issue9-latecancel-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-latecancel-390.png) |

## 2. 真实后端接口实测（?mock=0，本机 FastAPI 实测输出）

```text
A_join 报名前 slots= 6
join9 报名 A_join -> 201
A_join 报名后 slots= 5 joined= 1
重复报名 -> 409 {"detail":"你已经报名过该活动"}
join9 报名满员 B_full -> 409 {"detail":"活动已满员"}
low9(50分) 报名 D_free -> 403 {"detail":"信用分 50 低于 60，暂时无法报名新活动…"}
join9 报名 C_soon(90min后) -> 201
临期取消 C_soon -> 200 is_late_cancel= true
临期取消后信用分 = 78（80 - 2）
重新报名 C_soon -> 201
取消 A_join -> 200 is_late_cancel= false
A_join 取消后 slots= 6
重新报名 A_join -> 201
```

## 3. 这次改了什么

| 文件 | 改动 | 原因 |
|---|---|---|
| `frontend/src/shared/domain.js` | `DEFAULT_CREDIT` 100→**80**、`LATE_CANCEL_PENALTY` 5→**2**、新增 `NO_SHOW_PENALTY = 10` | 与后端 `config.py`（RELIABILITY_INITIAL / LATE_CANCEL_DELTA / NO_SHOW_DELTA）对齐——后端 PR #20 已改规则，前端常量滞后，页面提示全是旧数字 |
| `frontend/src/pages/activity.js` | 考勤弹层「扣 15 分」→ `RULES.NO_SHOW_PENALTY` | 后端爽约实扣 10 分，15 是旧值 |
| `frontend/src/pages/activity-manage.js`、`checkin.js`、`me.js` | 同上一并替换硬编码的「15 分」 | 三处同源文案，防止口径不一致 |
| `frontend/src/api/index.js` | `leaveActivity` 注释「扣 5 分」→「扣 2 分」 | 注释与实现一致 |
| `frontend/src/api/mock.js` | 新注册信用分 100→80；临期取消 -5→-2；爽约 -15→-10 | 让离线演示数据与真实后端口径一致，mock 联调不再误导 |
| `tools/verify.mjs` | 新增 H 段 21 项断言（140 → **161 项**） | 把四条 AC 变成可重跑检查；H0 静态锁定五个规则常量，防止与后端再次漂移 |
| `tools/seed9.mjs` | 新增：6 用户 + 4 演示活动 + 3 场「垫分」活动（把 low9 的信用分从 80 打到 50） | 让「满员」「信用分不足」「临期取消」三种状态有真实数据可截 |
| `docs/shots/issue9-*.png` | 新增 5 张真实后端运行截图 | 证据归档 |

> 说明：报名/取消的核心交互（报名表单弹层、二次确认、状态刷新）在此前版本已实现，
> 本 Issue 的实质工作是**把信用分规则与真实后端对齐 + 四条 AC 的验证与证据**。
> 后端 `test_issue9_join_leave_acceptance.py`（5 条）已由后端同学完成且全过。

## 4. 运行截图（真实后端，非 mock）

五张图都在 `?mock=0` 下截取（`mock: null`，请求全部打到 `127.0.0.1:8000`）：

| 截图 | 场景 | 内容 |
|---|---|---|
| [issue9-join-sheet-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-join-sheet-390.png) | 可报名活动点「立即报名」 | 报名弹层：给发起人留言（可选）、取消 / 确认报名 |
| [issue9-joined-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-joined-390.png) | 报名成功后 | 「我的参与状态 · 已报名」+ 去签到 + 取消报名；参与者列表出现本人 |
| [issue9-full-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-full-390.png) | 满员活动（2/2） | 按钮置灰「名额已满」，参与者 2/2 |
| [issue9-lowcredit-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-lowcredit-390.png) | 信用分 50 的用户 | 红色提示「你的信用分为 50，低于 60 分，暂时无法报名新活动」，按钮禁用 |
| [issue9-latecancel-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue9-latecancel-390.png) | 距开始 1 小时点「取消报名」 | 二次确认弹层：红色警告「现在取消会扣 2 分信用分（低于 60 分将无法报名新活动）」+ 仍然取消 |

## 5. 自动化测试

```text
$ cd src/frontend && node tools/verify.mjs
A. 接口清单覆盖（19 个）··········· 21 项通过
B. 业务规则（对照《前端对接文档》）·· 13 项通过
C. 页面渲染与 data-action 契约 ····· 39 项通过
D. 时区与格式化 ··················· 12 项通过
E. 一句话找局解析 ················· 14 项通过
F. Issue #5 个人主页验收 ·········· 13 项通过
G. Issue #7 活动列表验收 ·········· 28 项通过
H. Issue #9 报名 / 取消验收 ········ 21 项通过
────────────────────────────────────────
全部通过：161 项检查
```

后端回归（同一台机器，真实依赖跑通）：

```text
$ cd src/backend && py -m pytest -q
54 passed, 212 warnings in 7.37s
```

环境说明：本机 Python 为 3.9 / 3.14，`SQLAlchemy==2.1.2` 要求 ≥ 3.11，故后端用 **Python 3.14**，
pydantic 取 **2.12.5**（2.10 线无 cp314 轮子）；其余与 `requirements.txt` 一致：
FastAPI 0.115.6 / uvicorn 0.34.0 / SQLAlchemy 2.1.2 / httpx 0.28.1。

## 6. 怎么复现

```powershell
# 后端（Python 3.11+；首次启动自动建表 + 10 种运动种子数据）
cd src/backend
py -m pip install -r requirements.txt -r requirements-dev.txt
py -m uvicorn main:app --port 8000

# 前端（零依赖，另开终端）
cd src/frontend
node tools/server.mjs            # http://127.0.0.1:5178/frontend/
node tools/seed9.mjs             # 6 用户 + 4 演示活动；low9 信用分打到 50
node tools/verify.mjs            # 161 项自检

# 打开（加 ?mock=0 即真实后端）：
#   A_join   http://127.0.0.1:5178/frontend/?mock=0#/activity/1   （登录 join9 / sportmate123）
#   B_full   #/activity/2   C_soon   #/activity/3   D_free   #/activity/4
#   低信用分账号 low9 / sportmate123（信用分 50）

# 重新出截图（普通桌面环境；DSH 沙盒禁 Chromium 命名管道 IPC）
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activity/3" `
  --token=<join9 token，见 tools/seed9.json> --out=../docs/shots/issue9-latecancel-390.png `
  --w=390 --h=844 --eval="document.querySelector('[data-action=open-leave]').click()"
```

## 7. 边界与说明

1. 只联调了**本地** FastAPI 实例；公网 Render 实例、多人并发未测（并发报名竞态 DEF-01 已由后端修复并有探针复现）。
2. 本 Issue 未改后端代码；信用分规则以 `src/backend/config.py` 为准，前端 RULES 常量已加 H0 断言防止再次漂移。
3. 水平不匹配（后端 400）不在四条 AC 内，前端不做预拦截，直接显示后端返回的文案。
4. 截图脚本必须在普通桌面环境跑：DSH 沙盒禁止 Chromium 的命名管道 IPC，无头浏览器在沙盒内起不来。
