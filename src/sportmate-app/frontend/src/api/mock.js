/**
 * 离线后端模拟（mock）
 * ---------------------------------------------------------------------------
 * 这不是"假接口层"，而是一个**在 fetch 位置上替身**的最小后端：
 *   http.js 照常 buildUrl + 带 token + 解析错误，只是请求被送到这里。
 * 因此在线/离线两种模式下，前端的代码路径完全一致 —— 不会出现
 * "联调时才发现 page 里写的是 mock 专用逻辑"这种问题。
 *
 * 覆盖《前端对接文档》第七节全部 19 个接口，
 * 并按第八节约定：时间统一输出为不带时区偏移的 UTC 串。
 *
 * 想接真实后端：在 index.html 里把 window.__SPORTSBUDDY_CONFIG__.useMock 设为 false。
 */

import {
  ACTIVITIES,
  REGISTRATION_SEED,
  REVIEWS,
  SPORTS,
  USERS,
  defaultRegistration,
  toUtc,
} from '../fixtures/index.js'

/* ============================ 状态 ============================ */

/** 可变的模拟数据库。只初始化一次，刷新页面即还原（纯前端 demo 够用）。 */
function seed() {
  const activities = ACTIVITIES.map((a) => ({ ...a }))
  const regs = []
  for (const a of activities) {
    for (const p of a.participants) {
      const override = REGISTRATION_SEED.find(
        (r) => r.activity_id === a.id && r.user_id === p.user_id
      )
      const base = defaultRegistration(a.id, p.user_id)
      base.note = p.note ?? ''
      regs.push({ ...base, ...(override ?? {}) })
    }
  }
  return {
    users: USERS.map((u) => ({ ...u })),
    activities,
    registrations: regs,
    reviews: REVIEWS.map((r) => ({ ...r })),
    sessions: new Set(),
    nextActivityId: Math.max(...activities.map((a) => a.id)) + 1,
    nextReviewId: Math.max(0, ...REVIEWS.map((r) => r.id)) + 1,
  }
}

export const db = seed()

/** 还原到初始状态（原型里"重新开始"用）。 */
export function resetMock() {
  const fresh = seed()
  db.users = fresh.users
  db.activities = fresh.activities
  db.registrations = fresh.registrations
  db.reviews = fresh.reviews
  db.sessions = fresh.sessions
  db.nextActivityId = fresh.nextActivityId
  db.nextReviewId = fresh.nextReviewId
}

/** 模拟网络延迟：让加载态真的能被看到，同时不拖慢演示。 */
export let MOCK_LATENCY = 160
export function setMockLatency(ms) {
  MOCK_LATENCY = Math.max(0, ms)
}

/* ============================ 基础工具 ============================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 后端约定：错误体 detail / error 结构一致。 */
function fail(status, detail) {
  return json({ detail, error: status === 422 ? 'validation_error' : 'service_error' }, status)
}

const nowIso = () => toUtc(Date.now())

function currentUser(init) {
  const auth = init?.headers?.Authorization || init?.headers?.authorization || ''
  const token = String(auth).replace(/^Bearer\s+/i, '')
  if (!token) return null
  const hit = db.users.find((u) => `mock-token-${u.id}` === token)
  return hit ?? null
}

function requireUser(init) {
  const me = currentUser(init)
  return me ?? { error: fail(401, '请先登录') }
}

/* ============================ 视图组装 ============================ */

const userBrief = (u) =>
  u
    ? { id: u.id, nickname: u.nickname, campus: u.campus, reliability_score: u.reliability_score }
    : null

