# Issue #8 · Activity detail page —— 验收与运行证据

> 截图引用的是 GitHub 仓库绝对地址（raw.githubusercontent.com），
> 需先把 `docs/shots/` 下 5 张 PNG 推上 `main`，否则图片会 404。

| 项 | 内容 |
|---|---|
| Issue | [#8 [P0][BE/FE] Activity detail page](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/8)（S5，Alpha Sprint 2026-11-21 ~ 11-28，3 点） |
| 页面 | P-04 活动详情 `#/activity/:id` |
| 接口 | `GET /activities/{id}`（详情含参与者名单与状态）、`GET /activities/mine`（判断我是否已报名） |
| 分支 | `feat/activity-detail-issue8` |
| 建议提交 | `feat(detail): verify activity detail against real backend and fix participant count (#8)` |
| 运行方式 | 真实后端 FastAPI（127.0.0.1:8000）+ 前端 `?mock=0`，非离线示意数据 |

---

## 1. 验收标准逐条对照

| AC | 结论 | 实现 | 证据 |
|---|---|---|---|
| Detail loads by id | ✅ | `api.getActivity(id)` + `/activities/mine` 补「我是否已报名」；不存在的 id 显示错误与「返回活动列表」 | I 段 AC1 共 4 项断言；[issue8-detail-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-detail-390.png) |
| Participant list and status visible | ✅ | 参与者列表含昵称 / 水平 / 信用分 / 状态标签（已报名 / 已签到 / 已到场 / 爽约）；状态联动（满员 / 进行中 / 已取消 / 已结束） | I 段 AC2 共 10 项断言；[issue8-finished-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-finished-390.png)、[issue8-ongoing-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-ongoing-390.png)、[issue8-cancelled-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-cancelled-390.png) |
| Organizer sees management entry | ✅ | 发起人（后端 `checkin_code` 非 null 判定）看到「你是发起人」+ 记录考勤 / 取消活动 + 4 位签到码；普通参与者看不到 | I 段 AC3 共 3 项断言；[issue8-organizer-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-organizer-390.png) |

## 2. 真实后端接口实测（?mock=0，本机 FastAPI 实测输出）

```text
B_finish 考勤: {"1":2,"3":-10}
B_finish 状态: finished，参与者: 参与者8:attended / 参与者9:no_show / 组织者8:attended
C_cancel 状态: cancelled
A_open 取消后 participants: [{"n":"参与者8","s":"cancelled"}]，joined_count=0   ← DEF-01 证据
D_ongoing（2 分钟后开始）→ 读取时状态: ongoing
```

## 3. 这次改了什么

| 文件 | 改动 | 原因 |
|---|---|---|
| `frontend/src/pages/activity.js` | ① 参与者列表过滤 `status='cancelled'` 的记录；② 已结束 / 已取消活动的顶部不再显示「X 小时后开始」，改为「已结束 · 时间段」「已取消 · 时间段」 | DEF-01 / DEF-02 |
| `tools/verify.mjs` | 新增 I 段 17 项断言（161 → **178 项**） | 三条 AC 变成可重跑检查 |
| `tools/seed8.mjs` | 新增：3 用户 + 4 个活动（可报名 / 已结束·到场+爽约 / 已取消 / 进行中） | 四种状态有真实数据可截 |
| `docs/shots/issue8-*.png` | 新增 5 张真实后端运行截图 | 证据归档 |

> 详情页主体（信息块、状态徽标、签到码展示、考勤/取消入口）在 #9 联调时已顺带验证过，
> 本 Issue 的增量工作是**参与者计数修正 + 状态文案修正 + 三条 AC 的独立验收与证据**。
> 后端 `test_issue8_activity_detail_acceptance.py`（4 条）已由后端同学完成且全过。

## 4. 两个缺陷

### DEF-01 · 真实后端的 participants 含已取消记录，参与者计数与名额对不上
- 现象：报名后取消，真实后端 `GET /activities/{id}` 的 `participants` 仍保留
  `status='cancelled'` 的记录（mock 不含），页面「参与者（N/容量）」会把取消的人也数进去，
  与 `joined_count` / 名额数字矛盾。
- 处置：前端渲染前过滤 `status !== 'cancelled'`；`verify.mjs` 用带 cancelled 记录的可控
  响应锁定「计数不含已取消」。
- 建议后端：`converters.activity_detail` 只返回活跃报名，或前端与后端口径二选一（当前前端已兜底）。

### DEF-02 · 已结束 / 已取消的活动顶部仍显示「X 小时后开始」
- 现象：`hero` 的提示行无条件用 `fmtRelative(start_time)`，已结束的活动显示
  「1 分钟后开始」，与「已结束」徽标自相矛盾（截图初版真实出现）。
- 处置：`finished → 已结束`、`cancelled → 已取消`、其余保持倒计时；I 段加两条回归断言。

## 5. 运行截图（真实后端，非 mock）

五张图都在 `?mock=0` 下截取（`mock: null`，请求全部打到 `127.0.0.1:8000`）：

| 截图 | 场景 | 内容 |
|---|---|---|
| [issue8-organizer-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-organizer-390.png) | 发起人视图 | 「你是发起人」+ 记录考勤 / 取消活动 + 签到码 5-8-9-3 |
| [issue8-detail-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-detail-390.png) | 参与者视图（可报名） | 我的参与状态·已报名 + 去签到 / 取消报名 + 参与者列表 |
| [issue8-finished-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-finished-390.png) | 已结束 | 「已结束 · 时间段」+ 评价同场伙伴 + 参与者 已到场 / 爽约 / 已到场 |
| [issue8-cancelled-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-cancelled-390.png) | 已取消 | 红色提示「这场活动已被发起人取消」，按钮置灰「已取消」 |
| [issue8-ongoing-390.png](https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/issue8-ongoing-390.png) | 进行中 | 「进行中」徽标 + 报名按钮禁用 |

## 6. 自动化测试

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
I. Issue #8 活动详情验收 ·········· 17 项通过
────────────────────────────────────────
全部通过：178 项检查
```

后端回归（同一台机器，真实依赖跑通）：

```text
$ cd src/backend && py -m pytest -q
54 passed, 212 warnings in 7.37s
```

环境说明：本机 Python 为 3.9 / 3.14，`SQLAlchemy==2.1.2` 要求 ≥ 3.11，故后端用 **Python 3.14**，
pydantic 取 **2.12.5**（2.10 线无 cp314 轮子）；其余与 `requirements.txt` 一致：
FastAPI 0.115.6 / uvicorn 0.34.0 / SQLAlchemy 2.1.2 / httpx 0.28.1。

## 7. 怎么复现

```powershell
# 后端（Python 3.11+；首次启动自动建表 + 10 种运动种子数据）
cd src/backend
py -m pip install -r requirements.txt -r requirements-dev.txt
py -m uvicorn main:app --port 8000

# 前端（零依赖，另开终端）
cd src/frontend
node tools/server.mjs            # http://127.0.0.1:5178/frontend/
node tools/seed8.mjs             # 3 用户 + 4 个活动（四种状态）
node tools/verify.mjs            # 178 项自检

# 打开（?mock=0 即真实后端）：
#   发起人视图 org8 / sportmate123；参与者视图 mem8 / sportmate123
#   #/activity/1 可报名   #/activity/2 已结束   #/activity/3 已取消   #/activity/4 进行中

# 重新出截图（普通桌面环境；DSH 沙盒禁 Chromium 命名管道 IPC）
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activity/1" `
  --token=<org8 token，见 tools/seed8.json> --out=../docs/shots/issue8-organizer-390.png --w=390 --h=844
```

## 8. 边界与说明

1. 只联调了**本地** FastAPI 实例；公网 Render 实例、多人并发未测。
2. 本 Issue 未改后端代码；DEF-01 的根因在后端 `converters.activity_detail`，前端已兜底过滤，
   建议后端后续只返回活跃报名（或在文档里明确口径）。
3. `人数 N/M` 与「参与者（K/M）」在"发起人考勤后"会差 1：考勤会给发起人补一条报名记录，
   而 `joined_count` 不含发起人——属后端口径，前端未特殊处理。
4. 截图脚本必须在普通桌面环境跑：DSH 沙盒禁止 Chromium 的命名管道 IPC，无头浏览器在沙盒内起不来。
