<!--
  SportMate 校园运动组局 · 前端起步页
  ---------------------------------------------------------------------------
  这是一个【已经接好后端】的最小可用应用，包含：
    · 注册 / 登录（token 自动管理）
    · 找局：一句话找局 + 活动列表（可筛选）
    · 发起活动（含签到码展示、签到、记录考勤）
    · 我的：信用分、我发起的、我报名的

  你的任务：把它改成你想要的样子 —— 加路由、加组件、改样式都随意，
  接口调用直接复用 src/api.js，不要自己重写请求层。

  后端地址在 src/api.js 顶部，本地开发就是 http://127.0.0.1:8000
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import api, { ApiError } from './api.js'

/* ==================================================================
   全局状态
   ================================================================== */
const loading = ref(false)
const message = ref('') // 操作成功提示
const error = ref('') // 错误提示（内容就是后端返回的中文说明）
const tab = ref('find') // find | mine

const me = ref(null)
const sports = ref([])
const activities = ref([])
const matches = ref([])
const myOrganized = ref([])
const myJoined = ref([])

/* 登录/注册表单 */
const authMode = ref('login')
const authForm = ref({ username: '', password: '', nickname: '' })

/* 找人/筛选 */
const sentence = ref('今晚想在旗山校区打篮球，新手可以吗')
const filters = ref({ sport: '', campus: '', skill_level: '', only_available: true })

/* 发起活动表单 */
const showCreate = ref(false)
const createForm = ref({
  title: '',
  sport: '篮球',
  campus: '旗山校区',
  location: '风雨操场',
  description: '',
  start_time: '',
  end_time: '',
  skill_level: 'any',
  capacity: 6,
  fee: 0,
})

/* 活动详情弹层 */
const detail = ref(null)

const isLoggedIn = computed(() => Boolean(me.value))

/* ==================================================================
   通用请求包装：统一 loading / 错误处理
   ================================================================== */
async function run(fn, successMsg = '') {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    await fn()
    if (successMsg) message.value = successMsg
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      if (e.isAuthError) me.value = null // 登录过期，回到登录页
    } else {
      error.value = '未知错误：' + e.message
    }
  } finally {
    loading.value = false
  }
}

/* ==================================================================
   认证
   ================================================================== */
const submitAuth = () =>
  run(async () => {
    if (authMode.value === 'login') {
      await api.login(authForm.value.username, authForm.value.password)
    } else {
      await api.register({
        username: authForm.value.username,
        password: authForm.value.password,
        nickname: authForm.value.nickname || authForm.value.username,
        skill_level: 'any',
      })
    }
    me.value = await api.getMe()
    authForm.value = { username: '', password: '', nickname: '' }
    await Promise.all([loadActivities(), loadMine()])
  }, authMode.value === 'login' ? '登录成功' : '注册成功')

const logout = () =>
  run(async () => {
    await api.logout()
    me.value = null
    myOrganized.value = []
    myJoined.value = []
    matches.value = []
  }, '已退出登录')

/* ==================================================================
   数据加载
   ================================================================== */
const loadSports = () =>
  run(async () => {
    sports.value = await api.getSports()
  })

const loadActivities = () =>
  run(async () => {
    const q = { limit: 30 }
    if (filters.value.sport) q.sport = filters.value.sport
    if (filters.value.campus) q.campus = filters.value.campus
    if (filters.value.skill_level) q.skill_level = filters.value.skill_level
    if (filters.value.only_available) q.only_available = true
    activities.value = await api.getActivities(q)
  })

const loadMine = () =>
  run(async () => {
    if (!isLoggedIn.value) return
    const res = await api.getMyActivities()
    myOrganized.value = res.organized
    myJoined.value = res.joined
  })

const findMatches = () =>
  run(async () => {
    const res = await api.matchBySentence(sentence.value)
    matches.value = res.items
    tab.value = 'find'
  })

/* ==================================================================
   活动操作
   ================================================================== */
