/**
 * 极简浏览器环境替身
 * ---------------------------------------------------------------------------
 * 用途：让 verify.mjs 能在 Node 里 import 前端的页面模块（它们会用到
 *       window / localStorage / location 这些浏览器全局）。
 * 只实现本项目真正用到的那几个 API，多余的一律不实现 —— 这样一旦代码
 * 用了新的浏览器能力，校验脚本会立刻报错，而不是悄悄放过。
 */

class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null
  }
  setItem(k, v) {
    this.map.set(k, String(v))
  }
  removeItem(k) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

export function installBrowserStub({ apiBaseUrl = 'http://127.0.0.1:8000', useMock = true } = {}) {
  const storage = new MemoryStorage()
  const listeners = new Map()

  const location = {
    hash: '',
    href: 'http://127.0.0.1:5178/frontend/',
    origin: 'http://127.0.0.1:5178',
    pathname: '/frontend/index.html',
    search: '',
  }

  const windowStub = {
    __SPORTMATE_CONFIG__: { apiBaseUrl, useMock },
    location,
    localStorage: storage,
    navigator: { geolocation: undefined, userAgent: 'node' },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type).push(fn)
    },
    removeEventListener() {},
    history: { length: 1, back() {} },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    CSS: { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) },
  }

  globalThis.window = windowStub
  globalThis.localStorage = storage
  globalThis.location = location
  // Node 24 自带 navigator 且只有 getter，所以用 defineProperty 覆盖
  Object.defineProperty(globalThis, 'navigator', {
    value: windowStub.navigator,
    configurable: true,
    writable: true,
  })
  globalThis.history = windowStub.history
  globalThis.CSS = windowStub.CSS

  return { window: windowStub, location, storage, listeners }
}

/** 让 location.hash 的赋值能触发 hashchange（页面里用 location.hash 导航）。 */
export function enableHashEvents() {
  const store = { value: '' }
  Object.defineProperty(globalThis.location, 'hash', {
    get: () => store.value,
    set: (v) => {
      store.value = v
    },
    configurable: true,
  })
  return store
}
