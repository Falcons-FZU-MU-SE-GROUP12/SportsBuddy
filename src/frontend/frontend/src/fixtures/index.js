/**
 * 离线示意数据（fixtures）
 * ---------------------------------------------------------------------------
 * 用途：在没有网络 / 后端没启动 / 只是演示界面时，让整站"打开就能看"。
 * 数据形状严格按《前端对接文档》第六节，字段名、枚举值、时间格式都一致：
 *   · 时间是不带时区偏移的 UTC 串（由 toUtc() 生成，末尾不加 Z）
 *   · fee 单位是"分"
 *   · joined_count / slots_left / organizer 都是后端会算好返回的派生字段
 *
 * 注意：这些是*示意*数据，不是真实用户数据。
 */

/* ---------------- 时间助手 ---------------- */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** 相对当前时间 n 毫秒后的"后端格式"UTC 串（无 Z、无偏移）。 */
export function toUtc(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '')
}

const now = () => Date.now()
const at = (deltaMs) => toUtc(now() + deltaMs)

/* ---------------- 运动项目字典 ---------------- */

export const SPORTS = [
  { id: 1, name: '篮球', icon: '🏀', default_capacity: 6 },
  { id: 2, name: '足球', icon: '⚽', default_capacity: 10 },
  { id: 3, name: '羽毛球', icon: '🏸', default_capacity: 4 },
  { id: 4, name: '乒乓球', icon: '🏓', default_capacity: 4 },
  { id: 5, name: '网球', icon: '🎾', default_capacity: 4 },
  { id: 6, name: '排球', icon: '🏐', default_capacity: 12 },
  { id: 7, name: '跑步', icon: '🏃', default_capacity: 8 },
  { id: 8, name: '游泳', icon: '🏊', default_capacity: 6 },
  { id: 9, name: '健身', icon: '🏋️', default_capacity: 6 },
  { id: 10, name: '骑行', icon: '🚴', default_capacity: 8 },
]

export const sportIcon = (name) => SPORTS.find((s) => s.name === name)?.icon ?? '🤸'

/* ---------------- 用户 ---------------- */

/** 当前登录的演示账号（id=1）。 */
export const ME_ID = 1

export const USERS = [
  {
    id: 1,
    username: 'linhao',
    nickname: '林浩',
    campus: '旗山校区',
    skill_level: 'intermediate',
    favorite_sports: ['篮球', '跑步'],
    reliability_score: 96,
    completed_count: 23,
    no_show_count: 0,
    created_at: at(-120 * DAY),
    review_average: 4.8,
    review_count: 12,
  },
  {
    id: 2,
    username: 'wangyan',
    nickname: '王妍',
    campus: '旗山校区',
    skill_level: 'advanced',
    favorite_sports: ['羽毛球', '游泳'],
    reliability_score: 100,
    completed_count: 41,
    no_show_count: 0,
    created_at: at(-200 * DAY),
    review_average: 5.0,
    review_count: 28,
  },
  {
    id: 3,
    username: 'chenmo',
    nickname: '陈默',
    campus: '旗山校区',
    skill_level: 'beginner',
    favorite_sports: ['篮球'],
    reliability_score: 88,
    completed_count: 9,
    no_show_count: 1,
    created_at: at(-60 * DAY),
    review_average: 4.5,
    review_count: 6,
  },
  {
    id: 4,
    username: 'zhaolin',
    nickname: '赵琳',
    campus: '铜盘校区',
    skill_level: 'intermediate',
    favorite_sports: ['跑步', '骑行'],
    reliability_score: 100,
    completed_count: 33,
    no_show_count: 0,
    created_at: at(-150 * DAY),
    review_average: 4.9,
    review_count: 19,
  },
  {
    id: 5,
    username: 'sunqi',
    nickname: '孙琦',
    campus: '旗山校区',
    skill_level: 'advanced',
    favorite_sports: ['足球'],
    reliability_score: 74,
    completed_count: 17,
    no_show_count: 2,
    created_at: at(-90 * DAY),
    review_average: 4.2,
    review_count: 11,
  },
  {
    id: 6,
    username: 'zhouyu',
    nickname: '周雨',
    campus: '旗山校区',
    skill_level: 'beginner',
    favorite_sports: ['乒乓球', '羽毛球'],
    reliability_score: 100,
    completed_count: 5,
    no_show_count: 0,
    created_at: at(-20 * DAY),
    review_average: null,
    review_count: 0,
  },
  {
    id: 7,
    username: 'hejing',
    nickname: '何静',
    campus: '铜盘校区',
    skill_level: 'intermediate',
    favorite_sports: ['排球'],
    reliability_score: 92,
    completed_count: 14,
    no_show_count: 0,
    created_at: at(-80 * DAY),
    review_average: 4.7,
    review_count: 9,
  },
  {
    id: 8,
    username: 'gaofei',
    nickname: '高飞',
    campus: '旗山校区',
    skill_level: 'advanced',
    favorite_sports: ['网球', '健身'],
    reliability_score: 58, // 特意低于 60：用来演示"信用分不足无法报名"
    completed_count: 12,
    no_show_count: 4,
    created_at: at(-110 * DAY),
    review_average: 3.6,
    review_count: 8,
  },
]