/** 活动 → 列表模型（含 joined_count / slots_left / organizer）。 */
function activityView(a) {
  const active = db.registrations.filter(
    (r) => r.activity_id === a.id && r.status !== 'cancelled'
  )
  const joined = active.length
  const organizer = db.users.find((u) => u.id === a.organizer_id)
  return {
    id: a.id,
    title: a.title,
    sport: a.sport,
    description: a.description,
    campus: a.campus,
    location: a.location,
    latitude: a.latitude,
    longitude: a.longitude,
    start_time: a.start_time,
    end_time: a.end_time,
    skill_level: a.skill_level,
    capacity: a.capacity,
    gender_limit: a.gender_limit,
    fee: a.fee,
    status: a.status,
    created_at: a.start_time,
    organizer: userBrief(organizer),
    joined_count: joined,
    slots_left: Math.max(0, a.capacity - joined),
  }
}

/**
 * 活动 → 详情模型。
 * 关键约定：checkin_code 只有【发起人】看得到，其他人拿到 null。
 * 所以界面判断用 detail.checkin_code != null，而不是比较 user_id。
 */
function activityDetail(a, me) {
  const base = activityView(a)
  const participants = db.registrations
    .filter((r) => r.activity_id === a.id && r.status !== 'cancelled')
    .map((r) => {
      const u = db.users.find((x) => x.id === r.user_id)
      return {
        user_id: r.user_id,
        nickname: u?.nickname ?? `用户${r.user_id}`,
        skill_level: u?.skill_level ?? 'any',
        reliability_score: u?.reliability_score ?? 100,
        status: r.status,
        note: r.note ?? '',
        checked_in_at: r.checked_in_at ?? null,
        checkin_method: r.checkin_method ?? null,
      }
    })
  const isOrg = me && me.id === a.organizer_id
  return { ...base, participants, checkin_code: isOrg ? a.checkin_code : null }
}

/* ============================ 路由 ============================ */

/**
 * 替身 fetch。签名与原生 fetch 一致，返回 Response。
 * @param {string} url 已经带好 query 的完整地址
 * @param {RequestInit} init
 */
