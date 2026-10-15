# 动搭 SportMate · 前端交付

依据 `sportmate后端.zip`（FastAPI 后端 + 《前端对接文档》19 个接口）实现的前端，
外加**领域类图**与**可交互界面原型**。三项交付物都在本目录下，打开即可看。

> 关键特点：**零安装**。不需要 `npm install`，没有构建步骤，没有 `node_modules`。
> 因为这台机器上没有外网，所以整个工程用原生 ES Module 写成，只依赖浏览器。

---

## 一、30 秒跑起来

```powershell
# 方式 A：双击
start.cmd

# 方式 B：命令行
node tools/server.mjs          # 默认 http://127.0.0.1:5178
```

然后打开：

| 交付物 | 地址 | 说明 |
|---|---|---|
| **① 前端应用** | <http://127.0.0.1:5178/frontend/> | 11 个页面，默认用内置离线数据 |
| **② 界面原型（可交互）** | <http://127.0.0.1:5178/prototype/screens.html> | 12 个画面并排，框里能直接点 |
| **原型总览 / 接口覆盖表** | <http://127.0.0.1:5178/prototype/> | 交付物索引 + 19 个接口落在哪 |
| **页面结构与跳转** | <http://127.0.0.1:5178/prototype/wireframe.html> | 信息架构图 + 路由表 |
| **③ 领域类图** | <http://127.0.0.1:5178/docs/diagrams/class-diagram.html> | 15 个类 / 20 条关系，可缩放 |
| **原型图（JPG）** | 本地目录 `out/prototype-jpg/` | 12 张单屏 + 1 张总览，可直接插进报告/PPT |

> ⚠️ 必须通过 `http://` 打开。浏览器出于安全策略禁止 `file://` 加载 ES Module，
> 直接双击 `index.html` 会白屏（页面里已经写了这条提示）。
>
> ⚠️ 如果你的目录在仓库子路径下（例如 `src/frontend/`），访问地址要多一层前缀：
> `http://127.0.0.1:5178/src/frontend/frontend/`。工程内部所有链接都是**相对路径**，
> 因此换目录、换域名都不用改代码。

---

## 一点五、团队成员怎么看到这个前端

代码上传到 GitHub 之后，"别人怎么看"有三种办法，按省事程度排：

### 办法 1：开 GitHub Pages（最推荐，队友点个链接就行）

仓库是 public，所以直接在
`Settings → Pages → Source: Deploy from a branch → main → / (root) → Save`。

等 1~2 分钟，队友打开（本工程在 `src/frontend/`，所以要带上这层路径）：

```
https://falcons-fzu-mu-se-group12.github.io/SportsBuddy/src/frontend/frontend/          ← 前端应用
https://falcons-fzu-mu-se-group12.github.io/SportsBuddy/src/frontend/prototype/        ← 原型总览
https://falcons-fzu-mu-se-group12.github.io/SportsBuddy/src/frontend/prototype/screens.html     ← 可交互原型
https://falcons-fzu-mu-se-group12.github.io/SportsBuddy/src/frontend/docs/diagrams/class-diagram.html  ← 类图
```

**手机上也能直接看**，不用装任何东西。离线示意数据全在前端，所以整站功能都能点。

> 建议在仓库根目录加一个空文件 `.nojekyll`：GitHub Pages 默认走 Jekyll，
> 加它可以避免个别下划线开头的文件被忽略，也让构建更单纯。
>
> 注意 Pages 会把**整个仓库**（23 MB）都发布出去，不只是前端。如果里面有
> 不希望公开的作业材料，就别开 Pages，改用办法 2。

### 办法 2：队友本地起服务（看改完的最新效果）

```powershell
git clone https://github.com/Falcons-FZU-MU-SE-GROUP12/SportsBuddy.git
cd SportsBuddy
node src/frontend/tools/server.mjs          # 需要 Node.js 18+
```

然后打开 `http://127.0.0.1:5178/src/frontend/frontend/`。

本机复现"子路径部署"（排查上线 404 用）：

```powershell
node src/frontend/tools/server.mjs 5182 --prefix=/SportsBuddy/src/frontend
# 然后访问 http://127.0.0.1:5182/SportsBuddy/src/frontend/frontend/
```

