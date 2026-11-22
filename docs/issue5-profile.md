# Issue #5 · User profile page 验收与运行证据

- Issue：<https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/issues/5>（`S2`，Alpha Sprint 2026-11-21 ~ 11-28）
- 实现位置：`src/frontend/frontend/`（原生 ES Module + 零依赖，直接由 `tools/server.mjs` 提供静态服务）
- 运行方式：真实后端 `FastAPI`（`127.0.0.1:8000`）+ 前端 `?mock=0`，**不是**离线示意数据
- 提交：`feat(profile): connect profile page to real backend (#5)`，PR
  [#22](https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy/pull/22)

## 1. 验收标准逐条对照

| Issue 里的 AC | 实现 | 证据 |
|---|---|---|
| Profile renders real data | `pages/user.js` / `pages/me.js` 通过 `api.getUser()`、`api.getMe()`、`api.getUserReviews()` 拉取真实接口，页面不再依赖 `fixtures` | 截图里显示的 74 / 2 / 1 / 4.5、评价人「陈宇豪 / 王浩哲 / 李雨桐」均为后端 `GET /users/1`、`GET /users/1/reviews` 的返回值 |
| Credit score and statistics visible | 信用分、完成次数、爽约次数三块统计在首屏一屏内可见（`shared/components.js` 的 `creditCard()` 另有圆环版） | `issue5-user-390.png`、`issue5-me-390.png` |
| Responsive at 390px | `assets/css/app.css` 的 `@media (max-width: 420px)` 把双列网格降为单列；卡片与统计块按 390px 宽度重新排布 | `issue5-user-390.png`（390×844，DPR 2）与 `issue5-user-desktop.png`（1200×900）对比 |

## 2. 这次改了什么

| 文件 | 改动 | 原因 |
|---|---|---|
| `frontend/src/api/reviews.js` | 新增 `withReviewers(reviews)`：按 `reviewer_id` 并发 `GET /users/{id}` 补昵称，带模块级缓存、补不到降级 `null` | 后端 `ReviewOut` 只有 `reviewer_id`（没有嵌套 `reviewer`），前端原来直接读 `r.reviewer.nickname`，接真实后端时会渲染成「匿名同学」 |
| `frontend/src/pages/user.js`、`pages/me.js` | 评价列表改用 `withReviewers()` | 同上 |
| `frontend/src/api/http.js` | 新增 `?mock=0` / `?mock=1` / `?api=<url>` 运行时覆盖 | 联调时不必改 `index.html` 里的 `useMock`，截图和演示可以一键切换；默认行为不变 |
| `frontend/src/main.js` | 页面注册改为把路由 `params` 传给 `create(params)` | 原来 11 个页面全部丢掉参数，`#/user/1` 会变成 `GET /users/NaN`（联调时真实暴露的 bug） |
| `frontend/src/router.js`、`store.js` | `navigate()` 统一用 `href()` 生成路径；`review` 路由的 `activityId` / `userId` 正确解析 | `navigate('review', { activityId })` 原来会丢 id |
| `frontend/assets/css/app.css` | `.sm-bar__track` / `.sm-bar__fill` 补 `display: block` | 原来是 inline `span`，`width/height` 不生效，评价星级分布条看不见填充 |
| `frontend/index.html` | 注释里补充三个运行时开关与示例 URL | 让队友一眼知道怎么切真实后端 |
| `tools/verify.mjs` | 新增 F 段（12 项）#5 验收断言 | 把 AC 变成可重复执行的检查，而不是只靠截图 |
| `tools/shot5.mjs` | 新增无头 Edge 截图脚本（CDP） | 沙箱下 `--headless=new --screenshot` 起不来，需要 detached + CDP |
| `tools/seed-demo.mjs` | 新增造数脚本（4 用户 / 3 活动 / 4 评价） | 让「完成次数 2、爽约次数 1、均分 4.5」这类统计有真实来源，可复现 |

## 3. 运行截图（真实后端，非 mock）

三张图都在 `?mock=0` 下截取，页面顶部没有「离线演示模式」横幅：

| 截图 | 页面 | 内容 |
|---|---|---|
| [`shots/issue5-user-390.png`](shots/issue5-user-390.png) | 他人主页 `#/user/1` @390×844 | 林子均、旗山校区·一般、羽毛球/跑步标签、**74 信用分 / 2 完成 / 1 爽约**、收到的评价(4)、4.5 分、5 星×2 / 4 星×2 分布条、四条评价含评价人昵称 |
| [`shots/issue5-me-390.png`](shots/issue5-me-390.png) | 我的 `#/me` @390×844 | 信用分圆环 74、2 / 1 / 4.5 三统计、我的局（我发起 0 · 我报名 3）、我的主页入口、收到的评价 |
| [`shots/issue5-user-desktop.png`](shots/issue5-user-desktop.png) | 他人主页 @1200×900 | 桌面宽度下卡片居中（max-width 760px），无横向溢出 |

截图脚本同时打印了当次页面实际发出的请求，全部打到 `127.0.0.1:8000`：

```text
/health  /sports  /users/1  /users/1/reviews  /users/2  /users/4  /users/3
```

后端返回（`GET /users/1`，脱敏后）：

```json
{
  "id": 1,
  "username": "linzj",
  "nickname": "林子均",
  "campus": "旗山校区",
  "skill_level": "intermediate",
  "favorite_sports": ["羽毛球", "跑步"],
  "reliability_score": 74,
  "completed_count": 2,
  "no_show_count": 1,
  "review_average": 4.5,
  "review_count": 4
}
```

`GET /users/1/reviews` 的每条记录只有 `reviewer_id`、`score`、`tags`、`comment`、`created_at`；
页面上的「陈宇豪 / 王浩哲 / 李雨桐」是 `withReviewers()` 二次查询补出来的。

## 4. 自动化测试

```powershell
cd src/frontend
node tools/verify.mjs
```

结果：**全部通过：112 项检查**（原 99 项 + 本次 #5 新增 13 项），其中 F 段为 #5 的验收断言：

```text
F. Issue #5 个人主页验收（昵称 / 信用分 / 完成与爽约次数）
  ✓ 他人主页渲染昵称
  ✓ 他人主页显示信用分
  ✓ 他人主页显示完成次数
  ✓ 他人主页显示爽约次数
  ✓ 他人主页显示评价均分
  ✓ 「我的」页渲染昵称
  ✓ 「我的」页显示信用分
  ✓ 「我的」页显示完成次数与爽约次数
  ✓ 「我的」页显示评价均分
  ✓ 评价只有 reviewer_id 时能补出评价人昵称
  ✓ 补全后的评价人昵称与用户资料一致
  ✓ 补不到评价人时降级为 null，不抛错
```

## 5. 怎么复现

```powershell
# 后端（首次启动自动建表 + 10 种运动种子数据）
cd src/backend
py -m pip install -r requirements.txt
py -m uvicorn main:app --port 8000

# 前端
cd src/frontend
node tools/server.mjs            # http://127.0.0.1:5178/frontend/
node tools/seed-demo.mjs         # 4 用户 / 3 活动 / 4 评价（需空库）
```

浏览器打开（**加 `?mock=0`** 即走真实后端）：

- 他人主页：<http://127.0.0.1:5178/frontend/?mock=0#/user/1>
- 我的主页：<http://127.0.0.1:5178/frontend/?mock=0#/me>（先登录 `linzj / sportmate123`）

重新出截图：

```powershell
node tools/shot5.mjs --url="http://127.0.0.1:5178/frontend/?mock=0#/user/1" `
  --out="../docs/shots/issue5-user-390.png" --w=390 --h=844
```

## 6. 边界与说明

- 只联调了**本地** FastAPI 实例；公网 Render 实例、多人并发未测。
- 真实后端没有「评价人昵称」字段，补昵称会多出 N 次 `GET /users/{id}`（N = 评价条数），
  已做模块级缓存；后端若后续在 `ReviewOut` 里加 `reviewer` 嵌套对象，可去掉这层查询。
- 截图里的时间显示为本地时间（后端返回不带时区的 UTC 串，`shared/format.js` 已补 `Z` 再换算）。
- 演示数据（4 个用户、3 场活动、4 条评价）由 `tools/seed-demo.mjs` 生成，不是真实用户信息。
