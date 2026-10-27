/**
 * 把本工程上传到 GitHub 仓库的 src/frontend/ 下
 * ===========================================================================
 * 为什么不用 git push：
 *   这台机器的沙盒挡住了 Windows 的 TLS 凭证库（schannel SEC_E_NO_CREDENTIALS），
 *   git / curl / PowerShell 发 HTTPS 全部失败；只有 Node 自带的 OpenSSL 能通。
 *   所以这里改用 GitHub REST API 的 Git Data 接口：一次性建 blobs → tree → commit
 *   → 更新 ref，是**一个原子提交**，不会在仓库里留下中间状态。
 *
 * 用法（token 只从环境变量读，不落盘、不进日志）：
 *   $env:GITHUB_TOKEN = 'ghp_xxx'
 *   node tools/upload-to-github.mjs --check     # 体检 token：类型 / 身份 / 权限，绝不写入
 *   node tools/upload-to-github.mjs --dry-run   # 空跑：列文件、算哈希，不写入
 *   node tools/upload-to-github.mjs             # 提交到 upstream
 *   node tools/upload-to-github.mjs --to-fork   # 提交到自己的 fork（没有 upstream 写权限时用）
 *   node tools/upload-to-github.mjs --to-fork --pr   # 提交到 fork 并自动开 Pull Request
 *
 * 没有仓库写权限时的完整流程（不需要任何人授权）：
 *   1) 在 GitHub 网页上把 SportsBuddy fork 到自己账号（一次点击）
 *   2) node tools/upload-to-github.mjs --to-fork --pr
 *   3) 等仓库管理员 review 合并
 *
 * 可选参数：
 *   --owner=      默认 Falcons-FZU-MU-SE-GROUP12（--to-fork 时默认取当前登录用户）
 *   --repo=       默认 SportsBuddy
 *   --branch=     默认 main
 *   --prefix=     默认 src/frontend
 *   --baseOwner=  fork 模式下 PR 的目标仓库所有者（默认 Falcons-FZU-MU-SE-GROUP12）
 *   --baseRepo=   fork 模式下 PR 的目标仓库名（默认 SportsBuddy）
 *   --baseBranch= fork 模式下 PR 的目标分支（默认 main）
 *   --include-jpg 把 out/prototype-jpg 下的原型图一起上传
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, relative, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

/* ============================ 参数 ============================ */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const TO_FORK = argv.includes('--to-fork')
const OPEN_PR = argv.includes('--pr')
const UPSTREAM_OWNER = flag('baseOwner', 'Falcons-FZU-MU-SE-GROUP12')
const UPSTREAM_REPO = flag('baseRepo', 'SportsBuddy')
const UPSTREAM_BRANCH = flag('baseBranch', 'main')

/** 默认目标是 upstream；--to-fork 时改成"你的 fork"（owner 稍后由 /user 得到） */
const OWNER = flag('owner', TO_FORK ? '' : UPSTREAM_OWNER)
const REPO = flag('repo', UPSTREAM_REPO)
const BRANCH = flag('branch', 'main')
const PREFIX = flag('prefix', 'src/frontend').replace(/^\/+|\/+$/g, '')
const DRY = argv.includes('--dry-run')
/** 是否把 out/prototype-jpg 里的原型图一起上传 */
const INCLUDE_JPG = argv.includes('--include-jpg')

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const UPSTREAM_API = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}`
/** 目标仓库 API 基址；--to-fork 时在拿到用户名后会被改写 */
let API = `https://api.github.com/repos/${OWNER || UPSTREAM_OWNER}/${REPO}`

/* 仓库的 .gitignore 规则（照着来，避免把不该传的东西传上去） */
const IGNORE = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)~\$/,                    // Office 临时文件
  /\.tmp$/,
  /(^|\/)\.idea(\/|$)/,
  /(^|\/)\.vscode(\/|$)/,
  /\.iml$/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)dist(\/|$)/,
  /(^|\/)build(\/|$)/,
  /(^|\/)__pycache__(\/|$)/,
  /\.pyc$/,
  /(^|\/)target(\/|$)/,
  /\.class$/,
]

/* ============================ 收集文件 ============================ */

/**
 * 递归列出要上传的文件。
 *
 * 默认跳过 out/（那是 render-prototype-jpg.py 生成的产物）。
 * 加 --include-jpg 时，把 out/prototype-jpg 下的 JPG 一起带上，
 * 并在仓库里放到 ${PREFIX}/prototype-jpg/ —— 不放进 out/ 是为了避开
 * .gitignore 里通用的 build 产物直觉，让队友一眼能找到"原型图"。
 */
