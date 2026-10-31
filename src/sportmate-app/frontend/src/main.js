/**
 * 启动引导
 * ---------------------------------------------------------------------------
 * 顺序很重要：
 *   1. 预热 /health（云上免费实例会休眠，先叫醒它，首屏才不会卡 30~60 秒）
 *   2. 拉运动字典（下拉框要用）
 *   3. 用本地 token 恢复登录态
 *   4. 挂载路由
 */

import { api } from './api/index.js'
import { USE_MOCK, BASE_URL } from './api/http.js'
import { register, startRouter } from './router.js'
import { loadSports, restoreSession, store } from './store.js'
import { mount } from './shared/ui.js'

/* ---------------- 页面注册（按需 import，天然懒加载） ---------------- */
/*
 * ⚠️ 必须把路由参数透传给 create(params)。
 * 之前写成 `async () => create()`，参数被丢掉，于是 #/activity/101 里
 * create 收到 undefined → params.id 变成 NaN → 详情页报
 * 「mock 未实现：GET /activities/NaN」。
 * router.handleRoute 调用的是 loader(route.params)，所以这里要接收并传下去。
 */

register('login', async (params) => (await import('./pages/login.js')).create(params))
register('discover', async (params) => (await import('./pages/discover.js')).create(params))
register('activities', async (params) => (await import('./pages/activities.js')).create(params))
register('activity', async (params) => (await import('./pages/activity.js')).create(params))
register('activity-new', async (params) => (await import('./pages/activity-new.js')).create(params))
register('activity-manage', async (params) => (await import('./pages/activity-manage.js')).create(params))
register('checkin', async (params) => (await import('./pages/checkin.js')).create(params))
register('review', async (params) => (await import('./pages/review.js')).create(params))
register('user', async (params) => (await import('./pages/user.js')).create(params))
register('manage', async (params) => (await import('./pages/manage.js')).create(params))
register('me', async (params) => (await import('./pages/me.js')).create(params))

/* ---------------- 启动 ---------------- */

/** 带超时的预热：连不上也不阻塞首屏，只在界面上留个提示。 */
async function warmUp() {
  if (USE_MOCK) {
    store.serverAwake = true
    return
  }
  try {
    await Promise.race([
      api.getHealth(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ])
    store.serverAwake = true
  } catch {
    store.serverAwake = false
  }
}

function offlineBanner() {
  if (!USE_MOCK) return ''
  return `<div class="sm-offline">
    <b>离线演示模式</b>　当前用内置示意数据，未连接后端（${BASE_URL}）
  </div>`
}

async function bootstrap() {
  const app = document.getElementById('app')
  // 离线提示条固定在最上方，不参与页面重渲染
  app.innerHTML = `<div id="sm-banner"></div><div id="sm-root"></div>`
  document.getElementById('sm-banner').innerHTML = offlineBanner()

  const root = document.getElementById('sm-root')

  await warmUp()
  await loadSports()
  await restoreSession()

  await mount(root, async () => {
    await startRouter()
  })
}

bootstrap().catch((err) => {
  document.getElementById('app').innerHTML = `
    <main class="sm-main" style="padding-top:60px">
      <div class="sm-card">
        <h2 style="font-size:17px;margin-bottom:8px">启动失败</h2>
        <p class="sm-card__hint">${String(err?.message ?? err)}</p>
        <p class="sm-card__hint" style="margin-top:10px">
          如果你直接双击打开了 index.html：浏览器不允许 file:// 加载 ES Module，
          请用 <code>node tools/server.mjs</code> 起服务后再访问 http://127.0.0.1:5178/frontend/
        </p>
      </div>
    </main>`
  console.error(err)
})