const openDetail = (id) =>
  run(async () => {
    detail.value = await api.getActivity(id, true)
  })

const join = (id) =>
  run(async () => {
    await api.joinActivity(id, '')
    await Promise.all([loadActivities(), loadMine()])
    if (detail.value?.id === id) detail.value = await api.getActivity(id, true)
  }, '报名成功')

const leave = (id) =>
  run(async () => {
    const reg = await api.leaveActivity(id)
    if (reg.is_late_cancel) {
      error.value = '已取消报名。因距离活动开始不足 2 小时，你的信用分被扣了 5 分。'
    } else {
      message.value = '已取消报名'
    }
    await Promise.all([loadActivities(), loadMine()])
    if (detail.value?.id === id) detail.value = await api.getActivity(id, true)
  })

const submitCreate = () =>
  run(async () => {
    const f = createForm.value
    // 关键：用户填的是【本地时间】，后端要的是【UTC】。
    // toISOString() 会自动把本地时间转成 UTC 带 Z，不要手拼字符串。
    const created = await api.createActivity({
      title: f.title,
      sport: f.sport,
      campus: f.campus,
      location: f.location,
      description: f.description,
      start_time: new Date(f.start_time).toISOString(),
      end_time: new Date(f.end_time).toISOString(),
      skill_level: f.skill_level,
      capacity: Number(f.capacity),
      fee: Math.round(Number(f.fee) * 100), // 元 -> 分
    })
    showCreate.value = false
    // 创建接口不返回签到码，要再查一次详情
    detail.value = await api.getActivity(created.id, true)
    await Promise.all([loadActivities(), loadMine()])
  }, '活动已发布')

const cancelActivity = (id) =>
  run(async () => {
    await api.cancelActivity(id)
    detail.value = null
    await Promise.all([loadActivities(), loadMine()])
  }, '活动已取消')

/* 签到 */
const checkinCode = ref('')
const doCheckinByCode = (id) =>
  run(async () => {
    const res = await api.checkinWithCode(id, checkinCode.value)
    checkinCode.value = ''
    detail.value = await api.getActivity(id, true)
    message.value = res.message
  })

const doCheckinByLocation = (id) =>
  run(async () => {
    if (!navigator.geolocation) throw new ApiError('你的浏览器不支持定位', 0, null)
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
    )
    const res = await api.checkinWithLocation(id, pos.coords.latitude, pos.coords.longitude)
    detail.value = await api.getActivity(id, true)
    message.value = res.message
  })

/* 考勤：勾选到场者 */
const attendedIds = ref([])
const submitAttendance = (id) =>
  run(async () => {
    const res = await api.recordAttendance(id, attendedIds.value)
    attendedIds.value = []
    detail.value = await api.getActivity(id, true)
    await loadMine()
    message.value = `考勤已记录：到场 ${res.attended.length} 人，爽约 ${res.no_show.length} 人`
  })

/* ==================================================================
   工具函数
   ================================================================== */
/**
 * 后端返回的时间是【不带时区偏移的 UTC 串】，例如 "2026-10-12T06:14:07.169800"。
 * 必须补 'Z' 再解析，否则浏览器会当成本地时间，在中国会少显示 8 小时。
 */
function fmtTime(iso) {
  if (!iso) return ''
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  return new Date(hasZone ? iso : iso + 'Z').toLocaleString('zh-CN', { hour12: false })
}

const levelText = { beginner: '新手', intermediate: '一般', advanced: '熟练', any: '不限' }
const statusText = {
  open: '可报名',
  full: '已满员',
  ongoing: '进行中',
  finished: '已结束',
  cancelled: '已取消',
}
const participantText = {
  registered: '已报名',
  checked_in: '已签到',
  attended: '已到场',
  no_show: '爽约',
  cancelled: '已取消',
}

const isOrganizer = (a) => Boolean(me.value && a && a.organizer.id === me.value.id)
const inList = (list, id) => list.some((a) => a.id === id)
const feeText = (fee) => (fee > 0 ? `人均 ${(fee / 100).toFixed(2)} 元` : '免费')