### 办法 3：直接在 GitHub 网页上看（看代码和类图很方便）

| 想看什么 | GitHub 网页上能不能直接看 |
|---|---|
| 源码、README、目录结构 | ✅ 直接点开 |
| **类图 SVG**（`docs/diagrams/class-diagram.svg`） | ✅ GitHub 会渲染出来 |
| 类图 Mermaid 源文件（`.mmd`） | ✅ GitHub 会把它渲染成图 |
| 类图查看页、原型页、前端应用（`.html`） | ❌ GitHub 只显示源码，不运行页面 |

所以"看效果"还是得用办法 1 或 2；办法 3 适合快速 review 代码。
`.svg` 是自包含的矢量图，队友点开就能看到完整类图，这个不用起服务。

---

## 二、目录结构

```
sportmate-app/
├─ frontend/                        ① 前端应用（零依赖）
│  ├─ index.html                    ← 唯一的"配置入口"
│  ├─ assets/css/app.css            设计系统：令牌 / 组件 / 移动优先适配
│  └─ src/
│     ├─ main.js                    启动：预热 /health → 拉字典 → 恢复登录态 → 挂路由
│     ├─ router.js                  hash 路由 + 登录守卫
│     ├─ store.js                   全局状态（登录态、字典、路由表）
│     ├─ api/
│     │  ├─ index.js                ★ 19 个接口封装（对照文档第七节）
│     │  ├─ http.js                 请求层：token / 错误归一化 / 时区无关
│     │  └─ mock.js                 离线后端替身（在 fetch 位置替换，19 个接口全覆盖）
│     ├─ fixtures/index.js          示意数据（4 个用户、9 场活动、5 条评价）
│     ├─ shared/
│     │  ├─ format.js               ★ 时区处理（后端 UTC 串 → 本地时间）
│     │  ├─ domain.js               枚举与界面文案的唯一来源
│     │  ├─ components.js           可复用界面片段（卡片、标签、签到码…）
│     │  └─ ui.js                   200 行渲染内核 + 事件委托
│     └─ pages/                     11 个页面（详见下表）
├─ prototype/                       ③ 界面原型
│  ├─ index.html                    总览与接口覆盖表（生成）
│  ├─ screens.html                  12 个可交互画面（生成）
│  ├─ wireframe.html                信息架构图 + 路由表（手写）
│  └─ css/gallery.css               展板样式（与 app.css 分离）
├─ out/prototype-jpg/               ④ 原型图（JPG，可直接放进报告/PPT）
│  ├─ 00-总览.jpg                   12 屏拼版总览
│  └─ P-01…P-12_*.jpg               每屏一张，780×1688
├─ docs/diagrams/                   ② 类图
│  ├─ class-diagram.mmd             Mermaid 源文件（可贴进 mermaid.live）
│  ├─ class-diagram.svg             离线渲染的 UML 风格 SVG（可插进报告）
│  └─ class-diagram.html            可缩放查看 + 类/关系清单表
└─ tools/                           工具与自检（Node / Python，都不需要装依赖）
   ├─ server.mjs                    零依赖静态服务器（支持 --prefix 模拟子路径部署）
   ├─ verify.mjs                    ★ 99 项自检
   ├─ check-links.mjs               链接与资源完整性检查
   ├─ browser-stub.mjs              Node 里跑页面模块用的浏览器环境替身
   ├─ build-prototype.mjs           生成 prototype/ 两个页面
   ├─ render-prototype-jpg.py       ★ 把 12 个画面渲染成 JPG（Pillow）
   ├─ render-class-diagram-jpg.py   ★ 把领域类图渲染成 JPG（Pillow）
   ├─ render-class-diagram.py       把 .mmd 渲染成 SVG + HTML
   ├─ check-class-diagram.py        类图几何校验（文字不溢出 / 连线不穿框）
   ├─ check-mojibake.py             ★ 乱码校验（字体是否缺字 / 方法名是否误判）
   └─ upload-to-github.mjs          用 GitHub API 上传（支持 --include-jpg / fork + PR）
```

### 原型图（JPG）是怎么来的

