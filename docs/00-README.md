# Issue #7「活动列表 + 筛选」交付包

Team Falcons（Group 12）· Sports Buddy · Alpha Sprint S4（2026-11-21 ~ 11-28）

| 项 | 内容 |
|---|---|
| Issue | [#7 [P0][BE/FE] Activity list + filters](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/7) |
| 分支 | `feat/activity-list-issue7` |
| 建议提交 | `feat(activity-list): wire P-03 to GET /activities with filters (#7)` |
| 点数 | 5（S4） |
| 页面 | P-03 活动列表 `#/activities` |

## 包里有什么

```text
SportsBuddy-Issue7-交付包/
├─ 00-README.md                  ← 本文件：包内说明 + 怎么复现
├─ 01-code-frontend/             ← 改动后的前端源码（按仓库同路径覆盖回 src/ 即可）
│  ├─ src/frontend/package.json            ← 新增：{"type":"module"}，无任何依赖
│  ├─ src/frontend/frontend/src/pages/activities.js   ← 分页 / 筛选 / 竞态防护 / 满员整页提示
│  ├─ src/frontend/frontend/src/shared/format.js      ← 新增 toBackendUtc()
│  ├─ src/frontend/frontend/assets/css/app.css        ← 标题断词 + ≤360px 护栏
│  ├─ src/frontend/tools/verify.mjs                   ← 新增 G 段 28 项验收断言
│  ├─ src/frontend/tools/seed7.mjs                    ← 新增：造 5 用户 + 12 场活动（2 场满员）
│  ├─ src/frontend/tools/shot7.mjs                    ← 新增：CDP 截图脚本（--eval 先点筛选再截）
│  ├─ src/frontend/tools/snapshot7.mjs                ← 新增：离线版式快照
│  └─ src/frontend/README.md                          ← 新增「四点六」联调说明
├─ 02-evidence/                  ← 7 张真实后端运行截图（?mock=0，请求打到 127.0.0.1:8000）
├─ 03-acceptance/                ← 验收对照（AC ↔ 实现 ↔ 证据 ↔ 缺陷 ↔ 边界）
├─ 04-blog-log2-section.md       ← 可直接粘进冲刺日志 2 的段落
├─ 05-test-report/               ← verify.mjs 完整输出（140 项通过）+ 后端 pytest 结果
└─ 06-commit/                    ← 建议提交信息 + 21 个文件的 unified diff（PNG 二进制不进 diff）
```

## 四条 AC 的结论

| AC | 结论 | 证据 |
|---|---|---|
| List loads from API | ✅ 首屏 `limit=8&offset=0&status=open`，8 张卡片 + 「加载更多」，第二页 `offset=8` | G 段 AC1 共 8 项断言 + `issue7-list-390.png`、`issue7-list-page2-390.png` |
| Filters combine correctly | ✅ 项目 / 校区 / 水平 / 时间可叠加；重置回默认；「只看还有空位」前端过滤；旧响应不覆盖新结果 | G 段 AC2 共 12 项断言 + `issue7-list-filter-390.png`、`issue7-list-full-390.png` |
| Empty state shown | ✅ 无结果显示空态 + 重置出口；整页满员给「继续加载」而不是假空态 | G 段 AC3 共 3 项断言 + `issue7-list-empty-390.png` |
| No overflow at 320px | ✅ 320×844 实测 `scrollWidth == innerWidth == 320`，无横向溢出 | G 段 AC4 共 3 项断言 + `issue7-list-320.png` |

## 三个缺陷（本轮真正的产出）

| 编号 | 现象 | 根因 | 处置 |
|---|---|---|---|
| DEF-01 | 勾「只看还有空位」时列表 5 条就"到底" | 后端 `only_available` 先分页后过滤，一页被筛掉几条 → 前端误判"没有更多" | 前端改为本地过滤并停传该参数；建议后端下推到 SQL |
| DEF-02 | 选「今天」查不到当天活动 | 库里 naive UTC，查询参数带 `+00:00`，SQLite 按字符串比大小 | 前端统一发 naive UTC（`toBackendUtc()`）；建议后端在入口归一 |
| DEF-03 | 快速连点筛选芯片，旧响应覆盖新结果 | `load()` 不区分响应与当前筛选的对应关系 | `state.reqId` 请求令牌，过期响应直接丢弃，verify 里有受控时序回归 |

详见 `03-acceptance/issue7-activity-list.md` 第 3 节。

## 怎么复现（Windows / PowerShell）

```powershell
# 后端（Python 3.11+；首次启动自动建表 + 10 种运动种子数据）
cd src/backend
py -m pip install -r requirements.txt -r requirements-dev.txt
py -m uvicorn main:app --port 8000

# 前端（零依赖，另开终端）
cd src/frontend
node tools/server.mjs                     # http://127.0.0.1:5178/frontend/
node tools/seed-demo.mjs                  # 4 用户 / 3 活动 / 4 评价（需空库）
node tools/seed7.mjs                      # 再补 5 用户 / 12 场活动（2 场满员）

# 自检：140 项（112 项原有 + 28 项 #7 验收）
node tools/verify.mjs

# 打开（加 ?mock=0 即真实后端）
#   http://127.0.0.1:5178/frontend/?mock=0#/activities

# 截图（普通桌面环境；沙盒里无头浏览器起不来）
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activities" `
  --out=../docs/shots/issue7-list-390.png --w=390 --h=844
node tools/shot7.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/activities" `
  --out=../docs/shots/issue7-list-empty-390.png --w=390 --h=844 `
  --eval="document.querySelector('[data-name=\"sport\"][data-value=\"足球\"]').click();document.querySelector('[data-name=\"campus\"][data-value=\"旗山校区\"]').click()"
```

## 代码怎么合回去

- 方式 A：把 `01-code-frontend/` 按同名路径覆盖回仓库（`src/frontend/...`），把 `02-evidence/` 放进
  `docs/shots/`，再提交。
- 方式 B：`patch -p1 < 06-commit/issue7.diff`（本机没有 git，diff 是 `difflib` 生成的 unified 格式，
  不能 `git am`；用 `git apply -p1` 一般也能吃，冲突时按方式 A 覆盖）。
- 新增的 `src/frontend/package.json` 只声明 `{"type": "module"}`，**不引入任何依赖**；
  它是为了让 `node tools/verify.mjs` 在含 `"type":"commonjs"` 的父目录下也能跑。

## WORKLOG 登记（可直接贴）

把 `<GitHub 用户名>` 换成实际提交人的账号即可。

```text
| 2026-11-24 | <GitHub 用户名> | 新增/修改 | src/frontend/frontend/src/pages/activities.js、src/frontend/frontend/src/shared/format.js、src/frontend/frontend/assets/css/app.css、src/frontend/tools/verify.mjs、src/frontend/tools/seed7.mjs、src/frontend/tools/shot7.mjs、src/frontend/tools/snapshot7.mjs、src/frontend/package.json、src/frontend/README.md、docs/issue7-activity-list.md、docs/shots/ | 完成 Issue #7「Activity list + filters」：列表接 GET /activities，修 only_available 先分页后过滤导致的提前截断（DEF-01）、时间参数时区不一致导致的"今天"查不出（DEF-02）、快速切换筛选的旧响应覆盖（DEF-03），翻页按 id 去重，补 320px 护栏；verify.mjs 140 项全部通过（新增 G 段 28 项），产出 7 张真实后端运行截图与验收文档 | 作业五 |
```

## 需要说明的边界

1. **后端依赖安装方式特殊**：本机 pip 直连 PyPI 超时（沙盒网络限制），本次通过阿里云镜像按
   `requirements.txt` 的版本取包安装；本机 Python 为 3.9/3.14，而 `SQLAlchemy==2.1.2` 要求
   Python ≥ 3.11，故用 **Python 3.14 + pydantic 2.12.5**（2.10 线无 cp314 轮子）跑通，
   其余版本与团队一致（FastAPI 0.115.6 / uvicorn 0.34.0 / SQLAlchemy 2.1.2 / httpx 0.28.1）。
2. **截图是真实运行证据**：7 张 PNG 全部 `?mock=0`，页面请求打到本地 FastAPI；
   320px 视口实测无横向溢出。截图脚本需在普通桌面环境跑（沙盒禁 Chromium 命名管道 IPC）。
3. **没改后端代码**：DEF-01 / DEF-02 只给报告与建议，避免跨组同时改 `services.py` 冲突。
4. **燃尽图不在本包内**：那是团队维度数据，按实际合并情况绘制。
