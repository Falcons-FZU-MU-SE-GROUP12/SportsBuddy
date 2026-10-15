/**
 * 微型渲染内核（约 200 行）
 * ---------------------------------------------------------------------------
 * 为什么不用框架：本工程要求"零安装、离线可跑"。所以这里的做法是：
 *   页面 = 纯函数 view(state) -> HTML 字符串
 *   + 全局事件委托（data-action）
 *   + 重渲染前保存输入值/焦点，避免表单被刷掉
 * 这点体量足够支撑 10 个页面，而且没有构建步骤、没有 node_modules。
 *
 * 事件协议（页面只需遵守这两条）：
 *   1. 可点元素写 data-action="xxx"，参数写成 data-* 属性；
 *   2. 处理函数放在 page.actions["xxx"]，签名 (el, ctx)。
 */

let mountEl = null
let currentPage = null
let shell = { appBar: '', body: '', layers: [] }
let renderQueued = false

/* ---------------- 输入态保存 ---------------- */

/**
 * 重渲染会把 DOM 整个换掉，用户正在填的内容必须救回来。
 * 这里按 name 维度保存：文本框的 value、复选框的勾选状态。
 */
function snapshotForm(root) {
  const snap = { values: {}, checks: {}, focus: null }
  if (!root) return snap
  for (const el of root.querySelectorAll('input[name], textarea[name], select[name]')) {
    const k = el.name
    if (el.type === 'checkbox' || el.type === 'radio') {
      ;(snap.checks[k] ??= []).push({ value: el.value, checked: el.checked })
    } else if (el.type !== 'file') {
      snap.values[k] = el.value
    }
    if (el === document.activeElement) {
      snap.focus = { name: k, start: el.selectionStart, end: el.selectionEnd }
    }
  }
  return snap
}

function restoreForm(root, snap) {
  if (!root) return
  for (const [k, v] of Object.entries(snap.values)) {
    for (const el of root.querySelectorAll(`[name="${CSS.escape(k)}"]`)) el.value = v
  }
  for (const [k, list] of Object.entries(snap.checks)) {
    const els = [...root.querySelectorAll(`[name="${CSS.escape(k)}"]`)]
    for (const el of els) {
      const hit = list.find((x) => x.value === el.value)
      if (hit) el.checked = hit.checked
    }
  }
  if (snap.focus) {
    const el = root.querySelector(`[name="${CSS.escape(snap.focus.name)}"]`)
    if (el && typeof el.focus === 'function') {
      el.focus()
      try {
        el.setSelectionRange(snap.focus.start, snap.focus.end)
      } catch {
        /* number 类型不支持 setSelectionRange，忽略 */
      }
    }
  }
}

/* ---------------- 渲染 ---------------- */

/** 页面用它更新界面：setShell({ body: page.view() }) */
export function setShell(next) {
  shell = { ...shell, ...next }
  scheduleRender()
}

/** 局部更新：只改 body / 只改 layers。 */
export function patchShell(patch) {
  setShell(patch)
}

export function scheduleRender() {
  if (renderQueued) return
  renderQueued = true
  queueMicrotask(() => {
    renderQueued = false
    paint()
  })
}

function paint() {
  if (!mountEl) return
  const snap = snapshotForm(mountEl)
  mountEl.innerHTML =
    (shell.appBar ?? '') + (shell.body ?? '') + (shell.layers ?? []).join('')
  restoreForm(mountEl, snap)
}

/* ---------------- 事件委托 ---------------- */

/** 从元素往上找带 data-action 的祖先。 */
function actionEl(node) {
  let el = node
  while (el && el !== mountEl) {
    if (el.dataset && el.dataset.action) return el
    el = el.parentElement
  }
  return null
}

/** 收集元素上的 data-* 参数（排除 action 本身）。 */
function actionData(el) {
  const out = {}
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k !== 'action') out[k] = v
  }
  return out
}

