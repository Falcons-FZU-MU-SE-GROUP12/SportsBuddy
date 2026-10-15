# SportMate 前端起步包

> 这是**已经接好后端**的 Vue 3 前端脚手架。拿到就能跑，跑起来就能看到真实数据。
> 你的任务是在这个基础上改成你想要的样子——加页面、加路由、改样式都随意。
>
> **后端不用你管**：项目已配好连同学的线上后端，你只需要 `npm install` + `npm run dev`。

---

## 一、先跑起来（3 步，约 2 分钟）

> 需要 Node.js 18 以上（推荐 20/22）。检查：`node --version`

### 1. 装依赖

```bash
npm install
```

> 慢的话用国内镜像：
> ```bash
> npm install --registry=https://registry.npmmirror.com
> ```

### 2. 启动

```bash
npm run dev
```

### 3. 打开浏览器

```
http://localhost:5173
```

看到登录页就成功了。**注册一个账号试一下**：用户名用字母数字下划线（3 位以上），
密码 6 位以上，点「注册」→ 就能看到活动列表、一句话找局、发起活动都能用。

> ⚠️ **不会自动弹浏览器**，需要你手动打开上面这个地址。
> ⚠️ **启动后那个命令行窗口不能关**，关了服务就停了。

### 关于后端（默认已配好，通常不用管）

项目里的 `.env.development` 已经指向同学的**线上后端**：

```
VITE_API_BASE_URL=https://sportmate-backend-gm34.onrender.com
```

所以**你不需要装 Python、也不需要跑后端**。只有一个注意点：

> 💤 后端跑在 Render 免费实例上，**15 分钟没人访问会休眠**。
> 你隔一阵子第一次打开页面可能要等 **30~60 秒**才出数据，
> 这是正常现象（前端会提示"服务器可能正在唤醒"），再点一下就好了。

如果你想跑得更快更稳（改代码即时生效、没有唤醒等待），可以自己本地跑后端，
看第五节「后端从哪来」的方式 1。

---

## 二、这个起步包已经实现了什么

打开页面你会看到一个完整可用的应用：

| 功能 | 说明 |
|---|---|
| 注册 / 登录 | token 自动保存到 localStorage，刷新页面不会掉登录态 |
| 信用分卡片 | 显示信用分、完成次数、爽约次数、评价均分 |
| 一句话找局 | 输入「今晚想在旗山校区打篮球，新手可以吗」，自动识别项目/校区/水平并推荐 |
| 活动列表 | 支持按项目、水平筛选，只显示还有空位的 |
| 发起活动 | 表单含时间、地点、水平、人数、费用，发布后自动显示签到码 |
| 活动详情弹层 | 参与者名单 + 各自签到状态 |
| 签到 | 签到码签到 + 定位签到两种 |
| 记录考勤 | 发起人勾选到场者，未勾选的自动记爽约扣分 |
| 我的 | 我发起的 / 我报名的，可取消报名 |

**建议你先点一遍**，把每个功能摸清楚，再决定怎么改。

---

## 三、文件说明

```
frontend-starter/
├── src/
│   ├── api.js          ← 【重要】后端接口封装，所有请求都走它
│   ├── App.vue         ← 主页面，所有界面和交互都在这里
│   ├── main.js         ← 入口
│   └── style.css       ← 全局样式（按钮、输入框基础样式）
├── .env.development    ← 【改后端地址就改这里】
├── .env.example        ← 环境变量说明
├── 前端对接文档.md       ← 【接口手册，遇到问题查它】
├── index.html
├── vite.config.js
└── package.json
```

### 两种改后端地址的方式

**方式 A**：改 `.env.development` 里的 `VITE_API_BASE_URL`（推荐，改完要重启 `npm run dev`）

**方式 B**：直接改 `src/api.js` 第 21 行附近的 `BASE_URL`

---

## 四、怎么调接口（不要自己写请求层）

`src/api.js` 已经把 19 个接口都封装好了，直接用：

