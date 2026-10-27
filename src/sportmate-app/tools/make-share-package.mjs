/**
 * 打包一个"别人双击就能打开"的分享包
 * ===========================================================================
 * 为什么不能直接把 prototype/ 整个压缩：里面有两页是用 ES Module 动态 import
 * 页面模块的（index.html / screens.html），用 file:// 双击打开会被浏览器拒绝，
 * 对方只会看到白屏。所以这里重新产出一份「纯静态」的包：
 *
 *   index.html                 总入口（纯静态，双击打开）
 *   01-mobile-prototype.html    12 屏可跳转原型（本来就能双击打开）
 *   02-screens-gallery.html    12 屏并排展板（从单文件原型里抽取，纯静态）
 *   03-wireframe.html          页面结构与跳转（CSS 已内联）
 *   04-class-diagram.html      领域类图（内联 SVG，导航改为包内相对链接）
 *   images/                    15 张 JPG
 *   README.txt                 使用说明
 *
 * 输出：share/SportsBuddy-prototype.zip
 * 用法：node tools/make-share-package.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SHARE = resolve(ROOT, 'share')
const PKG = join(SHARE, 'SportsBuddy-prototype')

/* --------------------------------------------------------------------- */
/* 0. 准备目录                                                            */
/* --------------------------------------------------------------------- */
rmSync(PKG, { recursive: true, force: true })
mkdirSync(join(PKG, 'images'), { recursive: true })

/* --------------------------------------------------------------------- */
/* 1. 从单文件原型里抽取 12 屏（带标记，抽取很稳）                          */
/* --------------------------------------------------------------------- */
const mobile = readFileSync(resolve(ROOT, 'prototype', 'mobile-prototype.html'), 'utf8')

