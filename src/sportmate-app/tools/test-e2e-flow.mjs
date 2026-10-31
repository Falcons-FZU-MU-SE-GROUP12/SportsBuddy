/**
 * 端到端流程测试（End-to-End）
 * ===========================================================================
 * 前面几个脚本是"点"上的检查（接口、规则、渲染、CSS 断言）。
 * 这个脚本做"线"上的检查：把一个真实用户的操作顺序完整走一遍，
 * 每一步都用**页面模块自己的 view()/actions**，串起来看会不会断。
 *
 * 之所以要它：A-1（token 没落盘）和 A-2（参数没透传）都是"每个零件单独测都过，
 * 一串起来就坏"的类型。流程测试正是为这类问题准备的。
 *
 * 覆盖的用户旅程：
 *   登录 → 首页一句话找局 → 活动列表筛选 → 活动详情 → 报名 → 我的局
 *   → 签到（签到码）→ 评价同场伙伴 → 我的（信用分）
 *   以及三条错误路径：满员报名、信用分不足、重复签到
 *
 * 用法：node tools/test-e2e-flow.mjs
 */

import { installBrowserStub, enableHashEvents } from './browser-stub.mjs'

installBrowserStub({ useMock: true })
enableHashEvents()

const { api, tokenStore } = await import('../frontend/src/api/index.js')
const { resetMock } = await import('../frontend/src/api/mock.js')
const { parseHash } = await import('../frontend/src/store.js')
const { loadSports, setSession, store } = await import('../frontend/src/store.js')

