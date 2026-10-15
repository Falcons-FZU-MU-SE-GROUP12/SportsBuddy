/**
 * P-02 找局（首页）
 * ---------------------------------------------------------------------------
 * 三个层次，按"用户心里想得有多清楚"排列：
 *   1. 一句话找局   → GET /match/parse（自然语言）
 *   2. 条件筛选匹配 → GET /match（结构化 + 为什么推荐）
 *   3. 最新活动流   → GET /activities
 * 报名/取消都在卡片上直接完成（POST/DELETE /activities/{id}/join）。
 */

import { api } from '../api/index.js'
import {
  activityCard,
  activitySkeleton,
  alert,
  appBar,
  button,
  chipRow,
  creditCard,
  empty,
  nlpBox,
  tabBar,
} from '../shared/components.js'
import { esc } from '../shared/format.js'
import { CAMPUS_OPTIONS, NLP_EXAMPLES, RULES, SKILL, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { TABS, clearFlash, flash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create() {
  const state = {
    sentence: NLP_EXAMPLES[0],
    loading: false,
    matching: false,
    error: '',
    /** 结构化筛选条件（发给 /match） */
    filters: { sport: '', campus: '', skill_level: '', only_available: true },
    /** 自然语言解析出的条件，用于在界面上回显"我听懂了什么" */
    parsed: null,
    matches: null,
    recent: [],
  }

  let me = store.me

  async function loadRecent() {
    state.recent = await api.getActivities({ limit: 6, only_available: state.filters.only_available, sport: state.filters.sport || undefined, campus: state.filters.campus || undefined, skill_level: state.filters.skill_level || undefined })
  }

  async function load() {
    state.error = ''
    clearFlash()
    try {
      await loadRecent()
    } catch (err) {
      state.error = err?.message ?? '加载失败'
    }
  }

  async function runMatch() {
    if (!state.sentence.trim()) {
      state.error = '先写一句你想找什么，例如「今晚想在旗山校区打篮球，新手可以吗」。'
      rerender()
      return
    }
    state.matching = true
    state.error = ''
    rerender()
    try {
      const res = await api.matchBySentence(state.sentence.trim(), 8)
      state.matches = res.items ?? []
      state.parsed = res.query ?? null
      if (!state.matches.length) flash('info', '没找到符合条件的活动，试试换个项目或放宽水平。')
    } catch (err) {
      state.error = err?.message ?? '匹配失败'
      state.matches = null
    } finally {
      state.matching = false
      rerender()
    }
  }

  async function runFilterMatch() {
    state.matching = true
    state.error = ''
    state.parsed = null
    rerender()
    try {
      const q = {}
      if (state.filters.sport) q.sport = state.filters.sport
      if (state.filters.campus) q.campus = state.filters.campus
      if (state.filters.skill_level) q.skill_level = state.filters.skill_level
      const res = await api.match(q)
      state.matches = res.items ?? []
    } catch (err) {
      state.error = err?.message ?? '匹配失败'
    } finally {
      state.matching = false
      rerender()
    }
  }

  async function join(id) {
    state.loading = true
    state.error = ''
    rerender()
    try {
      await api.joinActivity(id, '')
      me = store.me ? await api.getMe() : null
      flash('ok', '报名成功，记得按时到场、到场后签到。')
      await refreshAll()
    } catch (err) {
      // 409 冲突 / 403 信用分不足：直接用后端中文提示
      state.error = err?.message ?? '报名失败'
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
      }
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function refreshAll() {
    await loadRecent()
    if (state.matches) {
      // 报名后重新算一次，避免名额数字不动
      if (state.parsed) {
        const res = await api.matchBySentence(state.sentence.trim(), 8)
        state.matches = res.items ?? []
      } else {
        await runFilterMatchSilent()
      }
    }
  }

  async function runFilterMatchSilent() {
    const q = {}
    if (state.filters.sport) q.sport = state.filters.sport
    if (state.filters.campus) q.campus = state.filters.campus
    if (state.filters.skill_level) q.skill_level = state.filters.skill_level
    const res = await api.match(q)
    state.matches = res.items ?? []
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  /* ---------------- 文案 ---------------- */

  const parsedText = () => {
    if (!state.parsed) return ''
    const bits = []
    if (state.parsed.sport) bits.push(`项目「${state.parsed.sport}」`)
    if (state.parsed.campus) bits.push(`校区「${state.parsed.campus}」`)
    if (state.parsed.skill_level) bits.push(`水平「${SKILL_TEXT[state.parsed.skill_level]}」`)
    return bits.length ? `已识别：${bits.join('、')}` : '没识别出具体条件，先按时间推给你'
  }

  function appBarOf() {
    return appBar({
      brand: true,
      right: me
        ? `<button class="sm-btn sm-btn--sm" type="button" data-action="go-new">＋ 发起</button>`
        : `<button class="sm-btn sm-btn--sm" type="button" data-action="go-login">登录</button>`,
    })
  }

  function view() {
    if (!me) {
      // 未登录也能浏览，只是不能报名
      return `<main class="sm-main sm-stack">
        <section class="sm-card sm-card--brand">
          <h2 style="font-size:19px;font-weight:700;letter-spacing:-0.02em">找搭子，不用再群里喊半天</h2>
          <p class="sm-card__hint" style="margin-top:6px;font-size:13px">
            一句话说清项目、校区、水平，系统挑出最合适的活动；报名后到场扫码签到，爽约才扣信用分。
          </p>
          <div class="sm-row" style="margin-top:14px">
            ${button('登录 / 注册', { action: 'go-login', variant: 'primary' })}
            ${button('先随便看看', { action: 'scroll-list' })}
          </div>
        </section>

        <form data-action="match" data-enter>
          ${nlpBox({ value: state.sentence, examples: NLP_EXAMPLES.slice(0, 3) })}
        </form>

        ${state.error ? alert('error', state.error) : ''}
        ${state.matching ? `<div class="sm-stack">${activitySkeleton()}${activitySkeleton()}</div>` : ''}
        ${
          state.matches
            ? state.matches.length
              ? `<section class="sm-stack">
                   <div class="sm-row sm-row--between">
                     <h3 class="sm-card__title" style="margin:0">为你找到 ${state.matches.length} 个活动</h3>
                     <span class="sm-card__hint">${esc(parsedText())}</span>
                   </div>
                   ${state.matches.map((m) => activityCard(m.activity, { score: m.score, reasons: m.reason })).join('')}
                 </section>`
              : empty({ icon: '🔍', title: '没有匹配的活动', desc: '换个项目、或者把水平要求放宽一点试试。' })
            : ''
        }

        <section class="sm-stack">
          <h3 class="sm-card__title" style="margin:0">最近的活动</h3>
          ${
            state.recent.length
              ? state.recent.map((a) => activityCard(a)).join('')
              : empty({ icon: '📭', title: '还没有活动', desc: '成为第一个发起活动的人。' })
          }
        </section>

        ${tabBar('discover', TABS)}
      </main>`
    }

    return `<main class="sm-main sm-stack">
      ${creditCard(me)}

      <form data-action="match" data-enter>
        ${nlpBox({ value: state.sentence, examples: NLP_EXAMPLES })}
      </form>

      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}
      ${state.error ? alert('error', state.error) : ''}

      ${
        state.matching
          ? `<div class="sm-stack">${activitySkeleton()}${activitySkeleton()}</div>`
          : state.matches
            ? `<section class="sm-stack">
                 <div class="sm-row sm-row--between">
                   <h3 class="sm-card__title" style="margin:0">为你找到 ${state.matches.length} 个</h3>
                   ${button('清空结果', { action: 'clear-matches', size: 'sm', variant: 'ghost' })}
                 </div>
                 <p class="sm-card__hint" style="margin:-6px 0 0">${esc(parsedText())}</p>
                 ${
                   state.matches.length
                     ? state.matches.map((m) => activityCard(m.activity, { score: m.score, reasons: m.reason })).join('')
                     : empty({ icon: '🔍', title: '没有匹配的活动', desc: '换个说法试试，或者放宽水平要求。' })
                 }
               </section>`
            : ''
      }

      <section>
        <h3 class="sm-card__title">按条件筛</h3>
        ${chipRow({
          name: 'sport',
          value: state.filters.sport,
          options: [{ value: '', label: '全部项目' }, ...store.sports.map((s) => ({ value: s.name, label: `${s.icon} ${s.name}` }))],
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
        <div class="sm-row" style="margin-top:10px">
          ${button('按条件匹配', { action: 'filter-match', variant: 'accent', size: 'sm' })}
          <label class="sm-check">
            <input type="checkbox" name="only_available" ${state.filters.only_available ? 'checked' : ''}
              data-action="toggle-available" />
            只看还有空位
          </label>
        </div>
      </section>

      <section id="recent" class="sm-stack">
        <div class="sm-row sm-row--between">
          <h3 class="sm-card__title" style="margin:0">最近的活动</h3>
          ${button('看全部', { action: 'go-activities', size: 'sm', variant: 'ghost' })}
        </div>
        ${
          state.recent.length
            ? state.recent.map((a) => activityCard(a)).join('')
            : empty({ icon: '📭', title: '还没有活动', desc: '点右下角 ＋ 发起第一场。' })
        }
      </section>

      <p class="sm-card__hint" style="text-align:center;padding:6px 0 2px">
        时间显示为本地时间，信用分低于 ${RULES.MIN_CREDIT} 分无法报名新活动。
      </p>

      ${button('＋', { action: 'go-new', variant: 'fab' })}
      ${tabBar('discover', TABS)}
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      async match(ctx) {
        if (ctx.form.sentence !== undefined) state.sentence = ctx.form.sentence
        return runMatch()
      },
      'use-example'(ctx) {
        state.sentence = ctx.data.text
        rerender()
      },
      'clear-matches'() {
        state.matches = null
        state.parsed = null
        rerender()
      },
      'filter-match'() {
        return runFilterMatch()
      },
      async 'toggle-available'(ctx) {
        state.filters.only_available = !state.filters.only_available
        await runFilterMatchSilent().catch(() => {})
        await loadRecent().catch(() => {})
        rerender()
      },
      'filter'(ctx) {
        state.filters[ctx.data.name] = ctx.data.value
        rerender()
      },
      async join(ctx) {
        return join(Number(ctx.data.id))
      },
      'open-activity'(ctx) {
        navigate('activity', { id: ctx.data.id })
      },
      'go-activities'() {
        navigate('activities')
      },
      'go-new'() {
        if (!store.me) return navigate('login')
        navigate('activity-new')
      },
      'go-login'() {
        navigate('login')
      },
      'scroll-list'() {
        document.getElementById('recent')?.scrollIntoView({ behavior: 'smooth' })
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
