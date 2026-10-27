/**
 * 领域常量与展示映射（唯一取值来源）
 * ---------------------------------------------------------------------------
 * 这里刻意把"后端约定的枚举值"和"界面文案"分开：
 *   · 枚举对象（SKILL / ACT_STATUS / ...）用于代码判断，禁止在页面里写裸字符串；
 *   · *_TEXT 映射用于界面显示，文案统一改这里，页面不动。
 * 取值全部对照《前端对接文档》第六节。
 */

/* ---------------- 枚举 ---------------- */

/** 水平：注册资料与活动要求都用这一套。 */
export const SKILL = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  ANY: 'any',
}

/** 活动状态。 */
export const ACT_STATUS = {
  OPEN: 'open',
  FULL: 'full',
  ONGOING: 'ongoing',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
}

/** 报名/参与者状态。 */
export const REG_STATUS = {
  REGISTERED: 'registered',
  CHECKED_IN: 'checked_in',
  ATTENDED: 'attended',
  NO_SHOW: 'no_show',
  CANCELLED: 'cancelled',
}

/** 签到方式。 */
export const CHECKIN_METHOD = {
  CODE: 'code',
  LOCATION: 'location',
}

/* ---------------- 展示文案 ---------------- */

export const SKILL_TEXT = {
  [SKILL.BEGINNER]: '新手',
  [SKILL.INTERMEDIATE]: '一般',
  [SKILL.ADVANCED]: '熟练',
  [SKILL.ANY]: '不限水平',
}

export const SKILL_SHORT = {
  [SKILL.BEGINNER]: '新手',
  [SKILL.INTERMEDIATE]: '一般',
  [SKILL.ADVANCED]: '熟练',
  [SKILL.ANY]: '不限',
}

export const ACT_STATUS_TEXT = {
  [ACT_STATUS.OPEN]: '可报名',
  [ACT_STATUS.FULL]: '已满员',
  [ACT_STATUS.ONGOING]: '进行中',
  [ACT_STATUS.FINISHED]: '已结束',
  [ACT_STATUS.CANCELLED]: '已取消',
}

/** 状态 → 标签配色（对应 app.css 里的 .sm-tag--*）。 */
export const ACT_STATUS_TONE = {
  [ACT_STATUS.OPEN]: 'ok',
  [ACT_STATUS.FULL]: 'warn',
  [ACT_STATUS.ONGOING]: 'info',
  [ACT_STATUS.FINISHED]: '',
  [ACT_STATUS.CANCELLED]: 'danger',
}

export const REG_STATUS_TEXT = {
  [REG_STATUS.REGISTERED]: '已报名',
  [REG_STATUS.CHECKED_IN]: '已签到',
  [REG_STATUS.ATTENDED]: '已到场',
  [REG_STATUS.NO_SHOW]: '爽约',
  [REG_STATUS.CANCELLED]: '已取消',
}

export const REG_STATUS_TONE = {
  [REG_STATUS.REGISTERED]: 'ghost',
  [REG_STATUS.CHECKED_IN]: 'ok',
  [REG_STATUS.ATTENDED]: 'ok',
  [REG_STATUS.NO_SHOW]: 'danger',
  [REG_STATUS.CANCELLED]: '',
}

export const CHECKIN_METHOD_TEXT = {
  [CHECKIN_METHOD.CODE]: '签到码',
  [CHECKIN_METHOD.LOCATION]: '定位',
}

/* ---------------- 业务规则常量 ---------------- */
/* 后端硬编码的阈值，界面上要显式告诉用户，避免"莫名其妙被扣分"。 */

export const RULES = {
  /** 信用分低于该值无法报名新活动（后端 403）。 */
  MIN_CREDIT: 60,
  /** 新账号默认信用分。 */
  DEFAULT_CREDIT: 100,
  /** 开始前 N 小时内取消报名，扣 LATE_CANCEL_PENALTY 分。 */
  LATE_CANCEL_HOURS: 2,
  LATE_CANCEL_PENALTY: 5,
  /** 签到码位数。 */
  CODE_LENGTH: 4,
  /** 定位签到的最大距离（米）。 */
  CHECKIN_RADIUS_M: 300,
}

/** 常用校区（后端没有校区字典接口，这里作为输入建议）。 */
export const CAMPUS_OPTIONS = ['旗山校区', '铜盘校区', '怡山校区', '晋江校区', '厦门工艺美院']

/** 评价可选标签（后端未约束取值，属于前端建议项）。 */
export const REVIEW_TAGS = [
  '准时',
  '球风好',
  '水平匹配',
  '氛围好',
  '组织得力',
  '乐于配合',
  '下次还想一起',
]

/** 一句话找局的示例（放在输入框下方，降低使用门槛）。 */
export const NLP_EXAMPLES = [
  '今晚想在旗山校区打篮球，新手可以吗',
  '明早铜盘校区有跑步的吗',
  '这周末羽毛球，水平一般',
  '想找人打乒乓球，晚上七点后',
]

/* ---------------- 小工具 ---------------- */

export const skillText = (v) => SKILL_TEXT[v] ?? v ?? '不限'
export const actStatusText = (v) => ACT_STATUS_TEXT[v] ?? v ?? '—'
export const regStatusText = (v) => REG_STATUS_TEXT[v] ?? v ?? '—'

export const isOrganizer = (activity, me) =>
  Boolean(activity?.organizer?.id != null && me?.id != null && activity.organizer.id === me.id)

/** 剩余名额文案（口径：capacity 含发起人，与后端 slots_left 保持一致）。 */
export const seatsText = (activity) => {
  const left = Number(activity?.slots_left ?? 0)
  if (left > 0) return `还差 ${left} 人`
  return '名额已满'
}