/** 每屏：{ id, no, title, inner } */
function extractScreens(html) {
  const out = []
  const re =
    /<section class="screen" id="(\w+)" data-no="([^"]+)" data-title="([^"]+)">[\s\S]*?<!--SCREEN-START:\1-->([\s\S]*?)<!--SCREEN-END:\1-->/
  // 用 exec 逐个取（非全局的 match 只能拿第一个）
  const g = new RegExp(re.source, 'g')
  let m
  while ((m = g.exec(html))) {
    out.push({ id: m[1], no: m[2], title: m[3], inner: m[4].trim() })
  }
  return out
}

const screens = extractScreens(mobile)
if (screens.length !== 12) {
  console.error(`[中止] 期望抽出 12 屏，实际 ${screens.length} 屏`)
  process.exit(1)
}

const appCss = readFileSync(resolve(ROOT, 'frontend', 'assets', 'css', 'app.css'), 'utf8')
const galleryCss = readFileSync(resolve(ROOT, 'prototype', 'css', 'gallery.css'), 'utf8')

/** 各屏的简短说明（展板里当副标题） */
const NOTE = {
  p01: '登录 / 注册',
  p02: '一句话找局',
  p03: '筛选与分页',
  p04: '报名与签到',
  p05: '发起人视角',
  p06: '发起活动',
  p07: '签到码 / 定位',
  p08: '记录考勤',
  p09: '我发起的 / 我报名的',
  p10: '信用分与资料',
  p11: '评价与标签',
  p12: '星级与标签',
}

/* --------------------------------------------------------------------- */
/* 2. 12 屏并排展板（纯静态，双击可开）                                    */
/* --------------------------------------------------------------------- */
function buildGallery() {
  const cards = screens
    .map(
      (s) => `    <section class="smp-phone">
      <header class="smp-phone__cap">
        <span class="smp-phone__no">${s.no.replace('P-', '')}</span>
        <span>
          <span class="smp-phone__title">${s.title}</span>
          <span class="smp-phone__desc" style="display:block;margin:0">${NOTE[s.id] || ''}</span>
        </span>
      </header>
      <div class="smp-phone__body">
${s.inner}
      </div>
    </section>`
    )
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SportsBuddy · 12 屏界面原型</title>
<style>
${appCss.replace(/<\/style/gi, '<\\/style')}

${galleryCss}

/* 展板里每个手机框内部的修正（与单文件原型一致） */
.smp-phone__body { position: relative; }
.smp-phone__body .sm-tabbar { position: sticky; bottom: 0; z-index: 20; }
.smp-phone__body .sm-fab { position: absolute; right: 16px; bottom: 78px; }
.smp-phone__body .sm-main { padding-bottom: 96px; }
.smp-phone__body .sm-auth { min-height: 100%; }
</style>
</head>
<body class="smp">
<header class="smp-head"><div class="smp-head__wrap">
  <h1>SportsBuddy · 12 屏界面原型</h1>
  <p>
    12 个画面并排展示，覆盖后端全部 19 个接口。每屏都标注了编号与用途；
    想看"点着走"的版本，请打开 <a href="01-mobile-prototype.html" style="color:#ffb39a">01-mobile-prototype.html</a>。
  </p>
  <nav class="smp-nav">
    <a href="index.html">总入口</a>
    <a href="01-mobile-prototype.html">单屏可跳转原型</a>
    <a href="02-screens-gallery.html" aria-current="page">12 屏展板</a>
    <a href="03-wireframe.html">页面结构</a>
    <a href="04-class-diagram.html">类图</a>
  </nav>
</div></header>

<main class="smp-main">
  <div class="smp-grid">
${cards}
  </div>
</main>
<p class="smp-foot">示意数据仅用于演示，不代表真实用户信息。</p>
</body>
</html>
`
}

/* --------------------------------------------------------------------- */
/* 3. 页面结构图：把外链 CSS 内联                                          */
/* --------------------------------------------------------------------- */
function buildWireframe() {
  let html = readFileSync(resolve(ROOT, 'prototype', 'wireframe.html'), 'utf8')
  html = html.replace(
    /<link rel="stylesheet" href="\.\.\/frontend\/assets\/css\/app\.css" \/>/,
    `<style>\n${appCss}\n</style>`
  )
  html = html.replace(
    /<link rel="stylesheet" href="\.\/css\/gallery\.css" \/>/,
    `<style>\n${galleryCss}\n</style>`
  )
  // 导航改成包内相对链接
  html = html
    .replace(/href="\.\/index\.html"/g, 'href="index.html"')
    .replace(/href="\.\/screens\.html"/g, 'href="02-screens-gallery.html"')
    .replace(/href="\.\/wireframe\.html"/g, 'href="03-wireframe.html"')
    .replace(/href="\.\.\/docs\/diagrams\/class-diagram\.html"/g, 'href="04-class-diagram.html"')
    .replace(/<a href="\.\/mobile-prototype\.html">/g, '<a href="01-mobile-prototype.html">')
  return html
}

/* --------------------------------------------------------------------- */
/* 4. 类图：导航链接改成包内文件                                           */
/* --------------------------------------------------------------------- */
function buildClassDiagram() {
  let html = readFileSync(resolve(ROOT, 'docs', 'diagrams', 'class-diagram.html'), 'utf8')
  html = html
    .replace(/href="\.\.\/\.\.\/prototype\/index\.html"/g, 'href="index.html"')
    .replace(/href="\.\.\/\.\.\/prototype\/screens\.html"/g, 'href="02-screens-gallery.html"')
    .replace(/href="\.\.\/\.\.\/prototype\/mobile-prototype\.html"/g, 'href="01-mobile-prototype.html"')
    .replace(/href="\.\.\/\.\.\/prototype\/wireframe\.html"/g, 'href="03-wireframe.html"')
    .replace(/href="\.\/class-diagram\.html"/g, 'href="04-class-diagram.html"')
  return html
}

/* --------------------------------------------------------------------- */
/* 5. 总入口页                                                            */
/* --------------------------------------------------------------------- */
const INDEX = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SportsBuddy · 前端交付物</title>
<style>
  :root { --ink:#16181d; --ink2:#4a5060; --ink3:#7b8398; --brand:#ff6a3d; --line:#e5e8f0; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
         background:#eef1f7; color:var(--ink); line-height:1.65; }
  header { background:linear-gradient(135deg,#262a36,#3d4351); color:#fff; padding:34px 32px 28px; }
  header h1 { margin:0; font-size:26px; letter-spacing:-.02em; }
  header p { margin:10px 0 0; color:rgba(255,255,255,.72); font-size:13.5px; max-width:820px; }
  main { max-width:960px; margin:0 auto; padding:26px 32px 60px; }
  .card { display:block; text-decoration:none; color:inherit; background:#fff; border:1px solid var(--line);
          border-radius:16px; padding:20px 22px; margin-bottom:14px; transition:.15s; }
  .card:hover { border-color:#ffd0be; box-shadow:0 8px 24px rgba(24,28,40,.09); transform:translateY(-1px); }
  .card h2 { margin:0 0 6px; font-size:17px; }
  .card p { margin:0; color:var(--ink2); font-size:13.5px; }
  .badge { display:inline-block; font-size:11.5px; font-weight:700; color:#fff; background:var(--brand);
           border-radius:6px; padding:1px 8px; margin-right:8px; vertical-align:2px; }
  .tip { background:#fff9f5; border:1px solid #ffd9c9; border-radius:12px; padding:14px 18px;
         font-size:13px; color:#8a4a2a; margin-bottom:20px; }
  footer { max-width:960px; margin:0 auto; padding:0 32px 50px; color:var(--ink3); font-size:12.5px; }
</style>
</head>
<body>
<header>
  <h1>SportsBuddy · 校园运动组局</h1>
  <p>前端交付物。全部为纯静态页面，<b>双击即可打开</b>，不需要安装任何东西、不需要启动服务器。</p>
</header>
<main>
  <div class="tip">
    这份包可以直接解压后双击 <code>index.html</code>。
    如果从压缩包里直接双击、而没先解压，部分系统可能无法加载相对路径的文件——建议先全部解压。
  </div>

  <a class="card" href="01-mobile-prototype.html">
    <h2><span class="badge">推荐</span>移动端原型（12 屏可跳转）</h2>
    <p>像真机一样点着走：按钮会真的切到下一页，顶栏可翻屏 / 调出 12 屏目录 / 显示热区。手机上打开会铺满全屏。</p>
  </a>

  <a class="card" href="02-screens-gallery.html">
    <h2>12 屏并排展板</h2>
    <p>一眼看完 P-01 ~ P-12 的全部画面，适合评审、答辩时整体过一遍。</p>
  </a>

  <a class="card" href="03-wireframe.html">
    <h2>页面结构与跳转</h2>
    <p>信息架构图 + 路由表：12 个画面之间的层级关系与跳转路径。</p>
  </a>

  <a class="card" href="04-class-diagram.html">
    <h2>领域类图</h2>
    <p>依据后端接口契约绘制的 15 个类、20 条关系，可缩放查看，附类与关系清单表。</p>
  </a>

  <a class="card" href="images/prototype-overview.jpg">
    <h2>原型图（JPG）</h2>
    <p>12 张单屏图（<code>images/P-01.jpg</code> … <code>P-12.jpg</code>）+ 1 张总览 + 2 张类图，可直接插进 Word / PPT。</p>
  </a>
</main>
<footer>
  示意数据仅用于演示，不代表真实用户信息。 ·
  技术说明见交付目录里的 README（本项目为零依赖实现，无需 npm install）。
</footer>
</body>
</html>
`

const README = `SportsBuddy · 前端交付物（原型包）
================================================

【怎么打开】
  1. 先把整个压缩包解压到一个文件夹（不要直接在压缩包里双击）
  2. 双击 index.html
  3. 浏览器打开后，从总入口点进各个页面

  全部是纯静态页面，不需要安装 Node / Python，也不需要开服务器。
  推荐用 Chrome / Edge / Firefox 较新版本。


【里面有什么】
  index.html                 总入口
  01-mobile-prototype.html   ★ 移动端原型：12 屏，按钮可跳转
  02-screens-gallery.html    12 屏并排展板
  03-wireframe.html          页面结构与跳转（信息架构图）
  04-class-diagram.html      领域类图（15 个类 / 20 条关系）
  images/                    15 张 JPG（12 屏 + 总览 + 2 张类图）
  README.txt                 本文件


【01 移动端原型怎么玩】
  · 点页面里的按钮会真的跳到对应画面
  · 顶栏（电脑上才有）：上一屏 / 下一屏 / 全部 12 屏 / 显示热区
  · 地址栏会带 #p04 这样的片段，可以直接分享某一屏
  · 手机上打开会自动铺满全屏


【已知限制（请如实转告）】
  · 界面里的数据是内置的示意数据，不是真实用户信息
  · 原型只演示交互流程，不连后端、不保存任何改动
  · 需要接口的动作（报名、签到、提交等）在原型里只给提示，不会真的提交


【想看能连后端的真实应用？】
  那需要启动本地服务器（浏览器禁止 file:// 加载模块）：
      node tools/server.mjs
  这不是本包的目的，本包只保证"双击就能看"。
`

/* --------------------------------------------------------------------- */
/* 6. 写文件                                                              */
/* --------------------------------------------------------------------- */
writeFileSync(join(PKG, 'index.html'), INDEX, 'utf8')
writeFileSync(join(PKG, '01-mobile-prototype.html'), mobile, 'utf8')
writeFileSync(join(PKG, '02-screens-gallery.html'), buildGallery(), 'utf8')
writeFileSync(join(PKG, '03-wireframe.html'), buildWireframe(), 'utf8')
writeFileSync(join(PKG, '04-class-diagram.html'), buildClassDiagram(), 'utf8')
writeFileSync(join(PKG, 'README.txt'), README, 'utf8')

/* 图片：统一改成 ASCII 文件名，避免别人解压后文件名乱码 */
const IMG_MAP = []
for (const dir of ['prototype-jpg', 'class-diagram-jpg']) {
  const src = join(ROOT, 'out', dir)
  if (!statSync(src, { throwIfNoEntry: false })?.isDirectory()) continue
  for (const name of readdirSync(src)) {
    if (!/\.jpe?g$/i.test(name)) continue
    const m = name.match(/^(P-\d{2})/)
    let dst
    if (name.startsWith('00-')) dst = 'prototype-overview.jpg'
    else if (m) dst = `${m[1]}.jpg`
    else if (name.includes('插入文档')) dst = 'class-diagram-doc.jpg'
    else dst = 'class-diagram.jpg'
    copyFileSync(join(src, name), join(PKG, 'images', dst))
    IMG_MAP.push({ from: name, to: dst })
  }
}

console.log('分享包已生成：')
console.log(`  share/SportsBuddy-prototype/`)
console.log(`    index.html                 总入口`)
console.log(`    01-mobile-prototype.html   ${(statSync(join(PKG, '01-mobile-prototype.html')).size / 1024).toFixed(0)} KB`)
console.log(`    02-screens-gallery.html    ${(statSync(join(PKG, '02-screens-gallery.html')).size / 1024).toFixed(0)} KB`)
console.log(`    03-wireframe.html          ${(statSync(join(PKG, '03-wireframe.html')).size / 1024).toFixed(0)} KB`)
console.log(`    04-class-diagram.html      ${(statSync(join(PKG, '04-class-diagram.html')).size / 1024).toFixed(0)} KB`)
console.log(`    images/                    ${IMG_MAP.length} 张`)
console.log(`    README.txt`)

/* --------------------------------------------------------------------- */
/* 7. 打 zip                                                              */
/* --------------------------------------------------------------------- */
const zipPath = join(SHARE, 'SportsBuddy-prototype.zip')
rmSync(zipPath, { force: true })
try {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${PKG}' -DestinationPath '${zipPath}' -CompressionLevel Optimal -Force`,
    ],
    { stdio: 'inherit' }
  )
  console.log(`\n已打包：share/SportsBuddy-prototype.zip（${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB）`)
} catch (err) {
  console.log(`\n[提示] 自动打 zip 失败（${err.message}），可以手动压缩目录：share/SportsBuddy-prototype/`)
}