export async function mockFetch(url, init = {}) {
  const method = (init.method || 'GET').toUpperCase()
  const parsed = new URL(url)
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  const q = parsed.searchParams
  let body = null
  if (init.body) {
    try {
      body = JSON.parse(init.body)
    } catch {
      body = null
    }
  }

  await sleep(MOCK_LATENCY)

  /* ---------------- 健康检查 ---------------- */
  if (path === '/health' && method === 'GET') {
    return json({ status: 'ok', mock: true, time: nowIso() })
  }

  /* ---------------- 认证 ---------------- */
  if (path === '/auth/register' && method === 'POST') {
    const username = String(body?.username ?? '')
    if (!/^[A-Za-z0-9_]{3,32}$/.test(username))
      return fail(422, '用户名 长度至少为 3 个字符，且只能包含字母、数字、下划线')
    if (String(body?.password ?? '').length < 6) return fail(422, '密码 长度至少为 6 个字符')
    if (db.users.some((u) => u.username === username)) return fail(409, '该用户名已被注册')
    const id = Math.max(...db.users.map((u) => u.id)) + 1
    const user = {
      id,
      username,
      nickname: body?.nickname || username,
      campus: body?.campus || '旗山校区',
      skill_level: body?.skill_level || 'any',
      favorite_sports: body?.favorite_sports || [],
      reliability_score: 100,
      completed_count: 0,
      no_show_count: 0,
      created_at: nowIso(),
      review_average: null,
      review_count: 0,
    }
    db.users.push(user)
    const token = `mock-token-${id}`
    db.sessions.add(token)
    return json(
      { access_token: token, token_type: 'bearer', expires_at: toUtc(Date.now() + 30 * 86400000) },
      201
    )
  }

  if (path === '/auth/login' && method === 'POST') {
    const u = db.users.find((x) => x.username === String(body?.username ?? ''))
    // 演示账号密码统一为 secret123
    if (!u || String(body?.password ?? '') !== 'secret123')
      return fail(401, '用户名或密码错误')
    const token = `mock-token-${u.id}`
    db.sessions.add(token)
    return json({
      access_token: token,
      token_type: 'bearer',
      expires_at: toUtc(Date.now() + 30 * 86400000),
    })
  }

  if (path === '/auth/logout' && method === 'POST') {
    const auth = init.headers?.Authorization || ''
    db.sessions.delete(String(auth).replace(/^Bearer\s+/i, ''))
    return new Response(null, { status: 204 })
  }

  if (path === '/me' && method === 'GET') {
    const me = requireUser(init)
    if (me.error) return me.error
    return json(me)
  }

  if (path === '/me' && method === 'PATCH') {
    const me = requireUser(init)
    if (me.error) return me.error
    for (const k of ['nickname', 'campus', 'skill_level', 'favorite_sports']) {
      if (body?.[k] !== undefined) me[k] = body[k]
    }
    return json(me)
  }

  /* ---------------- 基础数据 ---------------- */
  if (path === '/sports' && method === 'GET') return json(SPORTS)

  /* ---------------- 用户 ---------------- */
  const userReviews = path.match(/^\/users\/(\d+)\/reviews$/)
  if (userReviews && method === 'GET') {
    const id = Number(userReviews[1])
    const list = db.reviews
      .filter((r) => r.reviewee_id === id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({
        ...r,
        reviewer: userBrief(db.users.find((u) => u.id === r.reviewer_id)),
      }))
    return json(list)
  }

  const userOne = path.match(/^\/users\/(\d+)$/)
  if (userOne && method === 'GET') {
    const u = db.users.find((x) => x.id === Number(userOne[1]))
    if (!u) return fail(404, '用户不存在')
    return json({
      id: u.id,
      nickname: u.nickname,
      campus: u.campus,
      skill_level: u.skill_level,
      favorite_sports: u.favorite_sports,
      reliability_score: u.reliability_score,
      completed_count: u.completed_count,
      no_show_count: u.no_show_count,
      created_at: u.created_at,
      review_average: u.review_average,
      review_count: u.review_count,
    })
  }

  /* ---------------- 我的活动 ---------------- */
  if (path === '/activities/mine' && method === 'GET') {
    const me = requireUser(init)
    if (me.error) return me.error
    const joinedIds = db.registrations
      .filter((r) => r.user_id === me.id && r.status !== 'cancelled')
      .map((r) => r.activity_id)
    return json({
      organized: db.activities
        .filter((a) => a.organizer_id === me.id)
        .map((a) => activityView(a))
        .sort((x, y) => (x.start_time < y.start_time ? -1 : 1)),
      joined: db.activities
        .filter((a) => joinedIds.includes(a.id))
        .map((a) => activityView(a))
        .sort((x, y) => (x.start_time < y.start_time ? -1 : 1)),
    })
  }

  /* ---------------- 活动列表 ---------------- */
  if (path === '/activities' && method === 'GET') {
    const limit = Number(q.get('limit') ?? 20)
    const offset = Number(q.get('offset') ?? 0)
    const onlyAvailable = q.get('only_available') === 'true'
    const skill = q.get('skill_level')
    let list = db.activities.slice()
    if (q.get('sport')) list = list.filter((a) => a.sport === q.get('sport'))
    if (q.get('campus')) list = list.filter((a) => a.campus === q.get('campus'))
    if (q.get('status')) list = list.filter((a) => a.status === q.get('status'))
    if (skill) list = list.filter((a) => a.skill_level === skill || a.skill_level === 'any')
    if (onlyAvailable) list = list.filter((a) => a.status === 'open' && activityView(a).slots_left > 0)
    list.sort((a, b) => (a.start_time < b.start_time ? -1 : 1))
    return json(list.slice(offset, offset + limit).map(activityView))
  }

  /* ---------------- 创建活动 ---------------- */
  if (path === '/activities' && method === 'POST') {
    const me = requireUser(init)
    if (me.error) return me.error
    const title = String(body?.title ?? '').trim()
    if (title.length < 2) return fail(422, '标题 长度至少为 2 个字符')
    if (!body?.sport) return fail(422, '请选择运动项目')
    if (!body?.start_time || !body?.end_time) return fail(422, '请填写开始和结束时间')
    if (new Date(body.end_time) <= new Date(body.start_time))
      return fail(422, '结束时间必须晚于开始时间')
    const capacity = Number(body?.capacity ?? 6)
    if (!(capacity >= 2 && capacity <= 100)) return fail(422, '人数上限需在 2~100 之间')

    const id = db.nextActivityId++
    const activity = {
      id,
      title,
      sport: body.sport,
      description: body.description || '',
      campus: body.campus || '旗山校区',
      location: body.location || '',
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      start_time: body.start_time,
      end_time: body.end_time,
      skill_level: body.skill_level || 'any',
      capacity,
      gender_limit: body.gender_limit || 'any',
      fee: Number(body.fee ?? 0),
      status: 'open',
      organizer_id: me.id,
      checkin_code: String(Math.floor(1000 + Math.random() * 9000)),
      participants: [],
    }
    db.activities.push(activity)
    // 发起人自动占一个名额
    db.registrations.push({
      ...defaultRegistration(id, me.id),
      created_at: nowIso(),
    })
    // 注意：创建接口【不返回 checkin_code】，需要再查一次详情
    return json(activityView(activity), 201)
  }

  /* ---------------- 活动详情 / 修改 / 取消 ---------------- */
  const actOne = path.match(/^\/activities\/(\d+)$/)
  if (actOne) {
    const id = Number(actOne[1])
    const a = db.activities.find((x) => x.id === id)
    if (!a) return fail(404, '活动不存在')
    if (method === 'GET') return json(activityDetail(a, currentUser(init)))
    if (method === 'PATCH') {
      const me = requireUser(init)
      if (me.error) return me.error
      if (me.id !== a.organizer_id) return fail(403, '只有发起人可以修改活动')
      if (a.status === 'cancelled') return fail(400, '活动已取消，无法修改')
      for (const k of [
        'title',
        'sport',
        'description',
        'campus',
        'location',
        'start_time',
        'end_time',
        'skill_level',
        'capacity',
        'fee',
        'gender_limit',
      ]) {
        if (body?.[k] !== undefined) a[k] = body[k]
      }
      return json(activityView(a))
    }
  }

  const actCancel = path.match(/^\/activities\/(\d+)\/cancel$/)
  if (actCancel && method === 'POST') {
    const me = requireUser(init)
    if (me.error) return me.error
    const a = db.activities.find((x) => x.id === Number(actCancel[1]))
    if (!a) return fail(404, '活动不存在')
    if (me.id !== a.organizer_id) return fail(403, '只有发起人可以取消活动')
    if (a.status === 'cancelled') return fail(409, '活动已经是取消状态')
    a.status = 'cancelled'
    for (const r of db.registrations) {
      if (r.activity_id === a.id && r.status !== 'cancelled') r.status = 'cancelled'
    }
    return json(activityDetail(a, me))
  }

  /* ---------------- 报名 / 取消报名 ---------------- */
  const actJoin = path.match(/^\/activities\/(\d+)\/join$/)
  if (actJoin) {
    const me = requireUser(init)
    if (me.error) return me.error
    const a = db.activities.find((x) => x.id === Number(actJoin[1]))
    if (!a) return fail(404, '活动不存在')

    const existing = db.registrations.find(
      (r) => r.activity_id === a.id && r.user_id === me.id && r.status !== 'cancelled'
    )

    if (method === 'POST') {
      if (me.reliability_score < 60)
        return fail(403, `你的信用分为 ${me.reliability_score}，低于 60 分，暂时无法报名新活动`)
      if (existing) return fail(409, '你已经报名过该活动')
      if (a.status === 'cancelled') return fail(400, '活动已取消，无法报名')
      if (a.status === 'finished') return fail(400, '活动已结束，无法报名')
      if (a.status === 'ongoing') return fail(400, '活动已开始，无法报名')
      const view = activityView(a)
      if (view.slots_left <= 0) return fail(409, '活动已满员')
      const reg = { ...defaultRegistration(a.id, me.id), note: body?.note ?? '', created_at: nowIso() }
      if (a.status === 'full') a.status = 'open'
      db.registrations.push(reg)
      return json(reg, 201)
    }

    if (method === 'DELETE') {
      if (!existing) return fail(404, '你没有报名该活动')
      const started = new Date(`${a.start_time}Z`).getTime()
      const late = started - Date.now() < 2 * 3600 * 1000 && started > Date.now()
      existing.status = 'cancelled'
      existing.is_late_cancel = late
      if (late) {
        me.reliability_score = Math.max(0, me.reliability_score - 5)
      }
      const view = activityView(a)
      if (a.status === 'full' && view.slots_left > 0) a.status = 'open'
      return json(existing)
    }
  }

  /* ---------------- 签到 ---------------- */
  const actCheckin = path.match(/^\/activities\/(\d+)\/checkin$/)
  if (actCheckin && method === 'POST') {
    const me = requireUser(init)
    if (me.error) return me.error
    const a = db.activities.find((x) => x.id === Number(actCheckin[1]))
    if (!a) return fail(404, '活动不存在')
    const reg = db.registrations.find(
      (r) => r.activity_id === a.id && r.user_id === me.id && r.status !== 'cancelled'
    )
    if (!reg) return fail(403, '你没有报名该活动，无法签到')
    if (reg.status === 'checked_in' || reg.status === 'attended')
      return fail(409, '你已经签到过了')

    const hasCode = body?.code !== undefined && body?.code !== null && body?.code !== ''
    const hasLoc = body?.latitude != null && body?.longitude != null
    if (!hasCode && !hasLoc) return fail(422, '请提供签到码或定位坐标')

    if (hasLoc) {
      const d = haversineKm(body.latitude, body.longitude, a.latitude, a.longitude)
      const meters = Math.round(d * 1000)
      if (meters > 300)
        return fail(403, `你距离活动地点约 ${meters} 米，超出 300 米签到范围`)
      reg.status = 'checked_in'
      reg.checkin_method = 'location'
      reg.checkin_distance_m = meters
      reg.checked_in_at = nowIso()
      return json({
        success: true,
        method: 'location',
        distance_m: meters,
        message: `签到成功（距活动地点 ${meters} 米）`,
        registration: reg,
      })
    }

    if (String(body.code) !== String(a.checkin_code)) return fail(403, '签到码错误')
    reg.status = 'checked_in'
    reg.checkin_method = 'code'
    reg.checked_in_at = nowIso()
    return json({ success: true, method: 'code', distance_m: null, message: '签到成功', registration: reg })
  }

  /* ---------------- 考勤（发起人） ---------------- */
  const actAttendance = path.match(/^\/activities\/(\d+)\/attendance$/)
  if (actAttendance && method === 'POST') {
    const me = requireUser(init)
    if (me.error) return me.error
    const a = db.activities.find((x) => x.id === Number(actAttendance[1]))
    if (!a) return fail(404, '活动不存在')
    if (me.id !== a.organizer_id) return fail(403, '只有发起人可以记录考勤')
    if (!Array.isArray(body)) return fail(422, '请求体应为到场者的 user_id 数组')

    const attended = []
    const noShow = []
    const scoreChanges = {}
    for (const r of db.registrations) {
      if (r.activity_id !== a.id || r.status === 'cancelled') continue
      if (body.includes(r.user_id)) {
        r.status = 'attended'
        attended.push(r.user_id)
      } else {
        r.status = 'no_show'
        noShow.push(r.user_id)
        const u = db.users.find((x) => x.id === r.user_id)
        if (u) {
          u.reliability_score = Math.max(0, u.reliability_score - 15)
          u.no_show_count += 1
          scoreChanges[r.user_id] = -15
        }
      }
    }
    for (const uid of attended) {
      const u = db.users.find((x) => x.id === uid)
      if (u) u.completed_count += 1
    }
    if (a.status !== 'cancelled') a.status = 'finished'
    return json({ activity_id: a.id, attended, no_show: noShow, score_changes: scoreChanges })
  }

  /* ---------------- 评价 ---------------- */
  const actReview = path.match(/^\/activities\/(\d+)\/reviews$/)
  if (actReview && method === 'POST') {
    const me = requireUser(init)
    if (me.error) return me.error
    const a = db.activities.find((x) => x.id === Number(actReview[1]))
    if (!a) return fail(404, '活动不存在')
    const mine = db.registrations.find(
      (r) => r.activity_id === a.id && r.user_id === me.id && r.status !== 'cancelled'
    )
    if (!mine || mine.status !== 'attended')
      return fail(403, '只有确认到场的参与者可以评价同场伙伴')
    const score = Number(body?.score)
    if (!(score >= 1 && score <= 5)) return fail(422, '评分需在 1~5 之间')
    const reviewee = Number(body?.reviewee_id)
    if (reviewee === me.id) return fail(400, '不能评价自己')
    if (
      db.reviews.some(
        (r) => r.activity_id === a.id && r.reviewer_id === me.id && r.reviewee_id === reviewee
      )
    )
      return fail(409, '你已经评价过这位同学')
    const review = {
      id: db.nextReviewId++,
      activity_id: a.id,
      reviewer_id: me.id,
      reviewee_id: reviewee,
      score,
      tags: Array.isArray(body?.tags) ? body.tags : [],
      comment: body?.comment ?? '',
      created_at: nowIso(),
    }
    db.reviews.push(review)
    // 更新被评价人的汇总
    const target = db.users.find((u) => u.id === reviewee)
    if (target) {
      const all = db.reviews.filter((r) => r.reviewee_id === reviewee)
      target.review_count = all.length
      target.review_average = Math.round((all.reduce((s, r) => s + r.score, 0) / all.length) * 10) / 10
    }
    return json(review, 201)
  }

  /* ---------------- 匹配 ---------------- */
  if (path === '/match' && method === 'GET') {
    const criteria = {
      sport: q.get('sport') || null,
      campus: q.get('campus') || null,
      skill_level: q.get('skill_level') || null,
      latitude: q.get('latitude') ? Number(q.get('latitude')) : null,
      longitude: q.get('longitude') ? Number(q.get('longitude')) : null,
      max_distance_km: q.get('max_distance_km') ? Number(q.get('max_distance_km')) : null,
    }
    return json(runMatch(criteria, Number(q.get('limit') ?? 10)))
  }

  if (path === '/match/parse' && method === 'GET') {
    const sentence = q.get('q') ?? ''
    if (!sentence.trim()) return fail(422, '请输入你想找的活动，例如"今晚想打篮球"')
    const criteria = parseSentence(sentence)
    return json({ ...runMatch(criteria, Number(q.get('limit') ?? 10)), sentence })
  }

  return fail(404, `mock 未实现：${method} ${path}`)
}