export const userById = (id) => USERS.find((u) => u.id === id) ?? null

/* ---------------- 活动 ---------------- */

/**
 * 活动种子。participants 只写 user_id + 报名备注，
 * 报名状态单独放在 REGISTRATIONS 里，模拟后端两张表的关系。
 */
export const ACTIVITIES = [
  {
    id: 101,
    title: '周三晚篮球 3v3，缺两人',
    sport: '篮球',
    description: '风雨操场 3 号场，半场 3v3。新手也欢迎，主要是找搭子。自带水。',
    campus: '旗山校区',
    location: '风雨操场 3 号场',
    latitude: 26.0565,
    longitude: 119.1966,
    start_time: at(6 * HOUR),
    end_time: at(8 * HOUR),
    skill_level: 'any',
    capacity: 6,
    gender_limit: 'any',
    fee: 0,
    status: 'open',
    organizer_id: 2,
    checkin_code: '9572',
    participants: [
      { user_id: 2, note: '' },
      { user_id: 3, note: '第一次来，多担待' },
      { user_id: 5, note: '带球' },
    ],
  },
  {
    id: 102,
    title: '晨跑 5 公里 · 旗山环校',
    sport: '跑步',
    description: '早上 6:30 田径场门口集合，配速 6 分左右，跑完一起早餐。',
    campus: '旗山校区',
    location: '田径场东门',
    latitude: 26.0551,
    longitude: 119.1982,
    start_time: at(DAY + 1 * HOUR),
    end_time: at(DAY + 2 * HOUR),
    skill_level: 'beginner',
    capacity: 8,
    gender_limit: 'any',
    fee: 0,
    status: 'open',
    organizer_id: 4,
    checkin_code: '3141',
    participants: [
      { user_id: 4, note: '' },
      { user_id: 1, note: '' },
      { user_id: 6, note: '第一次跑，慢一点' },
    ],
  },
  {
    id: 103,
    title: '羽毛球双打，水平一般即可',
    sport: '羽毛球',
    description: '体育馆 2 号场，已有 2 人，再找 2 人凑双打。球拍自带，球我出。',
    campus: '旗山校区',
    location: '体育馆 2 号场',
    latitude: 26.0578,
    longitude: 119.1948,
    start_time: at(2 * DAY + 3 * HOUR),
    end_time: at(2 * DAY + 5 * HOUR),
    skill_level: 'intermediate',
    capacity: 4,
    gender_limit: 'any',
    fee: 1500, // 15 元场地费
    status: 'full',
    organizer_id: 7,
    checkin_code: '6088',
    participants: [
      { user_id: 7, note: '' },
      { user_id: 2, note: '' },
      { user_id: 6, note: '' },
      { user_id: 1, note: '想练练' },
    ],
  },
  {
    id: 104,
    title: '足球 5v5，还差 3 人',
    sport: '足球',
    description: '人工草皮，穿碎钉。缺 3 人，位置随意，重在参与。',
    campus: '旗山校区',
    location: '人工草皮足球场',
    latitude: 26.0543,
    longitude: 119.1991,
    start_time: at(3 * DAY),
    end_time: at(3 * DAY + 2 * HOUR),
    skill_level: 'any',
    capacity: 10,
    gender_limit: 'any',
    fee: 500,
    status: 'open',
    organizer_id: 5,
    checkin_code: '2277',
    participants: [
      { user_id: 5, note: '' },
      { user_id: 3, note: '' },
      { user_id: 1, note: '' },
    ],
  },
  {
    id: 105,
    title: '乒乓球约练，晚上七点后',
    sport: '乒乓球',
    description: '体育馆乒乓球室，练球为主，不打比赛也行。',
    campus: '铜盘校区',
    location: '体育馆乒乓球室',
    latitude: 26.1021,
    longitude: 119.2413,
    start_time: at(4 * DAY + 2 * HOUR),
    end_time: at(4 * DAY + 4 * HOUR),
    skill_level: 'beginner',
    capacity: 4,
    gender_limit: 'any',
    fee: 0,
    status: 'open',
    organizer_id: 6,
    checkin_code: '4410',
    participants: [{ user_id: 6, note: '' }],
  },
  {
    id: 106,
    title: '游泳自由练习（限女生）',
    sport: '游泳',
    description: '校游泳馆，泳道自由练习，互相看护。',
    campus: '旗山校区',
    location: '校游泳馆',
    latitude: 26.0592,
    longitude: 119.1935,
    start_time: at(5 * DAY + 5 * HOUR),
    end_time: at(5 * DAY + 7 * HOUR),
    skill_level: 'any',
    capacity: 6,
    gender_limit: 'female',
    fee: 2000,
    status: 'open',
    organizer_id: 2,
    checkin_code: '7702',
    participants: [
      { user_id: 2, note: '' },
      { user_id: 7, note: '' },
    ],
  },
  {
    id: 107,
    title: '昨天那场篮球（已结束，用于评价演示）',
    sport: '篮球',
    description: '已经打完的一场，用来演示"结束后评价同场伙伴"。',
    campus: '旗山校区',
    location: '风雨操场 1 号场',
    latitude: 26.0565,
    longitude: 119.1966,
    start_time: at(-26 * HOUR),
    end_time: at(-24 * HOUR),
    skill_level: 'any',
    capacity: 6,
    gender_limit: 'any',
    fee: 0,
    status: 'finished',
    organizer_id: 1,
    checkin_code: '1359',
    participants: [
      { user_id: 1, note: '' },
      { user_id: 3, note: '' },
      { user_id: 5, note: '' },
      { user_id: 8, note: '' },
    ],
    /** 已结束活动的报名状态由下方 REGISTRATION_SEED 覆盖。 */
  },
  {
    id: 108,
    title: '周末骑行 · 旗山到鼓山',
    sport: '骑行',
    description: '往返约 40 公里，山地车优先，头盔必备。',
    campus: '旗山校区',
    location: '校门口广场',
    latitude: 26.0558,
    longitude: 119.1975,
    start_time: at(6 * DAY + 4 * HOUR),
    end_time: at(6 * DAY + 9 * HOUR),
    skill_level: 'advanced',
    capacity: 8,
    gender_limit: 'any',
    fee: 0,
    status: 'open',
    organizer_id: 4,
    checkin_code: '9081',
    participants: [
      { user_id: 4, note: '' },
      { user_id: 7, note: '' },
    ],
  },
  {
    id: 109,
    title: '今晚排球垫球练习（进行中）',
    sport: '排球',
    description: '正在进行的活动，用来演示签到窗口内的界面。',
    campus: '铜盘校区',
    location: '排球场 1 号',
    latitude: 26.1021,
    longitude: 119.2413,
    start_time: at(-40 * MIN),
    end_time: at(80 * MIN),
    skill_level: 'any',
    capacity: 12,
    gender_limit: 'any',
    fee: 0,
    status: 'ongoing',
    organizer_id: 7,
    checkin_code: '5521',
    participants: [
      { user_id: 7, note: '' },
      { user_id: 1, note: '' },
      { user_id: 6, note: '' },
      { user_id: 4, note: '' },
    ],
  },
]