```js
import api from './api.js'

// 认证（token 自动存、自动带）
await api.login('zhangsan', 'secret123')
await api.register({ username, password, nickname, skill_level: 'beginner' })
await api.logout()
const me = await api.getMe()

// 基础数据
const sports = await api.getSports()        // 下拉框数据源

// 活动
const list = await api.getActivities({ sport: '篮球', only_available: true })
const detail = await api.getActivity(1)     // 带 token 且你是发起人时有 checkin_code
await api.createActivity({ ... })
await api.joinActivity(1, '带我一个')
await api.leaveActivity(1)

// 签到
await api.checkinWithCode(1, '9572')
await api.checkinWithLocation(1, lat, lng)

// 考勤（发起人）：传【到场者】的 user_id 数组
await api.recordAttendance(1, [3, 5])

// 评价
await api.createReview(1, { reviewee_id: 3, score: 5, tags: ['准时'] })

// 匹配
const res = await api.match({ sport: '篮球', campus: '旗山校区' })
const nlp = await api.matchBySentence('今晚想打篮球')
```

### 错误处理

所有错误都抛 `ApiError`，**`err.message` 就是后端返回的中文提示，直接显示给用户即可**：

```js
import api, { ApiError } from './api.js'

try {
  await api.joinActivity(id)
} catch (e) {
  if (e instanceof ApiError) {
    alert(e.message)              // 例如「活动已满员」
    if (e.status === 409) { ... } // 需要区分状态码时再用
    if (e.isAuthError) { ... }    // 401 登录过期，已经自动清掉本地 token
  }
}
```

`App.vue` 里的 `run()` 函数就是一个统一的包装，可以照抄。

---

## 五、后端从哪来（三种方式）

> **默认已经配好了方式 1，你通常什么都不用做。** 下面是三种选择。

### 方式 1：用同学的线上后端（默认，无需任何安装）

项目里的 `.env.development` 已经指向它：

```
VITE_API_BASE_URL=https://sportmate-backend-gm34.onrender.com
```

- 接口文档：https://sportmate-backend-gm34.onrender.com/docs
- 健康检查：https://sportmate-backend-gm34.onrender.com/health

**优点**：你不用装 Python、不用跑第二个服务。
**缺点**：Render 免费实例 **15 分钟没人访问会休眠**，冷启动要等 30~60 秒。

### 方式 2：自己本地跑后端（最稳，改代码即时生效）

需要 Python 3.10+：

```bash
git clone https://github.com/3054664804/sportmate-backend.git
cd sportmate-backend/sportmate-backend     # 注意是两层目录
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

> 如果 clone 失败（仓库结构后来调整过），也可以直接找后端同学要项目压缩包。

然后把 `.env.development` 里那行改成：

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

**改完必须重启 dev server**（Ctrl+C 停掉再 `npm run dev`）。

不需要装数据库、不需要配环境变量——首次启动会自动建表并写入 10 个运动项目。

### 方式 3：连同一个局域网里同学机器上的后端

让后端同学用这个命令启动（**注意是 `0.0.0.0`，不是 `127.0.0.1`**）：

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

他查自己的内网 IP：命令行运行 `ipconfig`，找 **IPv4 地址**（形如 `192.168.x.x`）。

然后你把 `.env.development` 改成：

```
VITE_API_BASE_URL=http://192.168.x.x:8000
```

重启 `npm run dev` 即可。

> ⚠️ 两件事：他要**允许 Windows 防火墙弹窗**；你们要在**同一个 WiFi**下。

### 附：域名变了怎么办

如果后端后来重新部署、域名有变化，把这两处同步改掉即可：

| 文件 | 用途 |
|---|---|
| `.env.development` | 本地开发（`npm run dev`）用的地址 |
| `.env.production` | 部署到公网（`npm run build`）用的地址 |

改完本地开发要**重启 dev server**；部署则必须**重新构建**（见 `部署到公网.md`）。

---

## 六、三个必须知道的坑

### 坑 1：时间会差 8 小时 ⚠️ 最容易踩

后端返回的时间是**不带时区的 UTC 串**：

```
"2026-10-12T06:14:07.169800"     ← 这是 UTC，对应北京时间 14:14
```

**必须补 `Z` 再解析**，否则浏览器会当成本地时间：

```js
// ✅ 正确
new Date(iso + 'Z').toLocaleString('zh-CN')   // 显示 14:14

