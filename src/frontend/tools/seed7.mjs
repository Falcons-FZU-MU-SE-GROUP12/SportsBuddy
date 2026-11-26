/**
 * 给 Issue #7「活动列表 + 筛选」造一版演示数据
 * ---------------------------------------------------------------------------
 * 在 seed-demo.mjs（4 用户 / 3 活动）的基础上，再注册 5 个用户、创建 12 场活动：
 * 覆盖 8 种运动、2 个校区、4 档水平、今天/明天/后天/下周多个时间窗，
 * 其中 2 场人为报满（验证「只看还有空位」与满员标签），总量超过一页（8 条），
 * 让分页「加载更多」在截图里能真实出现。
 *
 * 用法：node tools/seed7.mjs   （前提：后端 127.0.0.1:8000 已起、已跑过 seed-demo.mjs）
 * 可重复执行：用户已存在会走登录；活动会新增（用于清空重来的话删 DB 后重跑 seed-demo 再跑本脚本）。
 */

const BASE = 'http://127.0.0.1:8000'

async function call(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function iso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

const extraUsers = [
  { username: 'liuwei', password: 'sportmate123', nickname: '刘伟', campus: '旗山校区', skill_level: 'intermediate', favorite_sports: ['羽毛球'] },
  { username: 'zhaomin', password: 'sportmate123', nickname: '赵敏', campus: '铜盘校区', skill_level: 'beginner', favorite_sports: ['乒乓球'] },
  { username: 'sunjie', password: 'sportmate123', nickname: '孙杰', campus: '旗山校区', skill_level: 'advanced', favorite_sports: ['篮球'] },
  { username: 'zhouyang', password: 'sportmate123', nickname: '周洋', campus: '铜盘校区', skill_level: 'any', favorite_sports: ['足球'] },
  { username: 'wuqiang', password: 'sportmate123', nickname: '吴强', campus: '旗山校区', skill_level: 'beginner', favorite_sports: ['跑步'] },
]
// seed-demo.mjs 已注册的 4 个账号：这里只登录拿 token
const seedUsers = ['linzj', 'chenyu', 'liyutong', 'wanghz']

const tokens = {}
const ids = {}
for (const u of extraUsers) {
  try {
    tokens[u.username] = (await call('/auth/register', { method: 'POST', body: u })).access_token
  } catch {
    tokens[u.username] = (await call('/auth/login', { method: 'POST', body: { username: u.username, password: u.password } })).access_token
  }
  ids[u.username] = (await call('/me', { token: tokens[u.username] })).id
  console.log(`user ${u.username} -> ${ids[u.username]}`)
}
for (const name of seedUsers) {
  try {
    tokens[name] = (await call('/auth/login', { method: 'POST', body: { username: name, password: 'sportmate123' } })).access_token
    ids[name] = (await call('/me', { token: tokens[name] })).id
    console.log(`login ${name} -> ${ids[name]}`)
  } catch (e) {
    console.warn(`login 失败 ${name}: ${e.message}`)
  }
}

const acts = [
  // [title, sport, campus, location, level, capacity, minutes, joins]
  // 注意：报名要求"水平一致"，即 活动要求 == 报名者水平（'any' 与任何水平互相兼容）。
  // 所以报名名单按用户水平配对，避免 400。
  ['今天晚场羽毛球双打 · 旗山馆', '羽毛球', '旗山校区', '旗山校区体育馆 3 号场', 'intermediate', 4, 90, ['liuwei', 'liyutong']],
  ['今晚五人制足球 · 铜盘', '足球', '铜盘校区', '铜盘校区足球场', 'any', 10, 180, ['sunjie', 'zhouyang', 'wuqiang', 'linzj']],
  ['今天乒乓球新手切磋', '乒乓球', '旗山校区', '旗山校区活动中心', 'beginner', 2, 240, ['chenyu', 'zhaomin', 'wuqiang']], // 满员（发起人 + 2 报名）
  ['明天篮球半场 3v3', '篮球', '铜盘校区', '铜盘校区篮球场', 'advanced', 6, 1500, ['sunjie', 'wanghz']],
  ['明早晨跑 5 公里', '跑步', '旗山校区', '旗山校区东操场', 'any', 8, 1560, ['wuqiang', 'chenyu']],
  ['明天网球对拉', '网球', '铜盘校区', '铜盘校区网球场', 'intermediate', 2, 1620, ['liuwei', 'liyutong', 'linzj']], // 满员（发起人 + 2 报名）
  ['后天江滨骑行 20km', '骑行', '旗山校区', '旗山校区西门集合', 'beginner', 12, 2880, ['zhouyang']],
  ['后天校游泳馆自由泳', '游泳', '铜盘校区', '铜盘校区游泳馆', 'beginner', 6, 2940, []],
  ['新手羽毛球教学局', '羽毛球', '旗山校区', '旗山校区体育馆 2 号场', 'beginner', 4, 4320, ['zhaomin', 'wuqiang']],
  ['周末全场 5v5 摸底', '篮球', '旗山校区', '旗山校区篮球场', 'advanced', 10, 5760, ['sunjie', 'wanghz']],
  ['下周足球野球局', '足球', '铜盘校区', '铜盘校区足球场', 'intermediate', 12, 8640, []],
  ['下周环校夜跑', '跑步', '旗山校区', '旗山校区环校路', 'any', 8, 10080, []],
]

let count = 0
for (const [title, sport, campus, location, level, capacity, minutes, joins] of acts) {
  const organizer = joins[0] ?? 'linzj'
  const created = await call('/activities', {
    method: 'POST',
    token: tokens[organizer],
    body: {
      title,
      sport,
      campus,
      location,
      start_time: iso(minutes),
      end_time: iso(minutes + 120),
      skill_level: level,
      capacity,
      fee: 0,
    },
  })
  for (const j of joins.slice(1)) {
    await call(`/activities/${created.id}/join`, { method: 'POST', token: tokens[j], body: { note: '' } })
  }
  console.log(`activity ${created.id} ${title} (${sport} ${campus}) joins=${joins.length}`)
  count += 1
}

const list = await call('/activities?status=open&limit=200')
console.log(`\n当前 open 活动共 ${list.length} 条`)
console.log(`满员(已隐藏前) ${list.filter((a) => a.slots_left <= 0).length} 条 / 有空位 ${list.filter((a) => a.slots_left > 0).length} 条`)