function collect() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const rel = relative(ROOT, full).split(sep).join('/')
      if (IGNORE.some((re) => re.test(rel))) continue
      // out/ 里的 JPG 单独处理，避免出现 out/prototype-jpg 这种重复层级
      if (rel === 'out' || rel.startsWith('out/')) continue
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isFile()) {
        const buf = readFileSync(full)
        out.push({
          local: full,
          repoPath: `${PREFIX}/${rel}`,
          size: buf.length,
          sha: createHash('sha1').update(buf).digest('hex'),
          buf,
        })
      }
    }
  }
  walk(ROOT)

  if (INCLUDE_JPG) {
    const dir = join(ROOT, 'out', 'prototype-jpg')
    if (existsSync(dir)) {
      for (const name of readdirSync(dir).sort()) {
        if (!/\.jpe?g$/i.test(name)) continue
        const full = join(dir, name)
        if (!statSync(full).isFile()) continue
        const buf = readFileSync(full)
        out.push({
          local: full,
          repoPath: `${PREFIX}/prototype-jpg/${name}`,
          size: buf.length,
          sha: createHash('sha1').update(buf).digest('hex'),
          buf,
        })
      }
    }
  }
  return out.sort((a, b) => a.repoPath.localeCompare(b.repoPath))
}

/* ============================ GitHub API ============================ */

async function api(path, { method = 'GET', body, allow404 = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'User-Agent': 'sportsbuddy-uploader',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    if (allow404 && res.status === 404) return null
    const msg = json?.message ?? text.slice(0, 300)
    const err = new Error(`HTTP ${res.status} ${method} ${path} → ${msg}`)
    err.status = res.status
    err.details = json?.errors
    // 组织仓库里"没有写权限"在 Git Data 接口上表现为 404（不是 403），
    // 这里把常见原因直接翻译出来，省得对着一句 Not Found 发呆。
    if (res.status === 404 && method !== 'GET') {
      err.hint =
        'GitHub 对"无写权限"的写操作会返回 404（而不是 403）。\n' +
        '        可能原因：① 你的账号对该仓库只有 Read 权限；\n' +
        '                  ② token 缺少 repo / Contents 写权限；\n' +
        '                  ③ 仓库名或分支名写错。\n' +
        '        没有仓库写权限时，用 fork + PR 的方式提交：\n' +
        '          node tools/upload-to-github.mjs --to-fork --pr'
    }
    throw err
  }
  return json
}

/** 直接请求一个完整 URL（用于 /user、/orgs 等不在仓库路径下的接口）。 */
async function apiUrl(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'sportsbuddy-uploader',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const err = new Error(
      `HTTP ${res.status} ${method} ${url} → ${json?.message ?? text.slice(0, 200)}`
    )
    err.status = res.status
    throw err
  }
  return json
}

/* ============================ 主流程 ============================ */

const files = collect()
const totalBytes = files.reduce((sum, f) => sum + f.size, 0)

console.log('='.repeat(72))
console.log(`仓库      ${OWNER || '(当前登录用户)'}/${REPO}  分支 ${BRANCH}`)
console.log(`目标目录  ${PREFIX}/`)
console.log(`文件数量  ${files.length}`)
console.log(`总大小    ${(totalBytes / 1024).toFixed(1)} KB`)
console.log(`模式      ${DRY ? '空跑（不会写入仓库）' : '正式提交（单个原子 commit）'}`)
console.log(`原型图    ${INCLUDE_JPG ? '一起上传（prototype-jpg/）' : '本次不含（加 --include-jpg 可带上）'}`)
console.log('='.repeat(72))

console.log('\n将要上传的文件：')
for (const f of files) {
  console.log(`  ${String(f.size).padStart(7)} B  ${f.sha.slice(0, 8)}  ${f.repoPath}`)
}

// 敏感信息兜底：万一以后有人往目录里放了 token，这里挡住
const SECRET = /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}/
const leaky = files.filter((f) => SECRET.test(f.buf.toString('utf8')))
if (leaky.length) {
  console.error('\n[中止] 检测到疑似凭据内容，拒绝上传：')
  for (const f of leaky) console.error(`  · ${f.repoPath}`)
  process.exit(1)
}

if (DRY) {
  console.log('\n空跑结束。要做真实提交，请设置 GITHUB_TOKEN 后去掉 --dry-run。')
  process.exit(0)
}