/**
 * 报名记录种子：(活动, 用户) → 状态。
 * 只列"需要特殊状态"的，其余默认 registered。
 */
export const REGISTRATION_SEED = [
  // 已结束的那场：两人到场、一人爽约
  { activity_id: 107, user_id: 1, status: 'attended' },
  { activity_id: 107, user_id: 3, status: 'attended' },
  { activity_id: 107, user_id: 5, status: 'no_show' },
  { activity_id: 107, user_id: 8, status: 'attended' },
  // 进行中的那场：部分已签到
  { activity_id: 109, user_id: 7, status: 'checked_in', checkin_method: 'code' },
  { activity_id: 109, user_id: 4, status: 'checked_in', checkin_method: 'location' },
  // 满员的那场，本人已报名
  { activity_id: 103, user_id: 1, status: 'registered' },
  // 足球那场本人已报名
  { activity_id: 104, user_id: 1, status: 'registered' },
]

/* ---------------- 评价 ---------------- */

export const REVIEWS = [
  {
    id: 1,
    activity_id: 107,
    reviewer_id: 3,
    reviewee_id: 1,
    score: 5,
    tags: ['准时', '组织得力'],
    comment: '组织得挺好，场地和时间都提前说清楚了。',
    created_at: at(-23 * HOUR),
  },
  {
    id: 2,
    activity_id: 107,
    reviewer_id: 5,
    reviewee_id: 1,
    score: 4,
    tags: ['水平匹配'],
    comment: '打得不错，下次再来。',
    created_at: at(-22 * HOUR),
  },
  {
    id: 3,
    activity_id: 103,
    reviewer_id: 2,
    reviewee_id: 1,
    score: 5,
    tags: ['球风好', '乐于配合'],
    comment: '',
    created_at: at(-10 * DAY),
  },
  {
    id: 4,
    activity_id: 102,
    reviewer_id: 4,
    reviewee_id: 1,
    score: 5,
    tags: ['准时'],
    comment: '很准时。',
    created_at: at(-8 * DAY),
  },
  {
    id: 5,
    activity_id: 101,
    reviewer_id: 2,
    reviewee_id: 3,
    score: 4,
    tags: ['氛围好'],
    comment: '新手也挺积极。',
    created_at: at(-5 * DAY),
  },
]

/* ---------------- 派生：默认的报名状态 ---------------- */

export function defaultRegistration(activityId, userId) {
  return {
    id: activityId * 1000 + userId,
    activity_id: activityId,
    user_id: userId,
    status: 'registered',
    note: '',
    is_late_cancel: false,
    checked_in_at: null,
    checkin_method: null,
    checkin_distance_m: null,
    created_at: at(-3 * HOUR),
  }
}