/** 读取某个表单里所有命名控件（含多选 checkbox）。 */
export function formData(root) {
  const out = {}
  if (!root) return out
  for (const el of root.querySelectorAll('input[name], textarea[name], select[name]')) {
    const k = el.name
    if (el.type === 'checkbox') {
      if (!Array.isArray(out[k])) out[k] = []
      if (el.checked) out[k].push(el.value)
    } else if (el.type === 'radio') {
      if (el.checked) out[k] = el.value
    } else {
      out[k] = el.value
    }
  }
  return out
}

/** 给页面用的上下文：能读表单、能重渲染、能导航。 */
function makeCtx(el) {
  return {
    data: actionData(el),
    form: formData(el.closest('form') ?? mountEl),
    root: mountEl,
    el,
    rerender: () => setShell({ body: currentPage?.view?.() ?? '' }),
  }
}

async function handleAction(el, event) {
  if (!currentPage?.actions) return
  const name = el.dataset.action
  const fn = currentPage.actions[name]
  if (typeof fn !== 'function') return
  event.preventDefault()
  try {
    await fn(makeCtx(el))
  } catch (err) {
    // 页面 action 内部应该自己 try/catch；漏出来的错误兜底展示，避免白屏
    console.error('[action error]', name, err)
    setShell({ layers: [(shell.layers ?? []).slice(-1)[0] ?? '', errorLayer(err?.message ?? '操作失败')].filter(Boolean) })
  }
}

let bound = false
function bindEvents() {
  if (bound) return
  bound = true

  mountEl.addEventListener('click', (e) => {
    const el = actionEl(e.target)
    if (!el) return
    // 表单里的 submit 按钮交给 submit 事件，避免"点一下提交两次"
    if (el.tagName === 'BUTTON' && el.getAttribute('type') === 'submit') return
    handleAction(el, e)
  })

  mountEl.addEventListener('submit', (e) => {
    const form = e.target
    if (!(form instanceof HTMLFormElement)) return
    const el = actionEl(form.querySelector('[type="submit"]') ?? form) ?? form.closest('[data-action]')
    if (el && el.dataset.action && currentPage?.actions?.[el.dataset.action]) {
      e.preventDefault()
      handleAction(el, e)
      return
    }
    // 整个 <form data-action="..."> 的写法
    if (form.dataset.action && currentPage?.actions?.[form.dataset.action]) {
      e.preventDefault()
      handleAction(form, e)
    }
  })

  mountEl.addEventListener('keydown', (e) => {
    // Esc 关闭浮层
    if (e.key === 'Escape' && (shell.layers ?? []).length) {
      setShell({ layers: [] })
      return
    }
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = actionEl(e.target)

    // 1) 卡片等 role="button" 元素，回车/空格等价于点一下
    if (e.key === 'Enter' && el?.getAttribute('role') === 'button') {
      e.preventDefault()
      handleAction(el, e)
      return
    }
    // 2) 输入框回车触发同一行的按钮：写 data-enter="按钮的 data-action 名"
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      const btn = e.target.closest('[data-enter]')?.querySelector('[data-action]')
      if (btn && !e.target.closest('form')) {
        e.preventDefault()
        handleAction(btn, e)
      }
    }
  })
}

/* ---------------- 启动 ---------------- */

/**
 * 挂载应用。
 * @param {HTMLElement} el 容器
 * @param {() => Promise<void>} bootstrap 首屏初始化（内部自己调 setShell）
 */
export async function mount(el, bootstrap) {
  mountEl = el
  bindEvents()
  await bootstrap()
  paint()
}

export const getMount = () => mountEl

/** 设置当前页面对象（路由切换时调用）。 */
export function setPage(page) {
  currentPage = page
}

export const getPage = () => currentPage

/** 生成一个简单的错误浮层（兜底用）。 */
export function errorLayer(text) {
  return `<div class="sm-sheet" data-action="close-layer"><div class="sm-sheet__panel">
    <div class="sm-sheet__head"><span class="sm-sheet__title">出错了</span></div>
    ${alertBox(text)}
  </div></div>`
}

function alertBox(text) {
  return `<div class="sm-alert sm-alert--error"><span class="sm-alert__icon">⚠️</span><span>${text}</span></div>`
}
