/**
 * 对"解压出来的副本"再做一次校验
 * ---------------------------------------------------------------------------
 * 为什么单独做：验证源目录通过不代表 zip 里的内容也完整（压缩过程、路径层级、
 * 编码都可能出问题）。这里针对解压后的真实产物跑同样的断言。
 *
 * 用法：node tools/check-extracted.mjs <解压目录内的包目录>
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const PKG = resolve(process.argv[2] || '')
let pass = 0
const problems = []
const ok = (m) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m, d) => { problems.push(m + (d ? '：' + d : '')); console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? '：' + d : ''}`) }

if (!existsSync(PKG)) {
  console.error('路径不存在：' + PKG)
  process.exit(1)
}
console.log(`校验解压后的目录：${PKG}\n`)

const HTMLS = ['index.html', '01-mobile-prototype.html', '02-screens-gallery.html', '03-wireframe.html', '04-class-diagram.html']

for (const name of HTMLS) {
  const file = join(PKG, name)
  if (!existsSync(file)) { bad(`缺少 ${name}`); continue }
  const html = readFileSync(file, 'utf8')

  const extScript = [...html.matchAll(/<script[^>]*\ssrc\s*=\s*"([^"]+)"/gi)].length
  const extCss = [...html.matchAll(/<link[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=/gi)].length
  const module = /type\s*=\s*"module"/i.test(html)
  const size = (statSync(file).size / 1024).toFixed(0)

  if (extScript === 0 && extCss === 0 && !module) {
    ok(`${name}（${size} KB）自包含，可双击打开`)
  } else {
    bad(`${name} 有外部依赖或模块`, `script=${extScript} css=${extCss} module=${module}`)
  }

  // 相对链接有效性
  const broken = []
  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/gi)) {
    const ref = m[1]
    if (/^(https?:|mailto:|javascript:|data:|#)/i.test(ref)) continue
    const clean = ref.split('#')[0].split('?')[0]
    if (!clean) continue
    if (!existsSync(resolve(PKG, clean))) broken.push(ref)
  }
  if (!broken.length) ok(`${name}：所有相对链接有效`)
  else bad(`${name}：断链 ${broken.slice(0, 4).join(', ')}`)
}

const imgs = existsSync(join(PKG, 'images')) ? readdirSync(join(PKG, 'images')).filter((f) => /\.(jpe?g|png)$/i.test(f)) : []
if (imgs.length === 15) ok(`images/ 15 张图齐全`)
else bad('images 数量不对', String(imgs.length))

if (existsSync(join(PKG, 'README.txt'))) ok('README.txt 存在')
else bad('缺少 README.txt')

console.log('\n' + '─'.repeat(60))
if (problems.length) {
  console.log(`\x1b[31m${problems.length} 项失败\x1b[0m`)
  process.exit(1)
}
console.log(`\x1b[32m全部通过：${pass} 项 —— zip 解压后可直接双击 index.html\x1b[0m`)