/* ============================ 匹配算法 ============================ */

/**
 * 一句话解析：从中文里抽出 运动项目 / 校区 / 水平 / 时间词。
 * 后端的 /match/parse 是同样的思路（规则抽取），这里在前端复刻一份用于离线演示。
 * @returns {{sport:string|null, campus:string|null, skill_level:string|null, time_hint:string|null}}
 */
export function parseSentence(sentence) {
  const s = String(sentence)
  const sport = SPORTS.find((x) => s.includes(x.name))?.name ?? null
  const campus = ['旗山校区', '铜盘校区', '怡山校区', '晋江校区'].find((c) => s.includes(c)) ?? null

  let skill = null
  if (/新手|初学|入门|不会打|零基础/.test(s)) skill = 'beginner'
  else if (/熟练|高手|大佬|进阶|打得好/.test(s)) skill = 'advanced'
  else if (/一般|中等|还行/.test(s)) skill = 'intermediate'

  let time = null
  if (/今晚|晚上|今天晚/.test(s)) time = 'tonight'
  else if (/明早|明天早/.test(s)) time = 'tomorrow_morning'
  else if (/明天/.test(s)) time = 'tomorrow'
  else if (/周末|周六|周日/.test(s)) time = 'weekend'
  else if (/现在|马上|立刻/.test(s)) time = 'now'

  return { sport, campus, skill_level: skill, time_hint: time }
}

