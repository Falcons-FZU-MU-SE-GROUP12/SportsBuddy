/**
 * 链接与资源完整性检查
 * ---------------------------------------------------------------------------
 * 静态站点最容易出的问题是"页面能开，但某个 js/css 404"，而浏览器控制台的
 * 报错在没有图形界面的环境里看不到。这个脚本用 HTTP 把每个入口页面的
 * src/href 抓出来逐个请求，确保交付物"打开就是对的"。
 *
 * 用法：
 *   1) 先启动服务： node tools/server.mjs
 *   2) 再执行：     node tools/check-links.mjs [baseUrl]
 *
 * baseUrl 可以是任意深度的子路径，用来验证"部署在子目录下"的场景，例如
 * 模拟 GitHub Pages：
 *   node tools/server.mjs 5182 --prefix=/SportsBuddy/src/frontend
 *   node tools/check-links.mjs http://127.0.0.1:5182/SportsBuddy/src/frontend
 *
 * 注意：BASE 末尾是否带 / 会影响相对路径解析，这里统一补上。
 */

const RAW_BASE = process.argv[2] ?? 'http://127.0.0.1:5178'
const BASE = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`

/** 入口页面（写成相对于站点根的路径，不带开头的 /） */
const ENTRIES = [
  'frontend/index.html',
  'prototype/index.html',
  'prototype/screens.html',
  'prototype/wireframe.html',
  'docs/diagrams/class-diagram.html',
]

/** 把页面里的引用解析成绝对 URL（只处理本工程用到的 ./ ../ / 三种写法）。 */
function resolveUrl(fromUrl, ref) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) return null
  if (ref.startsWith('/')) {
    // 站点内绝对路径：要挂到 BASE 这个子路径下，而不是域名根
    return new URL(ref.replace(/^\/+/, ''), BASE).href
  }
  return new URL(ref, fromUrl).href
}

let pass = 0
const problems = []

async function probe(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return { ok: res.ok, status: res.status, length: Number(res.headers.get('content-length') ?? 0) }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  }
}

console.log(`检查基地址：${BASE}\n`)

for (const entry of ENTRIES) {
  const url = new URL(entry, BASE).href
  let html = ''
  try {
    const res = await fetch(url)
    if (!res.ok) {
      problems.push(`${entry} 返回 HTTP ${res.status}`)
      console.log(`✗ ${entry} → HTTP ${res.status}`)
      continue
    }
    html = await res.text()
  } catch (err) {
    problems.push(`${entry} 请求失败：${err.message}`)
    console.log(`✗ ${entry} → ${err.message}`)
    continue
  }

  // 抓取所有 src= 与 href= 引用
  const refs = new Set()
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) refs.add(m[1])
  // 抓取 data-mount 对应的模块（原型页在脚本里动态 import）
  const dynamic = new Set()
  for (const m of html.matchAll(/import\(([^)]*)\)/g)) {
    const arg = m[1].trim().replace(/^["'`]|["'`]$/g, '')
    if (arg && !arg.includes('+')) dynamic.add(arg)
  }

  let checked = 0
  const localRefs = [...refs].filter((r) => !/^#|^mailto:|^javascript:/.test(r))
  for (const ref of localRefs) {
    const target = resolveUrl(url, ref)
    if (!target) continue
    const r = await probe(target)
    checked += 1
    if (!r.ok) {
      problems.push(`${entry} 引用的 ${ref} → HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`)
      console.log(`  ✗ ${ref} → ${r.status || r.error}`)
    }
  }

  // 原型页用到的页面模块路径（脚本里拼出来的），单独请求确认存在
  if (entry === 'prototype/screens.html') {
    const modules = [
      'login', 'discover', 'activities', 'activity', 'activity-new', 'activity-manage',
      'checkin', 'review', 'user', 'manage', 'me',
    ]
    for (const m of modules) {
      const u = new URL(`frontend/src/pages/${m}.js`, BASE).href
      const r = await probe(u)
      checked += 1
      if (!r.ok) {
        problems.push(`原型依赖的页面模块 frontend/src/pages/${m}.js → HTTP ${r.status}`)
        console.log(`  ✗ pages/${m}.js → ${r.status}`)
      }
    }
  }

  pass += 1
  console.log(`✓ ${entry}（检查了 ${checked} 个本地引用）`)
}

/* ---------------------------------------------------------------------------
 * 自检：确认"入口 URL 的拼法"本身是对的。
 * 上面的检查如果因为 BASE 拼错而全部 404，会一起报错、看不出根因；
 * 这里额外请求一个必然存在的固定文件，明确区分"站点没起来"和"路径拼错"。
 * ------------------------------------------------------------------------- */
{
  const sanity = new URL('frontend/index.html', BASE).href
  const r = await probe(sanity)
  if (r.ok) {
    console.log(`\n基地址自检：${sanity} 可达 ✓`)
  } else {
    problems.push(
      `基地址自检失败：${sanity} 返回 ${r.status || r.error}；` +
        `请确认服务已启动、且 baseUrl 与 --prefix 一致（当前 baseUrl=${RAW_BASE}）`
    )
    console.log(`\n基地址自检：${sanity} → ${r.status || r.error} ✗`)
  }
}

console.log(`\n${'─'.repeat(60)}`)
if (problems.length) {
  console.log(`发现 ${problems.length} 个问题：`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log(`全部通过：${pass} 个入口页面，所有引用的 js/css/svg 都能正常返回`)
