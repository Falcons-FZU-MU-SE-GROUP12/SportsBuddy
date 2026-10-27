/**
 * 校验单文件移动端原型 prototype/mobile-prototype.html
 * ===========================================================================
 * 这个文件的设计目标是"双击就能打开"，所以出问题的典型方式不是报错，而是：
 *   · 忘了内联某个资源 → file:// 下 404 → 白屏
 *   · 用到了 ES Module → file:// 下被浏览器拒绝 → 白屏
 *   · 跳转目标写错 → 点了没反应
 *   · 某屏 HTML 标签不配平 → 后面整页结构错乱
 * 下面逐项自动检查。
 *
 * 用法：node tools/check-mobile-prototype.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const FILE = resolve(ROOT, 'prototype', 'mobile-prototype.html')

let pass = 0
const problems = []
const ok = (m) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}`) }
const bad = (m, d) => { problems.push(`${m}${d ? '：' + d : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? '：' + d : ''}`) }

const html = readFileSync(FILE, 'utf8')
console.log(`文件：prototype/mobile-prototype.html（${(Buffer.byteLength(html) / 1024).toFixed(0)} KB）\n`)

/* ---------------- 1) 12 屏齐全 ---------------- */
const sections = [...html.matchAll(/<section class="screen" id="(\w+)" data-no="([^"]+)" data-title="([^"]+)"/g)]
  .map((m) => ({ id: m[1], no: m[2], title: m[3] }))
if (sections.length === 12) ok(`共 12 屏：${sections.map((s) => s.id).join(' ')}`)
else bad('屏数不对', `期望 12，实际 ${sections.length}`)

const ids = sections.map((s) => s.id)
const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i)
if (!dupIds.length) ok('屏 id 无重复')
else bad('屏 id 重复', dupIds.join(','))

const expectedIds = Array.from({ length: 12 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
if (JSON.stringify(ids) === JSON.stringify(expectedIds)) ok('id 顺序为 p01…p12，可作为 hash 路由')
else bad('id 顺序异常', ids.join(','))

/* ---------------- 2) 无外部依赖（file:// 可直开） ---------------- */
const externalRefs = [
  ...html.matchAll(/<script[^>]*\ssrc\s*=\s*"([^"]+)"/gi),
  ...html.matchAll(/<link[^>]*\shref\s*=\s*"([^"]+)"/gi),
  ...html.matchAll(/<img[^>]*\ssrc\s*=\s*"([^"]+)"/gi),
].map((m) => m[1]).filter((u) => !u.startsWith('data:'))

if (!externalRefs.length) ok('没有任何外部 script/link/img 引用（真正自包含）')
else bad('存在外部引用，file:// 下会 404', externalRefs.slice(0, 5).join(', '))

if (!/type\s*=\s*"module"/i.test(html)) ok('没有 type="module"（file:// 禁用模块，用模块会白屏）')
else bad('出现了 type="module"，file:// 打开会被浏览器拒绝')

const inlineScript = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || ''
const hasImportLike = /(^|\n)\s*(import|export)\s/.test(inlineScript)
if (!hasImportLike) ok('内联脚本中没有 import / export 语句')
else bad('内联脚本含 import/export（非模块脚本里是语法错误）')

/* ---------------- 3) CSS 是否内联 ---------------- */
const hasTokens = html.includes('--brand:') && html.includes('.sm-card') && html.includes('.sm-tabbar')
if (hasTokens) ok('设计系统 CSS 已内联（含设计令牌与 .sm-* 组件类）')
else bad('CSS 似乎缺失', '找不到 --brand / .sm-card 等')

/* ---------------- 4) 跳转目标都存在 ---------------- */
// data-goto="pXX"
const gotoTargets = [...html.matchAll(/data-goto="(\w+)"/g)].map((m) => m[1])
const badGoto = gotoTargets.filter((t) => !ids.includes(t))
if (gotoTargets.length && !badGoto.length) ok(`${gotoTargets.length} 个 data-goto 跳转目标全部存在`)
else if (badGoto.length) bad('data-goto 指向不存在的屏', [...new Set(badGoto)].join(', '))
else bad('没有找到任何跳转按钮')