// ❌ 错误：会显示 6:14
new Date(iso).toLocaleString('zh-CN')
```

`App.vue` 里的 `fmtTime()` 已经处理了（还兼容已经带 Z 或带偏移的情况），直接用它。

**提交时间时**反过来要给 UTC，用 `toISOString()` 最省事：

```js
// 用户在 datetime-local 里选了本地时间，比如 2026-10-12 14:00
start_time: new Date(form.start_time).toISOString()   // → "2026-10-12T06:00:00.000Z" ✅
```

### 坑 2：创建活动不返回签到码

`api.createActivity()` 返回的对象**没有 `checkin_code`**。
需要在创建成功后再调一次 `api.getActivity(created.id)` 才拿得到。
`App.vue` 里就是这么做的，看 `submitCreate()` 函数。

### 坑 3：中文参数要 URL 编码

如果你自己用 `fetch` 拼查询串，中文参数会直接请求失败：

```js
// ❌ 会报错
fetch('/activities?sport=篮球')

// ✅ 用 URLSearchParams（api.js 里就是这么做的）
fetch('/activities?' + new URLSearchParams({ sport: '篮球' }))
```

用 `api.getActivities({ sport: '篮球' })` 就不用管这些。

---

## 七、接下来可以做什么

这个起步包**没有**路由和状态管理，是一个单页面的 demo。你可以：

| 想做的 | 建议 |
|---|---|
| 加页面路由 | 装 `vue-router`，把 `App.vue` 里的各个 section 拆成独立页面 |
| 拆组件 | 把 `App.vue` 里的「活动卡片」「详情弹层」拆成 `components/` 下的组件 |
| 全局状态 | 装 `pinia`，把 `me`（当前用户）提到 store 里 |
| UI 组件库 | 装 Element Plus / Naive UI，替换掉手写的样式 |
| 移动端适配 | 这个应用主要在手机上用（签到、看活动），优先做响应式 |

**改动时注意**：`api.js` 不要重写，那是已经调通的请求层；改界面就改 `App.vue` 或新建组件。

---

## 八、排查问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `npm` 报「因为在此系统上禁止运行脚本」 | Windows PowerShell 执行策略 | 用 `npm.cmd run dev` 代替 `npm run dev`；或管理员 PowerShell 里执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `npm run dev` 后浏览器没反应 | 不会自动弹窗，且窗口可能报错了 | 手动打开 http://localhost:5173 ；看命令行里有没有 `VITE v5.x ready in ...` |
| 页面能开但一直「加载中」或报错 | 后端没启动 | 浏览器打开 `后端地址/health` 确认 |
| 控制台 `Failed to fetch` | 后端没启动 / 地址写错 | 检查 `.env.development` 里的地址，改完**要重启 dev server** |
| 提示「服务器可能正在唤醒」 | Render 免费实例休眠 | 正常现象，等 30~60 秒重试 |
| 一直 401 | token 过期 | 退出重新登录（`api.js` 会自动清掉过期 token） |
| 时间显示比实际早 8 小时 | 没补 `Z` | 见第六节坑 1 |
| 注册报「用户名 长度至少为 3 个字符」 | 格式不对 | 用户名只能字母数字下划线，≥3 位 |
| 报名报「信用分低于 60」 | 信用分不足 | 换个账号试，或先参加活动把分赚回来 |
| 定位签到失败 | 浏览器要求 HTTPS | 本地 `localhost` 可用；部署后需 HTTPS |
| 5173 打不开，命令行显示 5174 | 端口被占用，Vite 自动换端口 | **以命令行里打印的地址为准** |
| `npm install` 很慢 | 网络 | 换淘宝镜像：`npm install --registry=https://registry.npmmirror.com` |

**万能排查**：浏览器直接打开 `后端地址/docs`，用 **Try it out** 手动调同一个接口。
如果那里成功而前端失败，问题一定在前端（地址、token、编码）。

---

## 九、接口手册

完整的 19 个接口说明、真实响应示例、字段含义、错误码对照，
看同一个目录下的 **`前端对接文档.md`**。

遇到「这个字段是什么含义」「这个错误码怎么回事」先查它。