if (!TOKEN) {
  console.error('\n[中止] 没有找到 GITHUB_TOKEN 环境变量。')
  console.error("  PowerShell:  $env:GITHUB_TOKEN = 'ghp_xxx'")
  console.error('  然后重跑：   node tools/upload-to-github.mjs')
  process.exit(1)
}

/* ---------------------------------------------------------------------------
 * --check：只体检 token，不写任何东西。
 * 用来快速区分"token 类型不对 / 权限没给 / 不是组织成员"这几种情况。
 * ------------------------------------------------------------------------- */
if (argv.includes('--check')) {
  console.log('\n仅体检模式：不会向仓库写入任何内容\n')

  const who = await apiUrl('https://api.github.com/user').catch(() => null)
  console.log(`身份             ${who?.login ?? '(读取失败，token 可能无效或已过期)'}`)

  // 先用原始请求拿到响应头，才能判断是 classic 还是 fine-grained
  const target = API
  const raw = await fetch(target, {
    headers: { 'User-Agent': 'sportsbuddy-uploader', Authorization: `Bearer ${TOKEN}` },
  })
  const scopes = raw.headers.get('x-oauth-scopes')
  console.log(`token 类型       ${scopes !== null ? 'classic（经典）' : 'fine-grained（细粒度）'}`)
  if (scopes !== null) console.log(`授予的 scope     ${scopes || '(空)'}`)

  const repoRes = await fetch(target, {
    headers: {
      'User-Agent': 'sportsbuddy-uploader',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
    },
  })
  if (repoRes.status === 404) {
    console.log('仓库可见性       404 —— 这个 token 看不到该仓库')
    console.log('                 若用的是 fine-grained token，多半是组织没有放行细粒度 token')
  } else if (repoRes.ok) {
    const repo = await repoRes.json()
    console.log(`仓库             ${repo.full_name}（owner 类型 ${repo.owner?.type}）`)
    console.log(`权限             ${JSON.stringify(repo.permissions)}`)
    console.log(
      `写权限           ${repo.permissions?.push || repo.permissions?.admin ? '有 ✓' : '无 ✗ ← 不能直接提交，需要走 fork + PR'}`
    )
  } else {
    console.log(`仓库             HTTP ${repoRes.status}`)
  }

  // 直接试探一次写操作：GitHub 对无权限的写返回 404，比 permissions 字段更可信
  console.log('\n写权限实测（创建一个临时 blob，不改变仓库内容）…')
  const probe = await fetch(`${target}/git/blobs`, {
    method: 'POST',
    headers: {
      'User-Agent': 'sportsbuddy-uploader',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'cGluZw==', encoding: 'base64' }),
  })
  console.log(
    probe.status === 201
      ? '                 可以写入 ✓（这个临时 blob 不会被任何 commit 引用，不影响仓库）'
      : `                 不能写入 ✗（HTTP ${probe.status}）`
  )

  console.log('\n体检结束。结论：')
  if (probe.status === 201) {
    console.log('  可以直接提交：node tools/upload-to-github.mjs')
  } else {
    console.log('  没有 upstream 写权限，用 fork + PR 的方式（不需要任何人授权）：')
    console.log('    1) 在 GitHub 网页上把 SportsBuddy fork 到自己账号，或直接执行下面这条（会自动建 fork）')
    console.log('    2) node tools/upload-to-github.mjs --to-fork --pr')
  }
  process.exit(0)
}

console.log('\n[1/6] 校验 token 与写权限…')
const me = await apiUrl('https://api.github.com/user').catch(() => null)
console.log(`      token 身份：${me?.login ?? '(未能读取，token 可能无效或已过期)'}`)