// 脚本里的 ROUTE / HREF_ROUTE 目标
const routeBlock = (inlineScript.match(/var ROUTE = (\{[\s\S]*?\});/) || [])[1] || ''
const hrefBlock = (inlineScript.match(/var HREF_ROUTE = (\{[\s\S]*?\});/) || [])[1] || ''
const routeTargets = [...routeBlock.matchAll(/:\s*"(\w+)"/g)].map((m) => m[1])
const hrefTargets = [...hrefBlock.matchAll(/:\s*"(\w+)"/g)].map((m) => m[1])
const badRoute = [...routeTargets, ...hrefTargets].filter((t) => !ids.includes(t))
if (routeTargets.length && !badRoute.length) {
  ok(`动作映射的 ${routeTargets.length} 个目标屏 + 标签栏 ${hrefTargets.length} 个目标屏均存在`)
} else if (badRoute.length) bad('动作映射指向不存在的屏', [...new Set(badRoute)].join(', '))
else bad('脚本里没有解析到 ROUTE 映射')

/* ---------------- 5) 每屏标签配平 ---------------- */
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source', 'circle', 'path', 'use', 'polygon'])
let tagProblems = 0
for (const m of html.matchAll(/<section class="screen" id="(\w+)"[\s\S]*?(?=<section class="screen"|<!-- 屏幕跳转菜单 -->)/g)) {
  const id = m[1]
  const chunk = m[0]
  const stack = []
  for (const t of chunk.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, raw, , selfClose] = t
    const tag = raw.toLowerCase()
    if (VOID.has(tag) || selfClose === '/') continue
    if (!closing) stack.push(tag)
    else {
      const last = stack.pop()
      if (last !== tag) { tagProblems++; if (tagProblems <= 3) bad(`${id} 标签不配平`, `期望 </${last}> 实际 </${tag}>`) }
    }
    if (stack.length > 400) break
  }
  if (stack.length) { tagProblems++; if (tagProblems <= 3) bad(`${id} 有未闭合标签`, stack.slice(-4).join(' > ')) }
}
if (!tagProblems) ok('12 屏的 HTML 标签全部配平')

/* ---------------- 6) 每屏内容是否真的渲染出来了 ---------------- */
/**
 * 这一步很关键：只检查"section 存在"是不够的 —— 之前 asUser 用错人，
 * P-05/P-08 的 section 照样在，但内容退化成参与者视图（拿不到签到码）。
 * 所以按屏抽查关键文案。
 */
const EXPECT = {
  p01: ['SportsBuddy', '登录', '注册'],
  p02: ['一句话找局', '为你找到', '信用分'],
  p03: ['活动列表', '全部项目', '只看还有空位'],
  p04: ['活动详情', '参与者', '立即报名'],
  p05: ['签到码', '记录考勤', '参与者'],       // 详情页：发起人视角有签到码与考勤入口
  p06: ['发起活动', '水平要求', '发布活动'],
  p07: ['方式一', '方式二', '确认签到'],
  p08: ['管理活动', '签到码', '确认考勤'],     // 管理页：签到码 + 到场勾选 + 提交
  p09: ['我的局', '我发起的', '我报名的'],
  p10: ['信用分', '收到的评价', '退出登录'],
  p11: ['个人主页', '收到的评价', '信用分'],
  p12: ['评价同场伙伴', '这次一起玩的体验', '提交评价'],
}
const chunks = html.split(/<section class="screen" id="(\w+)"/)
let contentBad = 0
for (let i = 1; i < chunks.length; i += 2) {
  const id = chunks[i]
  const body = chunks[i + 1] || ''
  const miss = (EXPECT[id] || []).filter((k) => !body.includes(k))
  if (miss.length || body.length < 1500) {
    contentBad++
    bad(`${id} 内容不完整`, `${body.length} 字符${miss.length ? '，缺少：' + miss.join('、') : ''}`)
  }
}
if (!contentBad) ok('12 屏内容均含关键文案（防止"有 section 但渲染成别的视图"）')

/* ---------------- 7) 关键交互钩子 ---------------- */
const checks = [
  ['hashchange 路由', /addEventListener\('hashchange'/.test(inlineScript)],
  ['初始 show() 启动', /show\(current\(\),\s*false\)/.test(inlineScript)],
  ['上一屏/下一屏', /data-nav/.test(html) && /ArrowRight/.test(inlineScript)],
  ['屏幕跳转菜单', /id="jumpMenu"/.test(html) && /btnJump/.test(html)],
  ['热区提示开关', /hotspots-on/.test(html) && /btnHotspots/.test(html)],
  ['非跳转动作有提示', /toast\(/.test(inlineScript)],
  ['移动端全屏适配', /@media \(max-width: 560px\)/.test(html)],
]
for (const [name, yes] of checks) (yes ? ok : bad)(`${name}`)

/* ---------------- 汇总 ---------------- */
console.log('\n' + '─'.repeat(64))
if (problems.length) {
  console.log(`\x1b[31m${problems.length} 项失败\x1b[0m`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log(`\x1b[32m全部通过：${pass} 项检查\x1b[0m`)