这台机器上**没有可用的无头浏览器**（沙盒禁止 Chromium 的进程间通信，
`Edge --headless --screenshot` 直接崩在 `platform_channel.cc`），所以没法给网页截图。
替代方案是用 Pillow 按同一套设计令牌与 CSS 尺寸，把 12 个画面重画一遍：

```powershell
python tools/render-prototype-jpg.py                 # 全部渲染 → out/prototype-jpg/
python tools/render-prototype-jpg.py --only=P-07     # 只渲染某一屏
python tools/render-prototype-jpg.py --scale=3       # 提高分辨率（默认 2x = 780×1688）
```

产物共 13 张、约 1.9 MB：12 张单屏（每张就是一整屏，可直接贴进文档）+ 1 张 3×4 拼版总览。

> JPG 是"按设计稿重绘"的，与 `prototype/screens.html` 里能点的版本在
> 配色、字号、间距、文案上保持一致 —— 区别只是一个是静态图、一个能交互。
> 改了 `app.css` 的令牌，记得同步 `render-prototype-jpg.py` 顶部的 `C` 字典。
>
> 想把这些图一起传到仓库：`node tools/upload-to-github.mjs --include-jpg`
> （会落到 `src/frontend/prototype-jpg/`；默认不加，避免仓库体积变大）。

---

## 三、页面清单（11 个页面）

| 页面 | 路由 | 主要接口 |
|---|---|---|
| P-01 登录 / 注册 | `#/login` | `POST /auth/login`、`POST /auth/register` |
| P-02 找局（首页） | `#/discover` | `GET /match/parse`、`GET /match`、`GET /activities` |
| P-03 活动列表 | `#/activities` | `GET /activities`（5 类筛选 + 分页） |
| P-04 活动详情 | `#/activity/:id` | `GET /activities/{id}`、`POST`/`DELETE .../join` |
| P-05 发起 / 编辑活动 | `#/activity-new(/:id)` | `GET /sports`、`POST /activities`、`PATCH /activities/{id}` |
| P-06 管理活动（发起人） | `#/activity-manage/:id` | `POST .../attendance`、`POST .../cancel` |
| P-07 签到 | `#/checkin/:id` | `POST .../checkin`（签到码 / 定位） |
| P-08 评价同场伙伴 | `#/review/:activityId` | `POST /activities/{id}/reviews` |
| P-09 个人主页 | `#/user/:id` | `GET /users/{id}`、`GET /users/{id}/reviews` |
| P-10 我的局 | `#/manage` | `GET /activities/mine` |
| P-11 我的 | `#/me` | `GET`/`PATCH /me`、`POST /auth/logout` |

底部标签栏 4 个主页面：找局 / 活动 / 我的局 / 我的。标签栏之外的页面都带返回。

---

## 四、怎么接真实后端

后端文档里挖了三个坑，代码里都已经处理掉了，但**地址要你自己改一处**：

### 1. 改配置（唯一要改的地方）

打开 `frontend/index.html`，把这两行按需要修改：

```html
<script>
  window.__SPORTMATE_CONFIG__ = {
    useMock: true,                              // ← 接真实后端改成 false
    apiBaseUrl: 'http://127.0.0.1:8000'         // ← 改成你的后端地址
  }
</script>
```

- 本地跑后端：`apiBaseUrl: 'http://127.0.0.1:8000'`
- 用同学的线上后端：`apiBaseUrl: 'https://sportmate-backend-gm34.onrender.com'`
  （免费实例会休眠，启动时会先打 `/health` 预热并提示）

不改也能跑：`useMock: true` 时用内置示意数据，**断网可演示**。

### 2. 文档里三个坑的落地位置

| 文档里的坑 | 本工程的处理位置 | 做法 |
|---|---|---|
| 时间差 8 小时（后端 UTC 串不带 Z） | `shared/format.js` 的 `parseServerTime()` | 没有时区后缀就补 `Z`；提交时用 `toISOString()` |
| 创建活动不返回签到码 | `pages/activity-new.js` | 创建成功后**再查一次详情**才拿到 `checkin_code` |
| 中文查询参数要编码 | `api/http.js` 的 `buildUrl()` | 统一走 `URLSearchParams` |
| `checkin_code` 只有发起人可见 | `pages/activity.js` | 判断条件是 `detail.checkin_code != null`，不比较 user_id |
| 临期取消扣分 | `pages/activity.js`、`pages/manage.js` | 点"取消报名"先看 `is_late_cancel` 窗口，弹二次确认 |
| 信用分 < 60 不能报名 | `shared/domain.js` 的 `RULES.MIN_CREDIT` | 提前禁用按钮并给出原因，不等到 403 |

