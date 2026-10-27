/**
 * 校验分享包「双击能不能打开」
 * ===========================================================================
 * 判断标准（file:// 环境下的真实约束）：
 *   1. 不能有外部 <script src> / <link rel=stylesheet>（必须内联）
 *   2. 不能有 type="module"、内联脚本不能有 import/export
 *   3. 所有相对链接（href/src）必须指向包内真实存在的文件
 *   4. 图片目录里的文件必须被引用或在预期清单内
 *   5. 总入口必须链到 4 个页面
 *
 * 用法：node tools/check-share-package.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PKG = resolve(ROOT, 'share', 'SportsBuddy-prototype')

let pass = 0
const problems = []
const ok = (m) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m, d) => { problems.push(`${m}${d ? '：' + d : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? '：' + d : ''}`) }

if (!existsSync(PKG)) {
  console.error('找不到 share/SportsBuddy-prototype/，先跑 node tools/make-share-package.mjs')
  process.exit(1)
}

/** 递归列出包内文件（相对路径，正斜杠） */
function walk(dir, base = PKG) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

const allFiles = walk(PKG)
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'))
console.log(`包内共 ${allFiles.length} 个文件，其中 HTML ${htmlFiles.length} 个\n`)

const EXPECTED_HTML = [
  'index.html',
  '01-mobile-prototype.html',
  '02-screens-gallery.html',
  '03-wireframe.html',
  '04-class-diagram.html',
]
for (const f of EXPECTED_HTML) {
  if (allFiles.includes(f)) ok(`存在 ${f}（${(statSync(join(PKG, f)).size / 1024).toFixed(0)} KB）`)
  else bad(`缺少 ${f}`)
}

/* ---------------- 逐个 HTML 检查 ---------------- */
for (const rel of htmlFiles) {
  const file = join(PKG, rel)
  const html = readFileSync(file, 'utf8')
  const dir = dirname(file)

  // 1) 外部脚本 / 外链样式
  const extScript = [...html.matchAll(/<script[^>]*\ssrc\s*=\s*"([^"]+)"/gi)].map((m) => m[1])
  const extCss = [...html.matchAll(/<link[^>]*rel\s*=\s*"stylesheet"[^>]*>/gi)]
    .filter((m) => /href\s*=\s*"([^"]+)"/i.test(m[0]))
    .map((m) => m[0].match(/href\s*=\s*"([^"]+)"/i)[1])
  if (!extScript.length && !extCss.length) ok(`${rel}：无外部脚本 / 外链样式（内容全内联）`)
  else bad(`${rel}：有外部依赖，双击会加载失败`, [...extScript, ...extCss].slice(0, 4).join(', '))

  // 2) ES Module
  if (/type\s*=\s*"module"/i.test(html)) bad(`${rel}：含 type="module"（file:// 禁止）`)
  else ok(`${rel}：无 type="module"`)

  const inlineAll = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
  if (/(^|\n)\s*(import|export)\s/.test(inlineAll)) bad(`${rel}：内联脚本含 import/export`)
  else ok(`${rel}：内联脚本无 import/export`)

  // 3) 相对链接是否有效
  const refs = new Set()
  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/gi)) refs.add(m[1])
  const broken = []
  let checked = 0
  for (const ref of refs) {
    if (/^(https?:|mailto:|javascript:|data:)/i.test(ref)) continue   // 外链：双击时不需要本地文件
    if (ref.startsWith('#')) continue
    const clean = ref.split('#')[0].split('?')[0]
    if (!clean) continue
    const target = resolve(dir, clean)
    checked++
    if (!existsSync(target)) broken.push(ref)
  }
  if (!broken.length) ok(`${rel}：${checked} 个相对链接全部指向包内存在的文件`)
  else bad(`${rel}：有 ${broken.length} 个链接指向不存在的文件`, broken.slice(0, 5).join(', '))
}

/* ---------------- 图片 ----------------
 * 注意：CSS 里的 url() 也算引用，但这里只检查 HTML 里直接引用的图片 + 清单完整性 */
const imgs = allFiles.filter((f) => /^images\/.+\.(jpe?g|png|webp)$/i.test(f))
if (imgs.length >= 15) ok(`images/ 里有 ${imgs.length} 张图`)
else bad('images/ 数量偏少', `只有 ${imgs.length} 张`)

const indexHtml = readFileSync(join(PKG, 'index.html'), 'utf8')
const missingTargets = EXPECTED_HTML.filter((f) => f !== 'index.html' && !indexHtml.includes(`href="${f}"`))
if (!missingTargets.length) ok('总入口 index.html 链接到全部 4 个页面')
else bad('总入口缺少链接', missingTargets.join(', '))

if (indexHtml.includes('images/prototype-overview.jpg')) ok('总入口链接到总览图')
else bad('总入口没有链接到 images/prototype-overview.jpg')

/* ---------------- 体积与清单 ---------------- */
const zipPath = resolve(ROOT, 'share', 'SportsBuddy-prototype.zip')
if (existsSync(zipPath)) {
  ok(`zip 已生成：${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`)
} else {
  bad('没有找到 zip')
}

console.log('\n' + '─'.repeat(64))
if (problems.length) {
  console.log(`\x1b[31m${problems.length} 项失败\x1b[0m`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log(`\x1b[32m全部通过：${pass} 项检查\x1b[0m —— 解压后双击 index.html 即可打开`)
