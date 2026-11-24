# Issue #7 · Activity list + filters —— 验收、截图与汇报（可直接发 GitHub）

> 本文件把 Issue #7 的**验收对照、代码改动、缺陷、运行截图、自动化测试、复现步骤、提交信息、
> WORKLOG 登记与冲刺日志段落**合并成一份，推上 GitHub 即完成证据归档。
> 图片全部用相对路径引用 `shots/`，与 `docs/shots/` 下的 7 张 PNG 一起提交即可正常显示；
> 若要把本文件贴到 Issue / PR 评论里，把 `shots/` 换成
> `https://raw.githubusercontent.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/main/docs/shots/` 前缀。

| 项 | 内容 |
|---|---|
| Issue | [#7 [P0][BE/FE] Activity list + filters](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/7)（S4，Alpha Sprint 2026-11-21 ~ 11-28，5 点） |
| 页面 | P-03 活动列表 `#/activities` |
| 接口 | `GET /activities`（sport / campus / skill_level / status / date_from / date_to / limit / offset） |
| 分支 | `feat/activity-list-issue7` |
| 建议提交 | `feat(activity-list): wire P-03 to GET /activities with filters (#7)` |
| 运行方式 | 真实后端 FastAPI（127.0.0.1:8000）+ 前端 `?mock=0`，非离线示意数据 |

---

## 1. 验收标准逐条对照

| AC | 结论 | 实现 | 证据 |
|---|---|---|---|
| List loads from API | ✅ | 首屏 `limit=8&offset=0&status=open`；翻页游标 = 已取到的原始条数；按 `id` 去重；整页被「只看还有空位」筛掉时给「继续加载」而不是假空态 | `verify.mjs` G 段 AC1 共 8 项；[shots/issue7-list-390.png](shots/issue7-list-390.png)、[shots/issue7-list-page2-390.png](shots/issue7-list-page2-390.png) |
| Filters combine correctly | ✅ | 项目 / 校区 / 水平 / 时间四类筛选任意叠加；时间窗口按本地日历换算成 naive UTC；`state.reqId` 令牌丢弃过期响应 | G 段 AC2 共 12 项；[shots/issue7-list-filter-390.png](shots/issue7-list-filter-390.png)、[shots/issue7-list-full-390.png](shots/issue7-list-full-390.png) |
| Empty state shown | ✅ | 无结果显示「没有符合条件的活动」+「重置筛选」出口 | G 段 AC3 共 3 项；[shots/issue7-list-empty-390.png](shots/issue7-list-empty-390.png) |
| No overflow at 320px | ✅ | `@media (max-width:360px)` 护栏 + 标题断词 + 芯片横向滚动；320×844 实测 `scrollWidth == innerWidth == 320` | G 段 AC4 共 3 项；[shots/issue7-list-320.png](shots/issue7-list-320.png)、[shots/issue7-list-desktop.png](shots/issue7-list-desktop.png) |

---

## 2. 这次改了什么

| 文件 | 改动 | 原因 |
|---|---|---|
| `frontend/src/pages/activities.js` | ① 停传 `only_available`，按 `slots_left` 前端过滤，游标保持服务端偏移；② 时间参数走 `toBackendUtc()`；③ 翻页按 id 去重；④ 整页满员给「继续加载」；⑤ `reqId` 请求令牌防旧响应覆盖 | DEF-01 / 02 / 03 |
| `frontend/src/shared/format.js` | 新增 `toBackendUtc()` | 与后端 naive UTC 存储对齐 |
| `frontend/assets/css/app.css` | 标题断词 + `@media (max-width:360px)` 护栏 | AC4 |
| `tools/verify.mjs` | 新增 G 段 28 项断言（112 → 140 项） | 四条 AC 可重跑 |
| `tools/seed7.mjs` | 新增：5 用户 + 12 场活动（8 种运动 / 2 校区 / 4 档水平 / 2 场满员） | 列表、分页、筛选、满员标签有真实数据 |
| `tools/shot7.mjs` | 新增：CDP 无头 Edge 截图，`--eval` 先点筛选再截 | 交互状态留证据 |
| `tools/snapshot7.mjs` | 新增：无浏览器时的离线版式快照 | 兜底验收 |
| `package.json` | 新增 `{"type":"module"}`（无依赖） | 让 `node tools/verify.mjs` 能跑 |
| `src/frontend/README.md` | 新增「四点六」联调说明 | 复现步骤入文档 |

---

## 3. 三个缺陷（根因 + 处置）

### DEF-01 · `only_available` 在分页之后才过滤，列表提前「到底」
- 现象：勾「只看还有空位」时列表第 3 屏就显示"已经到底了"，后面其实还有活动。
- 根因：`services.list_activities()` 先 `limit/offset` 取一页，再在内存里筛掉满员活动；一页被筛掉几条，
  前端按「返回条数 < 8 ⇒ 没有更多」误判。
- 处置：前端停传该参数、按 `slots_left` 本地过滤，游标不再错位。
- 建议后端：把空位条件下推到 SQL（`capacity > 注册数子查询`），修好后删除前端兜底。

### DEF-02 · 时间筛选漏掉「今天」
- 现象：选「今天」查不到当天活动。
- 根因：后端 `start_time` 以 naive UTC 存库，前端原来发带 `Z` 的串；SQLite 按字符串比大小，
  带时区后缀的参数"更长"，当天整天被判成"早于下限"。
- 处置：前端统一发 naive UTC，断言锁定「窗口正好 24 小时、起点等于本地今天 0 点」。
- 建议后端：在 `list_activities()` 入口把 `date_from/date_to` 归一成 naive UTC（约 3 行）。

### DEF-03 · 快速连点筛选芯片，旧响应覆盖新结果
- 现象：连点两个筛选条件，先发出的慢请求最后返回，把列表打回上一个筛选（截图脚本自动化点击时真实复现）。
- 根因：`load()` 不区分响应与当前筛选的对应关系。
- 处置：`state.reqId` 请求令牌，过期响应直接丢弃；verify 里用「先放行新请求、再放行旧请求」的受控时序回归。

---

## 4. 运行截图（真实后端，非 mock）

七张图都在 `?mock=0` 下截取（`mock: null`，请求全部打到 `127.0.0.1:8000`）：

| 截图 | 页面 / 操作 | 内容 |
|---|---|---|
| [shots/issue7-list-390.png](shots/issue7-list-390.png) | `#/activities` 默认，390×844 | 8 条+、五排筛选芯片、「只看还有空位」、活动卡片（图标 / 时间 / 校区位置 / 水平徽标 / 报名进度 / 发起人信用分） |
| [shots/issue7-list-filter-390.png](shots/issue7-list-filter-390.png) | 点「羽毛球」+「旗山校区」 | 组合筛选共 2 条、出现「重置筛选」 |
| [shots/issue7-list-empty-390.png](shots/issue7-list-empty-390.png) | 点「足球」+「旗山校区」 | 共 0 条 → 空态 + 重置出口 |
| [shots/issue7-list-full-390.png](shots/issue7-list-full-390.png) | 点「已满员」+ 取消「只看还有空位」 | 2 张满员卡片：已报名 2/2、名额已满 |
| [shots/issue7-list-page2-390.png](shots/issue7-list-page2-390.png) | 点「加载更多」 | 第二页请求 `offset=8`，底部「已经到底了 · 共 10 条」 |
| [shots/issue7-list-320.png](shots/issue7-list-320.png) | 默认，320×844 | `scrollWidth == innerWidth == 320`，无横向溢出（AC4） |
| [shots/issue7-list-desktop.png](shots/issue7-list-desktop.png) | 默认，1200×900 | 桌面宽度内容居中，无横向溢出 |

截图脚本打印的当次请求（默认页）：

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/sports
http://127.0.0.1:8000/activities?limit=8&offset=0&status=open
```

组合筛选页（中文参数由 `URLSearchParams` 自动编码）：

```text
http://127.0.0.1:8000/activities?limit=8&offset=0&sport=%E7%BE%BD%E6%AF%9B%E7%90%83&status=open
http://127.0.0.1:8000/activities?limit=8&offset=0&sport=%E7%BE%BD%E6%AF%9B%E7%90%83&campus=%E6%97%97%E5%B1%B1%E6%A0%A1%E5%8C%BA&status=open
```

---

## 5. 自动化测试

前端自检（零依赖）：

```text
$ cd src/frontend && node tools/verify.mjs
A. 接口清单覆盖（19 个）··········· 21 项通过
B. 业务规则（对照《前端对接文档》）·· 13 项通过
C. 页面渲染与 data-action 契约 ····· 39 项通过
D. 时区与格式化 ··················· 12 项通过
E. 一句话找局解析 ················· 14 项通过
F. Issue #5 个人主页验收 ·········· 13 项通过
G. Issue #7 活动列表验收 ·········· 28 项通过
────────────────────────────────────────
全部通过：140 项检查
```

后端回归：

```text
$ cd src/backend && py -m pytest -q
54 passed, 212 warnings in 7.37s
```

环境说明：本机 Python 为 3.9 / 3.14，`SQLAlchemy==2.1.2` 要求 ≥ 3.11，故后端用 **Python 3.14**，
pydantic 取 **2.12.5**（2.10 线无 cp314 轮子）；其余与 `requirements.txt` 一致：
FastAPI 0.115.6 / uvicorn 0.34.0 / SQLAlchemy 2.1.2 / httpx 0.28.1。

---

## 6. 怎么复现

```powershell
# 后端（Python 3.11+；首次启动自动建表 + 10 种运动种子数据）
cd src/backend
py -m pip install -r requirements.txt -r requirements-dev.txt
py -m uvicorn main:app --port 8000

# 前端（零依赖，另开终端）
cd src/frontend
node tools/server.mjs            # http://127.0.0.1:5178/frontend/
node tools/seed-demo.mjs         # 4 用户 / 3 活动 / 4 评价（需空库）
node tools/seed7.mjs             # 再补 5 用户 / 12 场活动（2 场满员）
node tools/verify.mjs            # 140 项自检

# 打开（加 ?mock=0 即真实后端）
#   http://127.0.0.1:5178/frontend/?mock=0#/activities

# 重新出截图（普通桌面环境；DSH 沙盒禁 Chromium 命名管道 IPC，无头浏览器起不来）
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activities" `
  --out=../docs/shots/issue7-list-390.png --w=390 --h=844
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activities" `
  --out=../docs/shots/issue7-list-empty-390.png --w=390 --h=844 `
  --eval="document.querySelector('[data-name=\"sport\"][data-value=\"足球\"]').click();document.querySelector('[data-name=\"campus\"][data-value=\"旗山校区\"]').click()"
```

---

## 7. 提交信息与 WORKLOG 登记（可直接复制）

提交信息：

```text
feat(activity-list): wire P-03 to GET /activities with filters (#7)

- stop sending only_available: backend filters after limit/offset, which truncated
  the list early; filter by slots_left on the client and keep the offset aligned (DEF-01)
- send naive UTC for date_from/date_to (new format.js toBackendUtc()): aware "+00:00"
  values are compared as strings by SQLite against naive UTC columns, so the "today"
  filter dropped the whole day (DEF-02)
- add a request token (state.reqId) so a slow stale response cannot overwrite the
  result of a newer filter click (DEF-03)
- de-duplicate pages by activity id and show "keep loading" instead of a fake empty state
- add <=360px guards and title wrapping so the list holds at 320px
- add verify.mjs section G (28 assertions, 112 -> 140 checks)
- add tools/seed7.mjs / tools/shot7.mjs / tools/snapshot7.mjs
- add package.json ({"type":"module"}, no dependencies)
- document acceptance, defects and limits; add 7 real-backend screenshots
```

WORKLOG 登记（把 `<GitHub 用户名>` 换成实际提交人账号）：

```text
| 2026-11-24 | <GitHub 用户名> | 新增/修改 | src/frontend/frontend/src/pages/activities.js、src/frontend/frontend/src/shared/format.js、src/frontend/frontend/assets/css/app.css、src/frontend/tools/verify.mjs、src/frontend/tools/seed7.mjs、src/frontend/tools/shot7.mjs、src/frontend/tools/snapshot7.mjs、src/frontend/package.json、src/frontend/README.md、docs/issue7-activity-list.md、docs/shots/ | 完成 Issue #7「Activity list + filters」：列表接 GET /activities，修 only_available 先分页后过滤导致的提前截断（DEF-01）、时间参数时区不一致导致的"今天"查不出（DEF-02）、快速切换筛选的旧响应覆盖（DEF-03），翻页按 id 去重，补 320px 护栏；verify.mjs 140 项全部通过（新增 G 段 28 项），产出 7 张真实后端运行截图与验收文档 | 作业五 |
```

---

## 8. 冲刺日志段落（可直接贴 CSDN 冲刺日志第 2 篇）

本节点前端组的主线是 **P-03 活动列表（Issue #7）**：把页面从内置示意数据切到真实接口
`GET /activities`，并把「四类筛选 + 分页 + 空态」这条最容易出错的路径逐个对过一遍，
全部在 `?mock=0`（真实 FastAPI）下留了运行截图。

- **列表与分页**：首屏 `limit=8&offset=0`，翻页游标严格等于已取到的原始条数，新一页按 `id` 去重；
  第二页截图能看到 `offset=8` 与「已经到底了 · 共 10 条」。
- **筛选**：项目 / 校区 / 水平 / 时间四类条件任意叠加（截图：羽毛球 + 旗山校区 → 共 2 条），
  另有「只看还有空位」与「重置筛选」；快速连点筛选芯片时旧响应被请求令牌丢弃。
- **空态与满员**：无结果显示空态 + 重置出口（足球 + 旗山校区 → 共 0 条）；
  状态切到「已满员」能看到 2 张"名额已满"卡片。
- **320px 护栏**：标题断词、卡片底部允许换行、芯片横向滚动；320×844 实测无横向溢出。

本轮挖出并修掉三个真问题：① 后端 `only_available` 先分页后过滤导致列表提前"到底"；
② 时间参数带 `+00:00` 与后端 naive UTC 存储做字符串比较，"今天"整天查不出来；
③ 快速切换筛选的 stale-response 竞态。共同点是**界面看起来只是"少了几条/结果不对"，
背后都是契约或时序没对齐**，所以补齐了程序化验收：前端 140 项自检、后端 54 项 pytest 全过。

下一节点计划：与后端组对齐 DEF-01/02 的修法后删除前端兜底；补齐 `data-testid` 交给测试组做
「筛选 → 报名 → 返回列表」E2E；开始 #13 我的局 / #14 评价页联调。

---

## 9. 边界与说明

1. 只联调了**本地** FastAPI 实例；公网 Render 实例、多人并发未测。
2. DEF-01 / DEF-02 根因在后端 `services.py`，本次**未改后端代码**（避免跨组冲突），
   只在前端兜底并给出建议修法，需后端同学跟进。
3. 演示数据（9 用户、15 场活动）由 `seed-demo.mjs` + `seed7.mjs` 生成，不是真实用户信息。
4. 截图时间显示为本地时间（后端返回不带时区的 UTC 串，`shared/format.js` 已补 `Z` 再换算）。
5. 燃尽图不在本文内：那是团队维度数据，按实际合并情况绘制。