### 3. 错误码的分工

后端保证 `detail` 永远是字符串，所以 `err.message` 可以直接显示。
界面在此基础上按状态码做差异化反馈（`docs` 里明确要求区分的两处）：

- **403**：签到码错误 / 超出 300 米（后端会返回具体米数）/ 信用分不足 / 没报名 → 红色错误条
- **409**：重复报名 / 已满员 / 已签到 → 同样直接显示后端中文提示

---

## 五、自检与再生成

这台机器上没有可用的无头浏览器（沙盒禁止 Chromium 的进程间通信），
所以"界面是否正确"用**程序化校验**兜底，不是靠肉眼：

```powershell
node tools/verify.mjs                 # 99 项：接口 / 业务规则 / 页面渲染 / 时区 / 匹配解析
node tools/check-links.mjs            # 5 个入口页面的 js/css/svg 引用全部可达
python tools/render-class-diagram.py  # 由 .mmd 生成 SVG + HTML
python tools/check-class-diagram.py   # 类图几何校验：文字不溢出、连线不穿框、画布不截断
python tools/render-class-diagram-jpg.py  # 由同一套布局生成类图 JPG
python tools/render-prototype-jpg.py  # 12 个原型画面 → JPG
python tools/check-mojibake.py        # 乱码校验：字体缺字 / 方法名被误判成属性
node tools/build-prototype.mjs        # 重新生成原型页
```

> **踩过的坑（已加校验守住）**：类图里的方法名一度全是方框，原因是两个 bug 叠加 ——
> ① 解析器用 `endswith(")")` 判断方法行，漏掉了带返回类型的写法（`+注册() AuthSession`），
> 把方法误判成属性；② 属性行用 Consolas 等宽字体渲染，而 **Consolas 没有中日韩字形**。
> `check-mojibake.py` 专门盯这两点：检查每段文本分配到的字体是否覆盖它自己的字符、
> 检查含括号的成员是否都被识别成方法。

`verify.mjs` 具体覆盖四类内容：

- **A. 19 个接口逐一调用**，确认 mock 后端真的能响应，且创建活动确实不返回 `checkin_code`；
- **B. 业务规则**：重复报名 409、满员 409、信用分 58 分 403、签到码错 403、
  跨城定位 403（提示 1557 公里）、临期取消 `is_late_cancel=true` 且扣 5 分、
  考勤未勾选记为爽约、非发起人拿不到签到码、已开始不能报名 400；
- **C. 页面渲染**：11 个页面的 HTML 标签配平、无 `undefined`/`NaN`、
  所有 `data-action` 都有对应处理函数；游客态再跑一遍；
- **D. 时区**：不带时区按 UTC 解析、带 `Z` 不重复补、`+08:00` 与 `+0800` 都能识别，
  并专门回归"少 8 小时"这个经典 bug。

最近一次运行结果：

```
A. 接口清单覆盖（19 个）··········· 21 项通过
B. 业务规则（对照《前端对接文档》）·· 13 项通过
C. 页面渲染与 data-action 契约 ····· 39 项通过
D. 时区与格式化 ··················· 12 项通过
E. 一句话找局解析 ················· 14 项通过
────────────────────────────────────────
全部通过：99 项检查
```

类图几何校验：

```
✓ SVG 是合法 XML
✓ 类框数量与 .mmd 一致（15 个）
✓ 所有类框内文本都在框内（无溢出）
✓ 没有连线穿过类框
✓ 画布 1324×1884 完整包住内容
```

---

## 六、界面原型的做法（为什么它不会和实现"两张皮"）

`prototype/screens.html` 里每个手机框都**直接 import 真实页面模块**
（`frontend/src/pages/*.js`），调用它自己的 `view()` 渲染、自己的 `actions` 处理点击。