/* ==================================================================
   初始化
   ================================================================== */
onMounted(async () => {
  await loadSports()
  if (api.tokenStore.has()) {
    try {
      me.value = await api.getMe()
      await loadMine()
    } catch {
      me.value = null
    }
  }
  await loadActivities()
})
</script>

<template>
  <div class="page">
    <header>
      <h1>🏀 SportMate</h1>
      <p class="sub">校园运动组局 —— 找到时间、水平、地点都合适的搭子</p>
    </header>

    <!-- 提示条 -->
    <p v-if="error" class="alert error">{{ error }}</p>
    <p v-if="message" class="alert ok">{{ message }}</p>

    <!-- ============ 未登录 ============ -->
    <section v-if="!isLoggedIn" class="card">
      <div class="tabs">
        <button :class="{ active: authMode === 'login' }" @click="authMode = 'login'">登录</button>
        <button :class="{ active: authMode === 'register' }" @click="authMode = 'register'">
          注册
        </button>
      </div>

      <label>用户名</label>
      <input v-model="authForm.username" placeholder="字母、数字、下划线，至少 3 位" />

      <label>密码</label>
      <input v-model="authForm.password" type="password" placeholder="至少 6 位" />

      <template v-if="authMode === 'register'">
        <label>昵称（可选）</label>
        <input v-model="authForm.nickname" placeholder="别人看到的名字" />
      </template>

      <button class="primary block" :disabled="loading" @click="submitAuth">
        {{ loading ? '处理中…' : authMode === 'login' ? '登录' : '注册并登录' }}
      </button>
      <p class="hint">
        注册后可以直接浏览活动；报名需要信用分 ≥ 60（新账号默认 100 分）。
      </p>
    </section>

    <!-- ============ 已登录 ============ -->
    <template v-else>
      <!-- 个人卡片 -->
      <section class="card me-card">
        <div>
          <strong>{{ me.nickname }}</strong>
          <span class="hint">　{{ me.campus }}</span>
        </div>
        <div class="score">
          信用分
          <b :class="{ danger: me.reliability_score < 60 }">{{ me.reliability_score }}</b>
          <span class="hint">（低于 60 无法报名）</span>
        </div>
        <div class="hint">
          完成 {{ me.completed_count }} 次 · 爽约 {{ me.no_show_count }} 次
          <template v-if="me.review_average">· 评价 {{ me.review_average }} 分</template>
        </div>
        <button @click="logout">退出</button>
      </section>

      <!-- 主标签 -->
      <div class="tabs main-tabs">
        <button :class="{ active: tab === 'find' }" @click="tab = 'find'">找局</button>
        <button :class="{ active: tab === 'mine' }" @click="tab = 'mine'; loadMine()">我的</button>
        <button class="right" @click="showCreate = !showCreate">
          {{ showCreate ? '收起' : '＋ 发起活动' }}
        </button>
      </div>

      <!-- ---------- 发起活动 ---------- -->
      <section v-if="showCreate" class="card">
        <h2>发起活动</h2>
        <div class="grid2">
          <div>
            <label>标题</label>
            <input v-model="createForm.title" placeholder="例如：周三晚篮球 3v3" />
          </div>
          <div>
            <label>运动项目</label>
            <select v-model="createForm.sport">
              <option v-for="s in sports" :key="s.id" :value="s.name">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label>开始时间</label>
            <input v-model="createForm.start_time" type="datetime-local" />
          </div>
          <div>
            <label>结束时间</label>
            <input v-model="createForm.end_time" type="datetime-local" />
          </div>
          <div>
            <label>校区</label>
            <input v-model="createForm.campus" />
          </div>
          <div>
            <label>具体地点</label>
            <input v-model="createForm.location" placeholder="例如：风雨操场 3 号场" />
          </div>
          <div>
            <label>水平要求</label>
            <select v-model="createForm.skill_level">
              <option value="any">不限</option>
              <option value="beginner">新手</option>
              <option value="intermediate">一般</option>
              <option value="advanced">熟练</option>
            </select>
          </div>
          <div>
            <label>人数上限</label>
            <input v-model="createForm.capacity" type="number" min="2" max="100" />
          </div>
          <div>
            <label>人均费用（元，0 为免费）</label>
            <input v-model="createForm.fee" type="number" min="0" step="0.5" />
          </div>
          <div>
            <label>说明</label>
            <input v-model="createForm.description" placeholder="缺几人、注意事项…" />
          </div>
        </div>
        <button class="primary" :disabled="loading" @click="submitCreate">发布活动</button>
      </section>

      <!-- ---------- 找局 ---------- -->
      <template v-if="tab === 'find'">
        <section class="card">
          <h2>一句话找局</h2>
          <div class="row">
            <input v-model="sentence" @keyup.enter="findMatches" />
            <button class="primary" :disabled="loading" @click="findMatches">找局</button>
          </div>
          <p class="hint">
            支持自然语言，例如「今晚想在旗山校区打篮球，新手可以吗」——会自动识别项目、校区、水平。
          </p>

          <ul v-if="matches.length" class="list">
            <li v-for="m in matches" :key="m.activity.id">
              <div class="li-head">
                <b>{{ m.activity.title }}</b>
                <span class="tag">{{ m.activity.sport }}</span>
                <span class="tag">{{ levelText[m.activity.skill_level] }}</span>
                <span class="tag score-tag">匹配度 {{ m.score }}</span>
              </div>
              <div class="hint">
                {{ fmtTime(m.activity.start_time) }} · {{ m.activity.campus }}
                {{ m.activity.location }} · 还差 {{ m.activity.slots_left }} 人 ·
                {{ feeText(m.activity.fee) }}
              </div>
              <!-- reason 可以直接用来显示"为什么推荐" -->
              <div class="reasons">
                <span v-if="m.reason.sport" class="tag ok-tag">项目匹配</span>
                <span v-if="m.reason.skill" class="tag ok-tag">水平合适</span>
                <span v-if="m.reason.campus" class="tag ok-tag">同校区</span>
                <span v-if="m.reason.distance_km != null" class="tag ok-tag">
                  距离 {{ m.reason.distance_km }} km
                </span>
              </div>
              <div class="row">
                <button @click="openDetail(m.activity.id)">详情</button>
                <button
                  class="primary"
                  :disabled="loading || m.activity.slots_left === 0"
                  @click="join(m.activity.id)"
                >
                  报名
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <h2>活动列表</h2>
          <div class="filters">
            <select v-model="filters.sport" @change="loadActivities">
              <option value="">全部项目</option>
              <option v-for="s in sports" :key="s.id" :value="s.name">{{ s.name }}</option>
            </select>
            <select v-model="filters.skill_level" @change="loadActivities">
              <option value="">不限水平</option>
              <option value="beginner">新手</option>
              <option value="intermediate">一般</option>
              <option value="advanced">熟练</option>
            </select>
            <label class="inline">
              <input
                v-model="filters.only_available"
                type="checkbox"
                style="width: auto"
                @change="loadActivities"
              />
              只看还有空位的
            </label>
            <button @click="loadActivities">刷新</button>
          </div>

          <ul v-if="activities.length" class="list">
            <li v-for="a in activities" :key="a.id">
              <div class="li-head">
                <b>{{ a.title }}</b>
                <span class="tag">{{ a.sport }}</span>
                <span class="tag" :class="{ 'warn-tag': a.status === 'full' }">
                  {{ statusText[a.status] }}
                </span>
                <span class="tag">{{ levelText[a.skill_level] }}</span>
              </div>
              <div class="hint">
                {{ fmtTime(a.start_time) }} · {{ a.campus }} {{ a.location }} ·
                {{ a.joined_count }}/{{ a.capacity }} 人 · {{ feeText(a.fee) }}
              </div>
              <div class="hint">
                发起人 {{ a.organizer.nickname }}（信用分 {{ a.organizer.reliability_score }}）
              </div>
              <div class="row">
                <button @click="openDetail(a.id)">详情</button>
                <button
                  class="primary"
                  :disabled="loading || a.slots_left === 0"
                  @click="join(a.id)"
                >
                  {{ a.slots_left === 0 ? '已满员' : '报名' }}
                </button>
                <button
                  v-if="inList(myJoined, a.id)"
                  :disabled="loading"
                  @click="leave(a.id)"
                >
                  取消报名
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">没有符合条件的活动，换个筛选条件试试。</p>
        </section>
      </template>

      <!-- ---------- 我的 ---------- -->
      <template v-else>
        <section class="card">
          <h2>我发起的（{{ myOrganized.length }}）</h2>
          <ul v-if="myOrganized.length" class="list">
            <li v-for="a in myOrganized" :key="a.id">
              <div class="li-head">
                <b>{{ a.title }}</b>
                <span class="tag">{{ a.sport }}</span>
                <span class="tag">{{ statusText[a.status] }}</span>
              </div>
              <div class="hint">
                {{ fmtTime(a.start_time) }} · {{ a.joined_count }}/{{ a.capacity }} 人
              </div>
              <div class="row">
                <button @click="openDetail(a.id)">详情 / 签到码 / 考勤</button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">还没有发起过活动。</p>
        </section>

        <section class="card">
          <h2>我报名的（{{ myJoined.length }}）</h2>
          <ul v-if="myJoined.length" class="list">
            <li v-for="a in myJoined" :key="a.id">
              <div class="li-head">
                <b>{{ a.title }}</b>
                <span class="tag">{{ a.sport }}</span>
                <span class="tag">{{ statusText[a.status] }}</span>
              </div>
              <div class="hint">{{ fmtTime(a.start_time) }} · {{ a.location }}</div>
              <div class="row">
                <button @click="openDetail(a.id)">详情 / 签到</button>
                <button :disabled="loading" @click="leave(a.id)">取消报名</button>
              </div>
            </li>
          </ul>
          <p v-else class="hint">还没有报名任何活动。</p>
        </section>
      </template>
    </template>

    <!-- ============ 活动详情弹层 ============ -->
    <div v-if="detail" class="overlay" @click.self="detail = null">
      <div class="modal">
        <div class="modal-head">
          <h2>{{ detail.title }}</h2>
          <button @click="detail = null">关闭</button>
        </div>

        <p class="hint">
          <span class="tag">{{ detail.sport }}</span>
          <span class="tag">{{ levelText[detail.skill_level] }}</span>
          <span class="tag">{{ statusText[detail.status] }}</span>
        </p>

        <ul class="facts">
          <li>时间：{{ fmtTime(detail.start_time) }} ~ {{ fmtTime(detail.end_time) }}</li>
          <li>地点：{{ detail.campus }} {{ detail.location }}</li>
          <li>
            人数：{{ detail.joined_count }}/{{ detail.capacity }}（还差 {{ detail.slots_left }} 人）
          </li>
          <li>费用：{{ feeText(detail.fee) }}</li>
          <li>发起人：{{ detail.organizer.nickname }}（信用分 {{ detail.organizer.reliability_score }}）</li>
          <li v-if="detail.description">说明：{{ detail.description }}</li>
        </ul>

        <!-- 发起人专属：签到码 + 考勤 -->
        <template v-if="isOrganizer(detail)">
          <div class="panel">
            <h3>签到码</h3>
            <p class="code">{{ detail.checkin_code || '—' }}</p>
            <p class="hint">把这个 4 位数字念给到场的人，他们在自己手机上输入即可签到。</p>
            <button :disabled="loading" @click="cancelActivity(detail.id)">取消活动</button>
          </div>

          <div class="panel">
            <h3>记录考勤</h3>
            <p class="hint">勾选【实际到场】的人，未勾选的会被记为爽约并扣 15 分信用分。</p>
            <div v-for="p in detail.participants" :key="p.user_id" class="check-row">
              <label class="inline">
                <input
                  v-model="attendedIds"
                  type="checkbox"
                  style="width: auto"
                  :value="p.user_id"
                />
                {{ p.nickname }}（信用分 {{ p.reliability_score }} · {{ participantText[p.status] }}）
              </label>
            </div>
            <button class="primary" :disabled="loading" @click="submitAttendance(detail.id)">
              提交考勤
            </button>
          </div>
        </template>

        <!-- 其他人：签到入口 -->
        <div v-else-if="inList(myJoined, detail.id)" class="panel">
          <h3>签到</h3>
          <div class="row">
            <input v-model="checkinCode" placeholder="输入 4 位签到码" maxlength="8" />
            <button class="primary" :disabled="loading" @click="doCheckinByCode(detail.id)">
              签到
            </button>
            <button :disabled="loading" @click="doCheckinByLocation(detail.id)">用定位签到</button>
          </div>
          <p class="hint">定位签到需要你在活动地点 300 米内，且浏览器已授权定位。</p>
        </div>

        <!-- 参与者名单 -->
        <h3>参与者（{{ detail.participants.length }}）</h3>
        <ul v-if="detail.participants.length" class="facts">
          <li v-for="p in detail.participants" :key="p.user_id">
            {{ p.nickname }} · {{ levelText[p.skill_level] }} · 信用分 {{ p.reliability_score }} ·
            <b>{{ participantText[p.status] }}</b>
            <span v-if="p.note" class="hint">（{{ p.note }}）</span>
          </li>
        </ul>
        <p v-else class="hint">还没有人报名，你可以先转发给同学。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 860px;
  margin: 0 auto;
  padding: 20px 16px 60px;
}
header h1 {
  margin: 0;
  font-size: 24px;
}
.sub {
  color: #6b7280;
  margin: 4px 0 18px;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
h2 {
  font-size: 16px;
  margin: 0 0 12px;
}
h3 {
  font-size: 14px;
  margin: 16px 0 8px;
}
label {
  display: block;
  font-size: 13px;
  color: #4b5563;
  margin: 10px 0 4px;
}
label.inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 640px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
.block {
  width: 100%;
  margin-top: 16px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.tabs button.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.main-tabs .right {
  margin-left: auto;
}
.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.filters select,
.filters input {
  width: auto;
  min-width: 120px;
}
.alert {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.alert.error {
  background: #fdecef;
  border: 1px solid #f5c2c7;
  color: #b00020;
}
.alert.ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #047857;
}
.hint {
  color: #6b7280;
  font-size: 12.5px;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list li {
  border-top: 1px solid #f0f1f3;
  padding: 12px 0;
}
.li-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tag {
  display: inline-block;
  background: #eef2ff;
  color: #374151;
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 12px;
}
.ok-tag {
  background: #ecfdf5;
  color: #047857;
}
.warn-tag {
  background: #fef3c7;
  color: #92400e;
}
.score-tag {
  background: #ede9fe;
  color: #5b21b6;
}
.reasons {
  margin-top: 4px;
}
.me-card {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}
.me-card > button {
  margin-left: auto;
}
.score b {
  font-size: 18px;
  color: #047857;
}
.score b.danger {
  color: #b00020;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
  overflow-y: auto;
  z-index: 50;
}
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  max-width: 620px;
  width: 100%;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.modal-head h2 {
  margin: 0;
}
.facts {
  list-style: none;
  padding: 0;
  margin: 6px 0;
  font-size: 13.5px;
}
.facts li {
  padding: 3px 0;
}
.panel {
  border: 1px solid #e5e7eb;
  background: #fafafa;
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
}
.code {
  font-size: 30px;
  letter-spacing: 8px;
  font-weight: 700;
  margin: 4px 0;
  color: #2563eb;
}
.check-row {
  padding: 4px 0;
  font-size: 13.5px;
}
</style>