/* ---------------- fork 模式：先定位或创建自己的 fork ---------------- */
let TARGET_OWNER = OWNER || me?.login
if (TO_FORK) {
  if (!me?.login) {
    console.error('\n[中止] fork 模式需要先知道你的用户名，但读取 /user 失败（token 无效？）。')
    process.exit(1)
  }
  TARGET_OWNER = flag('owner', me.login)

  // 读 upstream 的默认分支，fork 出来的仓库会继承同样的内容
  const up = await apiUrl(UPSTREAM_API)
  console.log(`      upstream：${up.full_name}（默认分支 ${up.default_branch}）`)

  let fork = await apiUrl(
    `https://api.github.com/repos/${TARGET_OWNER}/${UPSTREAM_REPO}`,
    {}
  ).catch(() => null)
  if (!fork) {
    console.log(`      未找到 ${TARGET_OWNER}/${UPSTREAM_REPO}，正在创建 fork…`)
    await apiUrl(`${UPSTREAM_API}/forks`, { method: 'POST', body: {} })
    // fork 是异步的，轮询等它出现（最多约 60 秒）
    for (let i = 0; i < 30 && !fork; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      fork = await apiUrl(
        `https://api.github.com/repos/${TARGET_OWNER}/${UPSTREAM_REPO}`,
        {}
      ).catch(() => null)
      process.stdout.write(`\r      等待 fork 就绪… ${i + 1}`)
    }
    console.log('')
  }
  if (!fork) {
    console.error(`\n[中止] fork 创建后仍读不到 ${TARGET_OWNER}/${UPSTREAM_REPO}，请稍后重试。`)
    process.exit(1)
  }
  console.log(`      目标仓库（你的 fork）：${fork.full_name}`)
  API = `https://api.github.com/repos/${TARGET_OWNER}/${UPSTREAM_REPO}`
}
console.log(`      目标仓库：${TARGET_OWNER}/${REPO}${TO_FORK ? '（fork）' : ''}`)

const repo = await api('')
console.log(`      仓库读权限：已确认（${repo.full_name}，默认分支 ${repo.default_branch}）`)
if (!repo.permissions?.push && !repo.permissions?.admin) {
  console.error(`\n[中止] 当前 token 对 ${TARGET_OWNER}/${REPO} 没有写权限。`)
  console.error(`      接口返回的 permissions = ${JSON.stringify(repo.permissions)}`)
  console.error('')
  if (!TO_FORK) {
    console.error('  三种对策（按省事程度）：')
    console.error('    1) 自己没有 upstream 写权限时，走 fork + PR（不需要任何人授权）：')
    console.error('         node tools/upload-to-github.mjs --to-fork --pr')
    console.error('    2) 让仓库管理员给你 Write 权限：')
    console.error(`         仓库 Settings → Collaborators and teams → 添加 ${me?.login ?? '你'} 为 Write`)
    console.error('    3) 组织仓库用 fine-grained token 时，需要组织先放行：')
    console.error('         组织 Settings → Third-party Access → Personal access tokens → 允许')
  } else {
    console.error('  fork 通常自带写权限，出现这个提示一般是 token 缺 repo / Contents 写权限。')
  }
  process.exit(1)
}
console.log('      仓库写权限：已确认 ✓')

console.log(`[2/6] 读取 ${BRANCH} 当前状态…`)
const ref = await api(`/git/ref/heads/${BRANCH}`)
const baseCommitSha = ref.object.sha
const baseCommit = await api(`/git/commits/${baseCommitSha}`)
const baseTreeSha = baseCommit.tree.sha
console.log(`      父提交 ${baseCommitSha.slice(0, 8)}  tree ${baseTreeSha.slice(0, 8)}`)

console.log(`[3/6] 创建 ${files.length} 个 blob…`)
const treeEntries = []
for (const f of files) {
  const blob = await api('/git/blobs', {
    method: 'POST',
    body: { content: f.buf.toString('base64'), encoding: 'base64' },
  })
  // base_tree 已经保留原有内容，所以这里只写"新增/覆盖"的条目
  treeEntries.push({ path: f.repoPath, mode: '100644', type: 'blob', sha: blob.sha })
  process.stdout.write(
    `\r      ${treeEntries.length}/${files.length} ${f.repoPath.slice(0, 52).padEnd(52)}`
  )
}
console.log('')

// src/.gitkeep 只是占位；src/ 里已经有真实内容了，顺手删掉
const gitkeep = await api('/contents/src/.gitkeep', { allow404: true })
if (gitkeep) {
  treeEntries.push({ path: 'src/.gitkeep', mode: '100644', type: 'blob', sha: null })
  console.log('      将同时删除占位文件 src/.gitkeep（src/ 已有真实内容）')
}

console.log('[4/6] 创建 tree…')
const tree = await api('/git/trees', {
  method: 'POST',
  body: { base_tree: baseTreeSha, tree: treeEntries },
})
console.log(`      tree ${tree.sha.slice(0, 8)}（新增/覆盖 ${treeEntries.length} 项）`)

