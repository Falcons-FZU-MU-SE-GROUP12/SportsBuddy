/**
 * P-03 活动列表
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities（支持 sport / campus / skill_level / status /
 *           date_from / date_to / only_available / limit / offset）
 * 分页用「加载更多」而不是页码，因为移动端更适合"一屏一屏往下拉"。
 */

import { api } from '../api/index.js'
import {
  activityCard,
  activitySkeleton,
  alert,
  appBar,
  button,
  chipRow,
  empty,
  tabBar,
} from '../shared/components.js'
import { CAMPUS_OPTIONS, ACT_STATUS, ACT_STATUS_TEXT, SKILL, SKILL_TEXT } from '../shared/domain.js'
import { toBackendUtc } from '../shared/format.js'
import { navigate } from '../router.js'
import { TABS, clearFlash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

const PAGE_SIZE = 8

/**
 * 「只看还有空位」为什么在前端过滤，而不是丢给后端的 only_available：
 * 后端的 only_available 是先按 limit/offset 取一页、再在内存里筛掉满员的活动
 * （services.list_activities），所以一页里被筛掉几条，这一页就只剩几条；
 * 前端拿 `返回条数 < PAGE_SIZE` 判断"没有更多"，列表会提前停在第三屏。
 * 这里改成：请求照常拿满一页，前端按 slots_left 过滤，游标始终等于服务端偏移。
 * 后端那处过滤顺序已作为 DEF-01 报给后端组，修好后本函数可以直接删掉。
 */
function isAvailable(activity) {
  return (
    (activity.status === ACT_STATUS.OPEN || activity.status === ACT_STATUS.ONGOING) &&
    Number(activity.slots_left) > 0
  )
}

/** 合并新一页并按 id 去重：活动时间相同的两条记录在 offset 分页下可能重复出现。 */
function mergeById(prev, next) {
  const seen = new Set(prev.map((a) => a.id))
  return prev.concat(next.filter((a) => !seen.has(a.id)))
}

export function create() {
  const state = {
    filters: {
      sport: '',
      campus: '',
      skill_level: '',
      status: ACT_STATUS.OPEN,
      only_available: true,
      date: '', // '' | today | tomorrow | week
    },
    items: [],
    offset: 0,
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: '',
    // 请求令牌：快速连续点筛选芯片时会同时发出多个 GET /activities，
    // 慢的旧请求可能最后才回来、把新筛选的结果覆盖掉（stale-response 竞态）。
    // 每次 load() 自增，响应回来时只有最新令牌的结果才允许写入 state。
    reqId: 0,
  }

  let me = store.me

  /**
   * 把界面上的筛选状态翻译成后端查询参数。
   *
   * 时间参数为什么是"不带 Z 的 UTC 串"：后端把 start_time 以 naive UTC 存库
   * （services 里 `ensure_aware_utc(...).replace(tzinfo=None)`），查询时又直接拿
   * `Activity.start_time >= date_from` 比较；一旦传带 +00:00 的串，SQLite 会按字符串
   * 比大小，"今天"这一整天都会被判成"早于下限"而查不出来（DEF-02）。
   * 这里统一走 format.js 的 toBackendUtc()：先按本地日历算出当天 0 点 / 24 点，
   * 再转成 naive UTC，和后端的存储格式对齐。
   */
  function buildQuery(offset = 0) {
    const q = { limit: PAGE_SIZE, offset }
    const f = state.filters
    if (f.sport) q.sport = f.sport
    if (f.campus) q.campus = f.campus
    if (f.skill_level) q.skill_level = f.skill_level
    if (f.status) q.status = f.status
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (f.date === 'today') {
      q.date_from = toBackendUtc(startOfDay(now))
      q.date_to = toBackendUtc(new Date(startOfDay(now).getTime() + 86400000))
    } else if (f.date === 'tomorrow') {
      const t = new Date(startOfDay(now).getTime() + 86400000)
      q.date_from = toBackendUtc(t)
      q.date_to = toBackendUtc(new Date(t.getTime() + 86400000))
    } else if (f.date === 'week') {
      q.date_from = toBackendUtc(now)
      q.date_to = toBackendUtc(new Date(now.getTime() + 7 * 86400000))
    }
    return q
  }

  async function load() {
    clearFlash()
    const reqId = ++state.reqId
    state.loading = true
    state.error = ''
    rerender()
    try {
      const list = await api.getActivities(buildQuery(0))
      if (reqId !== state.reqId) return // 旧请求的响应，丢弃
      state.offset = list.length
      state.hasMore = list.length === PAGE_SIZE
      state.items = state.filters.only_available ? list.filter(isAvailable) : list
    } catch (err) {
      if (reqId !== state.reqId) return
      state.error = err?.message ?? '加载失败'
      state.items = []
      state.hasMore = false
    } finally {
      if (reqId === state.reqId) {
        state.loading = false
        rerender()
      }
    }
  }

  async function loadMore() {
    if (state.loadingMore || !state.hasMore) return
    const reqId = ++state.reqId
    state.loadingMore = true
    rerender()
    try {
      const list = await api.getActivities(buildQuery(state.offset))
      if (reqId !== state.reqId) return
      state.offset += list.length
      state.hasMore = list.length === PAGE_SIZE
      const page = state.filters.only_available ? list.filter(isAvailable) : list
      state.items = mergeById(state.items, page)
    } catch (err) {
      if (reqId !== state.reqId) return
      state.error = err?.message ?? '加载更多失败'
    } finally {
      if (reqId === state.reqId) {
        state.loadingMore = false
        rerender()
      }
    }
  }

  async function join(id) {
    state.error = ''
    try {
      await api.joinActivity(id, '')
      me = store.me ? await api.getMe() : null
      await load()
    } catch (err) {
      state.error = err?.message ?? '报名失败'
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
        return
      }
      rerender()
    }
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  function appBarOf() {
    return appBar({
      title: '活动列表',
      sub: state.loading ? '加载中…' : `共 ${state.items.length} 条${state.hasMore ? '+' : ''}`,
      right: store.me
        ? `<button class="sm-btn sm-btn--sm" type="button" data-action="go-new">＋ 发起</button>`
        : '',
    })
  }

  const activeFilterCount = () =>
    [state.filters.sport, state.filters.campus, state.filters.skill_level, state.filters.date].filter(Boolean).length

  function view() {
    return `<main class="sm-main sm-stack">
      <section>
        ${chipRow({
          name: 'sport',
          value: state.filters.sport,
          options: [
            { value: '', label: '全部项目' },
            ...store.sports.map((s) => ({ value: s.name, label: `${s.icon} ${s.name}` })),
          ],
        })}
        ${chipRow({
          name: 'status',
          value: state.filters.status,
          options: [
            { value: '', label: '不限状态' },
            { value: ACT_STATUS.OPEN, label: ACT_STATUS_TEXT[ACT_STATUS.OPEN] },
            { value: ACT_STATUS.FULL, label: ACT_STATUS_TEXT[ACT_STATUS.FULL] },
            { value: ACT_STATUS.ONGOING, label: ACT_STATUS_TEXT[ACT_STATUS.ONGOING] },
            { value: ACT_STATUS.FINISHED, label: ACT_STATUS_TEXT[ACT_STATUS.FINISHED] },
          ],
          mini: true,
        })}
        ${chipRow({
          name: 'date',
          value: state.filters.date,
          options: [
            { value: '', label: '不限时间' },
            { value: 'today', label: '今天' },
            { value: 'tomorrow', label: '明天' },
            { value: 'week', label: '近 7 天' },
          ],
          mini: true,
        })}
        ${chipRow({
          name: 'campus',
          value: state.filters.campus,
          options: [{ value: '', label: '全部校区' }, ...CAMPUS_OPTIONS.map((c) => ({ value: c, label: c }))],
          mini: true,
        })}
        ${chipRow({
          name: 'skill_level',
          value: state.filters.skill_level,
          options: [
            { value: '', label: '不限水平' },
            { value: SKILL.BEGINNER, label: SKILL_TEXT[SKILL.BEGINNER] },
            { value: SKILL.INTERMEDIATE, label: SKILL_TEXT[SKILL.INTERMEDIATE] },
            { value: SKILL.ADVANCED, label: SKILL_TEXT[SKILL.ADVANCED] },
          ],
          mini: true,
        })}

        <div class="sm-row sm-row--between" style="margin-top:8px">
          <label class="sm-check">
            <input type="checkbox" name="only_available" ${state.filters.only_available ? 'checked' : ''}
              data-action="toggle-available" />
            只看还有空位
          </label>
          ${
            activeFilterCount() || !state.filters.only_available
              ? button('重置筛选', { action: 'reset', size: 'sm', variant: 'ghost' })
              : ''
          }
        </div>
      </section>

      ${state.error ? alert('error', state.error) : ''}

      ${
        state.loading
          ? `<div class="sm-stack">${activitySkeleton()}${activitySkeleton()}${activitySkeleton()}</div>`
          : state.items.length
            ? `<section class="sm-stack">
                 ${state.items.map((a) => activityCard(a)).join('')}
                 <div style="text-align:center;padding:6px 0">
                   ${
                     state.hasMore
                       ? button(state.loadingMore ? '加载中…' : '加载更多', {
                           action: 'more',
                           variant: 'ghost',
                           block: true,
                           disabled: state.loadingMore,
                         })
                       : `<span class="sm-card__hint">已经到底了 · 共 ${state.items.length} 条</span>`
                   }
                 </div>
               </section>`
            : state.hasMore
              ? // 这一页的活动都被「只看还有空位」筛掉了，不能显示"没有符合条件的活动"，
                // 否则用户会以为真的没有数据、直接退出（P-03 的可达性问题）。
                `<section class="sm-stack">
                   ${alert('info', '这一页的活动都已经满员了，可以继续往下看看。')}
                   <div style="text-align:center;padding:6px 0">
                     ${button(state.loadingMore ? '加载中…' : '加载更多', {
                       action: 'more',
                       variant: 'ghost',
                       block: true,
                       disabled: state.loadingMore,
                     })}
                   </div>
                 </section>`
              : empty({
                  icon: '🔍',
                  title: '没有符合条件的活动',
                  desc: '试试把状态改成「不限状态」或者清掉部分筛选条件。',
                  action: button('重置筛选', { action: 'reset', variant: 'primary' }),
                })
      }

      ${tabBar('activities', TABS)}
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      filter(ctx) {
        state.filters[ctx.data.name] = ctx.data.value
        return load()
      },
      'toggle-available'() {
        state.filters.only_available = !state.filters.only_available
        return load()
      },
      reset() {
        state.filters = {
          sport: '',
          campus: '',
          skill_level: '',
          status: ACT_STATUS.OPEN,
          only_available: true,
          date: '',
        }
        return load()
      },
      more() {
        return loadMore()
      },
      join(ctx) {
        return join(Number(ctx.data.id))
      },
      'open-activity'(ctx) {
        navigate('activity', { id: ctx.data.id })
      },
      'go-new'() {
        if (!store.me) return navigate('login')
        navigate('activity-new')
      },
      nav(ctx) {
        clearFlash()
        location.hash = ctx.data.href
      },
      back() {
        navigate('discover')
      },
    },
  }
}
