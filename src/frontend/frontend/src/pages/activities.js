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
import { navigate } from '../router.js'
import { TABS, clearFlash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

const PAGE_SIZE = 8

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
  }

  let me = store.me

  /** 把界面上的筛选状态翻译成后端查询参数。 */
  function buildQuery(offset = 0) {
    const q = { limit: PAGE_SIZE, offset }
    const f = state.filters
    if (f.sport) q.sport = f.sport
    if (f.campus) q.campus = f.campus
    if (f.skill_level) q.skill_level = f.skill_level
    if (f.status) q.status = f.status
    if (f.only_available) q.only_available = true
    // 时间范围：用本地时间算出当天的起止，再转 UTC 带偏移（后端接受带偏移的 ISO）
    const now = new Date()
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (f.date === 'today') {
      q.date_from = startOfDay(now).toISOString()
      q.date_to = new Date(startOfDay(now).getTime() + 86400000).toISOString()
    } else if (f.date === 'tomorrow') {
      const t = new Date(startOfDay(now).getTime() + 86400000)
      q.date_from = t.toISOString()
      q.date_to = new Date(t.getTime() + 86400000).toISOString()
    } else if (f.date === 'week') {
      q.date_from = now.toISOString()
      q.date_to = new Date(now.getTime() + 7 * 86400000).toISOString()
    }
    return q
  }

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      const list = await api.getActivities(buildQuery(0))
      state.items = list
      state.offset = list.length
      state.hasMore = list.length === PAGE_SIZE
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.items = []
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function loadMore() {
    if (state.loadingMore || !state.hasMore) return
    state.loadingMore = true
    rerender()
    try {
      const list = await api.getActivities(buildQuery(state.offset))
      state.items = state.items.concat(list)
      state.offset += list.length
      state.hasMore = list.length === PAGE_SIZE
    } catch (err) {
      state.error = err?.message ?? '加载更多失败'
    } finally {
      state.loadingMore = false
      rerender()
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