const message = `feat(frontend): add SportsBuddy web app, domain class diagram and interactive UI prototype

在 src/frontend/ 下新增前端完整交付物，依据后端接口契约（19 个接口）实现：

- frontend/   零依赖前端应用：11 个页面，覆盖全部 19 个接口，无需 npm install
- docs/       领域类图：15 个类、20 条关系（Mermaid 源文件 + 渲染 SVG + 查看页）
- prototype/  可交互界面原型：12 个画面并排，与实现同源（直接复用页面模块）
- tools/      自检脚本：19 接口调用、业务规则、页面渲染、时区共 99 项检查

同时移除 src/.gitkeep 占位文件（src/ 已有真实内容）。
`

console.log('[5/6] 创建 commit…')
const commit = await api('/git/commits', {
  method: 'POST',
  body: { message, tree: tree.sha, parents: [baseCommitSha] },
})
console.log(`      commit ${commit.sha.slice(0, 8)}`)

console.log(`[6/6] 更新 ref heads/${BRANCH}…`)
const updated = await api(`/git/refs/heads/${BRANCH}`, {
  method: 'PATCH',
  body: { sha: commit.sha, force: false },
})
console.log(`      分支已指向 ${updated.object.sha.slice(0, 8)}`)

const repoFull = `${TARGET_OWNER}/${REPO}`

/* ---------------- fork 模式：顺手开一个 Pull Request ---------------- */
let prUrl = null
if (TO_FORK && OPEN_PR) {
  console.log('\n[附加] 创建 Pull Request…')
  const head = `${TARGET_OWNER}:${BRANCH}`
  try {
    const pr = await apiUrl(`${UPSTREAM_API}/pulls`, {
      method: 'POST',
      body: {
        title: 'feat(frontend): 新增前端应用、领域类图与可交互界面原型',
        head,
        base: UPSTREAM_BRANCH,
        body: [
          '## 这个 PR 做了什么',
          '',
          '在 `src/frontend/` 下新增前端完整交付物，依据后端接口契约（19 个接口）实现，**零安装**（无需 npm install、无构建步骤）：',
          '',
          '| 目录 | 内容 |',
          '|---|---|',
          '| `frontend/` | 11 个页面，覆盖全部 19 个接口，默认用内置离线数据 |',
          '| `docs/` | 领域类图：15 个类、20 条关系（Mermaid 源文件 + SVG + 查看页） |',
          '| `prototype/` | 可交互界面原型：12 个画面并排，与实现同源 |',
          '| `tools/` | 自检脚本：99 项检查（接口 / 业务规则 / 页面渲染 / 时区） |',
          '',
          '## 怎么看效果',
          '',
          '```bash',
          'node src/frontend/tools/server.mjs',
          '# 打开 http://127.0.0.1:5178/src/frontend/frontend/',
          '```',
          '',
          '## 验证情况',
          '',
          '- `node tools/verify.mjs` → 99 项全部通过',
          '- `python tools/check-class-diagram.py` → 类图几何校验 5 项通过',
          '- `node tools/check-links.mjs` → 5 个入口页面引用全部可达（根路径与子路径两种部署形态都验过）',
          '',
          '> 说明：本机无外网且沙盒禁止无头浏览器，因此未与真实后端联调、也没有截图；',
          '> 所有接口路径、参数、字段、状态码均逐条对照《前端对接文档》编写。',
        ].join('\n'),
      },
    })
    prUrl = pr.html_url
    console.log(`      PR 已创建：#${pr.number}`)
  } catch (err) {
    // 常见情况：同名 PR 已存在
    console.log(`      未能创建 PR：${err.message}`)
    if (err.status === 422) {
      console.log('      同名分支的 PR 可能已经存在，直接去看：')
      console.log(
        `      https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls?q=is%3Apr+head%3A${TARGET_OWNER}%3A${BRANCH}`
      )
    }
  }
}

console.log('\n' + '='.repeat(72))
console.log('上传完成')
console.log(`  目标仓库：${repoFull}${TO_FORK ? '（你的 fork）' : ''}`)
console.log(`  提交：https://github.com/${repoFull}/commit/${commit.sha}`)
console.log(`  目录：https://github.com/${repoFull}/tree/${BRANCH}/${PREFIX}`)
if (prUrl) console.log(`  PR  ：${prUrl}`)
if (TO_FORK && !OPEN_PR) {
  console.log('')
  console.log('  下一步：到 GitHub 上开 Pull Request，或重跑并加 --pr 让脚本自动开：')
  console.log(
    `    https://github.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/compare/${UPSTREAM_BRANCH}...${TARGET_OWNER}:${BRANCH}`
  )
}
console.log('='.repeat(72))