也就是说：

- 改前端代码 → 重新跑一次 `node tools/build-prototype.mjs` → 原型自动跟着变；
- 原型里能看到的行为，就是代码里真实的行为，不存在"原型画得好看、实现做不到"。

原型内还做了两件展示上的处理：

1. **换页按钮的语义化**：像"详情""去签到""记录考勤"这类会跳路由的按钮，
   在原型里改为**平滑滚动并高亮**目标画面，方便把一整条流程串起来讲。
2. **顶部操作日志**：每次点击都会显示执行了哪个 action，便于答辩时说明"这一下做了什么"。

---

## 七、设计说明（可写进文档的部分）

- **移动优先**：主内容区最大 520px，≥900px 才展开双列；底部标签栏固定并适配 `env(safe-area-inset-bottom)`。
- **设计令牌集中在 `:root`**：主色活力橙 `#ff6a3d`、辅助青绿 `#12b5a5`，
  中性色 5 级，圆角/阴影 3 级。换主题只改这一处。
- **状态即颜色**：可报名=绿、已满员=黄、进行中=蓝、已结束=灰、已取消=红；
  信用分用环形进度并按阈值变色（<60 红）。
- **每个页面都有四态**：加载骨架屏 / 空态（带引导按钮）/ 错误条（显示后端原文）/ 正常态。
- **信息密度控制**：活动卡片把"还有几个位置"做成进度条而不是纯文字；
  一句话找局把后端返回的 `reason` 渲染成"项目匹配 / 水平合适 / 同校区 / 距离 0.5km"标签，
  让用户看得见"为什么推荐给你"。

---

## 八、已知限制（如实说明）

1. **未接真实后端实测**：本机没有外网（`curl` 访问 GitHub / npm / Render 全部超时），
   所以所有验证都跑在内置 mock 上。接口路径、参数、字段、状态码均严格对照《前端对接文档》，
   但"真实后端联调"这一步没做过 —— 这是环境限制，不是取舍。
2. **原型图是"重绘"而非"截图"**：沙盒禁止 Chromium 的进程间通信
   （`platform_channel.cc: Check failed`），Edge 无头模式起不来，所以拿不到真实网页截图。
   现在的 `out/prototype-jpg/` 是用 Pillow 按同一套设计令牌与 CSS 尺寸**重画**的，
   因此**不是浏览器渲染的像素级还原**：字体回退到微软雅黑、个别 emoji 用几何图形代替
   （如定位图钉）、长文本换行位置可能与浏览器略有差异。
   要看真实的浏览器渲染效果，用 `prototype/screens.html`（可交互、可当场演示）。
3. **演示用数据是示意数据**：`frontend/src/fixtures/index.js` 里的 4 个用户、9 场活动、
   5 条评价全部是编的，不是真实用户信息。
4. **离线 mock 的数据库在内存里**：刷新页面即还原。要持久化就接真实后端。
5. **原 `sportmate-web/` 与 `docs/` 未改动**：工作区里已有的 React monorepo
   （含申诉、工单、团体等模块）实现的是另一份需求，与本 zip 的后端接口对不上，
   因此本次交付是独立新建的 `sportmate-app/`，旧目录原样保留。

---

## 九、类图怎么用

- 直接看：`docs/diagrams/class-diagram.html`（可缩放，下方有类/关系清单表）
- 插进报告：`docs/diagrams/class-diagram.svg`（矢量，Word 里"插入 → 图片"即可）
- 继续编辑：`docs/diagrams/class-diagram.mmd`，贴到 <https://mermaid.live> 或 IDE 插件里改；
  改完执行 `python tools/render-class-diagram.py` 重新出图。

类图覆盖 15 个类：`User`、`Activity`、`Registration`、`Participant`、`Review`、`Sport`、
`MatchResult`、`MatchReason`、`AuthSession`、`CheckinResult`，
以及 5 个枚举 `SkillLevel` / `ActivityStatus` / `RegistrationStatus` / `CheckinMethod` / `GenderLimit`。

图中把"投影视图"（`Participant`，来自 `GET /activities/{id}` 的 `participants[]`）
与"实体"（`Registration`，报名表）区分开了，避免把响应结构误当成数据库表。