let pass = 0
const problems = []
const ok = (step, m) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${step.padEnd(22)} ${m}`) }
const bad = (step, m, d) => {
  problems.push(`${step} ${m}${d ? '：' + d : ''}`)
  console.log(`  \x1b[31m✗\x1b[0m ${step.padEnd(22)} ${m}${d ? '：' + d : ''}`)
}

/** 断言渲染结果里包含某段文字 */
function expectText(step, html, needle, label) {
  if (html.includes(needle)) ok(step, label || `渲染出「${needle}」`)
  else bad(step, label || `缺少「${needle}」`, html.slice(0, 120).replace(/\s+/g, ' '))
}

/** 页面实例：与 router 一致 —— loader(params) → create(params) → load() */
async function openPage(name, params = {}) {
  const mod = await import(`../frontend/src/pages/${name}.js`)
  const page = mod.create(params)
  if (page.load) await page.load()
  return page
}

/** 构造 action 上下文（与 shared/ui.js 里一致） */
function ctx(data = {}, form = {}) {
  return { data, form, el: null, root: null, rerender: () => {} }
}

console.log('端到端流程：登录 → 找局 → 报名 → 签到 → 评价\n')
console.log('— 第 1 段：登录 —')

resetMock()
tokenStore.clear()
setSession(null)
store.sports = []
await loadSports()

// 1. 登录页（游客态）
const loginPage = await openPage('login')
expectText('1 打开登录页', loginPage.view(), 'SportsBuddy', '登录页渲染出品牌名')

// 2. 真实登录：走 api + 落盘，与页面的 submit 一致
await api.login('linhao', 'secret123')
if (tokenStore.has()) ok('2 登录', 'token 已落盘')
else bad('2 登录', 'token 未落盘')

const me = await api.getMe()
setSession(me)
if (me.id === 1) ok('3 取自己资料', `getMe 成功：${me.nickname}（信用分 ${me.reliability_score}）`)
else bad('3 取自己资料', 'getMe 返回异常')

console.log('\n— 第 2 段：找局 —')

// 4. 首页 + 一句话找局
const discover = await openPage('discover')
expectText('4 首页', discover.view(), '一句话找局')
await discover.actions.match(ctx({}, { sentence: '今晚想在旗山校区打篮球，新手可以吗' }))
const discoverAfter = discover.view()
if (discoverAfter.includes('为你找到') && discoverAfter.includes('周三晚篮球')) {
  ok('5 一句话找局', '解析并推荐出篮球活动')
} else {
  bad('5 一句话找局', '没有推荐结果')
}

// 5. 活动列表 + 筛选
const activities = await openPage('activities')
// 标题在 appBar 里，不在 view() 里（页面 shell = appBar + body）
expectText('6 活动列表', `${activities.appBar?.() ?? ''}${activities.view()}`, '活动列表')

// 默认筛选是「可报名 + 只看有空位」，而羽毛球的唯一一场是满员的，所以先放开这两个条件
await activities.actions['toggle-available']() // 关掉「只看还有空位」
await activities.actions.filter(ctx({ name: 'status', value: '' })) // 不限状态
await activities.actions.filter(ctx({ name: 'sport', value: '羽毛球' }))
const listFiltered = activities.view()
if (listFiltered.includes('羽毛球双打') && !listFiltered.includes('晨跑 5 公里')) {
  ok('7 按项目筛选', '只剩羽毛球活动')
} else {
  bad('7 按项目筛选', '筛选结果不对')
}

// 再验证「只看有空位」真的会把满员活动挡掉（这是规则，不是 bug）
await activities.actions.reset()
await activities.actions.filter(ctx({ name: 'sport', value: '羽毛球' }))
if (!activities.view().includes('羽毛球双打')) ok('7b 满员过滤', '默认「只看有空位」时满员活动被挡掉')
else bad('7b 满员过滤', '满员活动仍然出现')

console.log('\n— 第 3 段：详情与报名 —')

// 6. 详情页：用 parseHash 的结果创建（模拟 router）
const route = parseHash('#/activity/101')
if (route.params.id === '101') ok('8 解析地址', '#/activity/101 → id=101')
else bad('8 解析地址', JSON.stringify(route.params))

const detail101 = await openPage('activity', route.params)
expectText('9 活动详情', detail101.view(), '周三晚篮球')

// 7. 报名一场没报过的活动（105）
await activities.actions.join(ctx({ id: '105' }))
const detail105 = await openPage('activity', { id: '105' })
const v105 = detail105.view()
if (v105.includes('我的参与状态')) ok('10 报名', '报名 105 后详情页出现「我的参与状态」')
else bad('10 报名', '报名后状态没变')

// 8. 我的局
const manage = await openPage('manage')
const vManage = manage.view()
if (vManage.includes('我发起的') && vManage.includes('我报名的')) ok('11 我的局', '两个分组都在')
else bad('11 我的局', '缺少分组')

console.log('\n— 第 4 段：签到 —')

const checkin = await openPage('checkin', { id: '109' })
expectText('12 签到页', checkin.view(), '方式一')

// 先走错误路径：签到码错 → 403
// ⚠️ 顺序很重要：必须在成功签到之前测，否则会被 409「你已经签到过了」挡掉
try {
  await api.checkinWithCode(109, '0000')
  bad('13 签到码错误', '竟然成功了（应该 403）')
} catch (err) {
  if (err.status === 403) ok('13 签到码错误', `被拒绝：${err.message}`)
  else bad('13 签到码错误', `状态码 ${err.status}`)
}

await checkin.actions.code(ctx({}, { code: '5521' }))
const vCheckin = checkin.view()
if (vCheckin.includes('签到成功')) ok('14 签到码签到', '签到成功，进入结果页')
else bad('14 签到码签到', '未出现成功页')

console.log('\n— 第 5 段：评价 —')

const review = await openPage('review', { activityId: '107' })
// 同样：标题在 appBar 里
expectText('15 评价页', `${review.appBar?.() ?? ''}${review.view()}`, '评价同场伙伴')
await review.actions.star(ctx({ user: '3', score: '5' }))
await review.actions.tag(ctx({ user: '3', value: '准时' }))
await review.actions.submit(ctx({ user: '3' }, { comment: '很准时，配合也好。' }))
const vReview = review.view()
if (vReview.includes('已评价')) ok('16 提交评价', '该同学显示「已评价」')
else bad('16 提交评价', '提交后状态没变')

// 9. 我的
const mePage = await openPage('me')
expectText('17 我的', mePage.view(), '信用分')

console.log('\n— 第 6 段：错误路径（用户会遇到的坑）—')

// 满员
try {
  await api.joinActivity(103, '')
  bad('18 满员报名', '竟然成功了（应该 409）')
} catch (err) {
  if (err.status === 409) ok('18 满员报名', `被拒绝：${err.message}`)
  else bad('18 满员报名', `状态码 ${err.status}`)
}

// 信用分不足（用户 8 高飞，58 分）
const lowUser = 'mock-token-8'
tokenStore.set(lowUser)
setSession(await api.getMe())
try {
  await api.joinActivity(105, '')
  bad('19 信用分不足', '竟然成功了（应该 403）')
} catch (err) {
  if (err.status === 403) ok('19 信用分不足', `被拒绝：${err.message}`)
  else bad('19 信用分不足', `状态码 ${err.status}`)
}

// 重复签到（第 14 步已经签到过 109）
tokenStore.set((await api.login('linhao', 'secret123')).access_token)
try {
  await api.checkinWithCode(109, '5521')
  bad('20 重复签到', '竟然成功了（应该 409）')
} catch (err) {
  if (err.status === 409) ok('20 重复签到', `被拒绝：${err.message}`)
  else bad('20 重复签到', `状态码 ${err.status}`)
}

console.log('\n' + '─'.repeat(70))
if (problems.length) {
  console.log(`\x1b[31m${problems.length} 项失败\x1b[0m / 共 ${pass + problems.length} 步`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}
console.log(`\x1b[32m全部通过：${pass} 步走通整个用户旅程\x1b[0m`)
