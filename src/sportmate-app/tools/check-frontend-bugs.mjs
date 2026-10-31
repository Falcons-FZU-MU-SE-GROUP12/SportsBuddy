/**
 * 前端应用缺陷回归测试（对应作业四报告 A-1 / A-2）
 * ===========================================================================
 * 用浏览器环境替身在 Node 里跑真实的 api 层与页面模块，验证：
 *
 *   A-1  登录后 token 必须落盘，且紧接着的 getMe() 不能再返回 401
 *   A-2  路由参数必须透传给 create(params)，#/activity/101 不能变成 NaN
 *   A-2+ review 这类"两个参数"的路由不能丢 activityId（报告未提，一并修了）
 *
 * 之前 verify.mjs 没抓到这两个问题，是因为它自己手动调了 tokenStore.set()、
 * 也自己把 params 传进了 create()，等于把 bug 绕过去了。
 * 这个脚本刻意走"和页面一样的调用路径"。
 *
 * 用法：node tools/check-frontend-bugs.mjs
 */

import { installBrowserStub, enableHashEvents } from './browser-stub.mjs'

installBrowserStub({ useMock: true })
enableHashEvents()

const { api, tokenStore } = await import('../frontend/src/api/index.js')
const { parseHash, href } = await import('../frontend/src/store.js')

let pass = 0
const problems = []
const ok = (m, d) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${m}${d ? ` \x1b[90m${d}\x1b[0m` : ''}`) }
const bad = (m, d) => { problems.push(`${m}${d ? '：' + d : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${m}${d ? '：' + d : ''}`) }

console.log('A-1  登录 token 落盘\n')

tokenStore.clear()
const loginRes = await api.login('linhao', 'secret123')
ok('api.login() 返回 access_token', Boolean(loginRes.access_token), loginRes.access_token)

if (tokenStore.has()) ok('登录后 localStorage 里已有 token（不是"内存里有、存储里没有"）')
else bad('A-1 未修：tokenStore.has() 仍为 false，token 没有落盘')

// 关键：页面在 login 之后立刻调 getMe()，此时浏览器会自动带 Authorization 头
try {
  const me = await api.getMe()
  if (me && me.id) ok('登录后立即 getMe() 成功', `id=${me.id} nickname=${me.nickname}`)
  else bad('getMe() 返回空')
} catch (err) {
  bad('A-1 未修：登录后 getMe() 仍失败', `${err.status} ${err.message}`)
}

// 退出后必须清掉
await api.logout()
if (!tokenStore.has()) ok('logout() 清掉了本地 token')
else bad('logout 后 token 仍在')

console.log('\nA-2  路由参数透传\n')

// 1) hash 解析
const r1 = parseHash('#/activity/101')
if (r1.name === 'activity' && r1.params.id === '101') ok('parseHash("#/activity/101") → params.id = 101')
else bad('parseHash 结果不对', JSON.stringify(r1))

// 2) 用解析出来的参数创建页面（模拟 router: loader(route.params)）
await api.login('linhao', 'secret123')
const actMod = await import('../frontend/src/pages/activity.js')
const actPage = actMod.create(r1.params)
await actPage.load()
const actHtml = actPage.view()
if (actHtml.includes('周三晚篮球')) ok('create(params) 拿到 id，活动详情渲染成功（不再是 activities/NaN）')
else if (actHtml.includes('NaN') || actHtml.includes('活动不存在')) bad('A-2 未修：详情页仍拿不到活动', '渲染出 NaN / 不存在')
else bad('详情页内容异常')

// 3) 反证：不透传参数时会怎样（说明这个测试真的能抓到 bug）
const brokenPage = actMod.create()
await brokenPage.load()
const brokenHtml = brokenPage.view()
if (!brokenHtml.includes('周三晚篮球')) ok('反证：不传 params 时确实无法渲染详情（说明该断言有效）')
else bad('反证失败：不传 params 也能渲染，断言可能无效')

console.log('\nA-2+  review 双参数路由\n')

const r2 = parseHash('#/review/107')
if (r2.name === 'review' && r2.params.activityId === '107') ok('parseHash("#/review/107") → params.activityId = 107')
else bad('review 单参数解析错误', JSON.stringify(r2))

const r3 = parseHash('#/review/107/3')
if (r3.params.activityId === '107' && r3.params.userId === '3') ok('parseHash("#/review/107/3") → activityId=107 / userId=3')
else bad('review 双参数解析错误', JSON.stringify(r3))

const r4 = parseHash('#/review/107/')
if (r4.params.activityId === '107') ok('parseHash("#/review/107/") 末尾空段不再污染参数')
else bad('末尾斜杠仍导致参数错位', JSON.stringify(r4))

if (href('review', { activityId: 107 }) === '#/review/107') ok('href("review") 不再产生 #/review/undefined 或多余斜杠')
else bad('href("review") 生成错误', href('review', { activityId: 107 }))

// 真正渲染评价页
const revMod = await import('../frontend/src/pages/review.js')
const revPage = revMod.create(r3.params)
await revPage.load()
const revHtml = revPage.view()
if (revHtml.includes('昨天那场篮球')) ok('评价页用 activityId 渲染成功')
else bad('评价页渲染失败')

console.log('\n' + '─'.repeat(64))
if (problems.length) {
  console.log(`\x1b[31m${problems.length} 项失败\x1b[0m`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log(`\x1b[32m全部通过：${pass} 项检查\x1b[0m`)