/**
 * 结构化匹配：打分 + 给出"为什么推荐"。
 * 评分口径（总分 100）：
 *   项目匹配 +45 / 校区匹配 +25 / 水平合适 +20 / 距离近最多 +10
 * 时间词命中额外 +5（保证"今晚"优先推今晚的活动），最终截断到 100。
 */
function runMatch(criteria, limit = 10) {
  const items = []
  for (const a of db.activities) {
    if (a.status === 'cancelled') continue
    const view = activityView(a)
    if (view.slots_left <= 0) continue

    let score = 0
    const reason = {
      sport: false,
      time: false,
      skill: false,
      campus: false,
      distance_km: null,
      slots_left: view.slots_left,
    }

    if (criteria.sport) {
      reason.sport = a.sport === criteria.sport
      if (reason.sport) score += 45
      else continue // 项目不符直接不推
    } else {
      score += 20
    }

    if (criteria.campus) {
      reason.campus = a.campus === criteria.campus
      if (reason.campus) score += 25
    } else {
      score += 8
    }

    if (criteria.skill_level) {
      reason.skill = a.skill_level === criteria.skill_level || a.skill_level === 'any'
      if (reason.skill) score += 20
      else score -= 10
    } else {
      score += 10
    }

    if (criteria.latitude != null && criteria.longitude != null && a.latitude != null) {
      const km = haversineKm(criteria.latitude, criteria.longitude, a.latitude, a.longitude)
      reason.distance_km = Math.round(km * 100) / 100
      score += Math.max(0, 10 - km * 2)
    } else {
      score += 4
    }

    // 时间词：今晚 / 明天 / 周末
    const startMs = new Date(`${a.start_time}Z`).getTime()
    const hoursAhead = (startMs - Date.now()) / 3600000
    if (criteria.time_hint === 'tonight' && hoursAhead > 0 && hoursAhead < 12) {
      reason.time = true
      score += 5
    } else if (criteria.time_hint === 'tomorrow' && hoursAhead > 8 && hoursAhead < 36) {
      reason.time = true
      score += 5
    } else if (criteria.time_hint === 'tomorrow_morning' && hoursAhead > 8 && hoursAhead < 24) {
      reason.time = true
      score += 5
    } else if (criteria.time_hint === 'weekend') {
      const day = new Date(startMs).getDay()
      if (day === 0 || day === 6) {
        reason.time = true
        score += 5
      }
    } else if (criteria.time_hint === 'now' && hoursAhead > -1 && hoursAhead < 3) {
      reason.time = true
      score += 5
    }

    items.push({
      activity: view,
      score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
      reason,
    })
  }

  items.sort((x, y) => y.score - x.score || (x.activity.start_time < y.activity.start_time ? -1 : 1))
  return { query: criteria, count: Math.min(items.length, limit), items: items.slice(0, limit) }
}

/** 球面距离（Haversine），与后端定位签到用的是同一口径。 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export { haversineKm, activityView, activityDetail, userBrief }
