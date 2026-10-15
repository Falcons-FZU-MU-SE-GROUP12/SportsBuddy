/**
 * 路由（基于 hash，零依赖）
 * ---------------------------------------------------------------------------
 * 用 hash 而不是 History API，有两个实际原因：
 *   1. 静态服务器不需要为每条路径做 rewrite，直接双击打开也能用；
 *   2. 原型文件（file:// 或 iframe 内）同样能跑。
 * 守卫规则：ROUTES[name].auth === true 的页面在未登录时跳转到 #/login。
 */

import { ROUTES, parseHash, store } from './store.js'
import { clearFlash, flash } from './store.js'
import { setPage, setShell } from './shared/ui.js'

/** name -> () => Promise<page> */
const registry = new Map()

/** 注册页面模块。 */
export function register(name, loader) {
  registry.set(name, loader)
}

export function navigate(name, params = {}) {
  const path = params.id != null ? `#/${name}/${params.id}` : `#/${name}`
  if (location.hash === path) handleRoute()
  else location.hash = path
}

export function back() {
  if (history.length > 1) history.back()
  else navigate('discover')
}

/** 解析当前 hash → 加载页面 → 渲染。 */
export async function handleRoute() {
  const route = parseHash(location.hash)
  const meta = ROUTES[route.name] ?? ROUTES.discover

  // 登录守卫
  if (meta.auth && !store.me) {
    flash('info', '这个页面需要先登录。')
    location.hash = '#/login'
    return
  }

  store.route = route
  const loader = registry.get(route.name)
  if (!loader) {
    setShell({ body: `<p class="sm-card">页面不存在：#/${route.name}</p>`, layers: [] })
    return
  }

  let page
  try {
    page = await loader(route.params)
  } catch (err) {
    setShell({
      appBar: '',
      body: `<main class="sm-main">${errBlock(err?.message ?? '页面加载失败')}</main>`,
      layers: [],
    })
    return
  }

  setPage(page)
  setShell({ appBar: page.appBar?.() ?? '', body: page.view(), layers: [] })

  // 先渲染骨架，再异步取数，取完再刷一次 —— 保证首屏不空等
  if (typeof page.load === 'function') {
    try {
      await page.load()
      if (store.route === route) {
        setShell({ appBar: page.appBar?.() ?? '', body: page.view() })
      }
    } catch (err) {
      page.error = err?.message ?? '加载失败'
      if (store.route === route) {
        setShell({ appBar: page.appBar?.() ?? '', body: page.view() })
      }
    }
  }
}

function errBlock(text) {
  return `<div class="sm-alert sm-alert--error"><span class="sm-alert__icon">⚠️</span><span>${text}</span></div>`
}

/** 启动路由监听。 */
export function startRouter() {
  window.addEventListener('hashchange', () => {
    clearFlash()
    handleRoute()
  })
  if (!location.hash) location.hash = '#/discover'
  return handleRoute()
}
