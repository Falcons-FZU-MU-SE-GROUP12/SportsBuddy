/**
 * P-07 签到
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities/{id}、POST /activities/{id}/checkin
 * 两种方式：4 位签到码（推荐）/ 定位签到（需在 300 米内且为 HTTPS 或 localhost）。
 *
 * 错误码在这里有明确分工，界面按状态码给不同反馈：
 *   403 → 签到码错误 / 超出 300 米 / 没报名
 *   409 → 已经签到过
 */

import { api, getCurrentPosition } from '../api/index.js'
import { alert, appBar, button, fact, tag } from '../shared/components.js'
import { esc, fmtRange } from '../shared/format.js'
import { RULES, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { clearFlash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create(params = {}) {
  const id = Number(params.id)
  const state = {
    detail: null,
    loading: true,
    busy: false,
    error: '',
    code: '',
    feedback: null, // { type, text }
    success: null,
    locating: false,
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      state.detail = await api.getActivity(id, true)
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.detail = null
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function submitCode() {
    const code = state.code.trim()
    if (!new RegExp(`^\\d{${RULES.CODE_LENGTH}}$`).test(code)) {
      state.feedback = { type: 'error', text: `请输入 ${RULES.CODE_LENGTH} 位数字签到码。` }
      rerender()
      return
    }
    state.busy = true
    state.feedback = null
    rerender()
    try {
      const res = await api.checkinWithCode(id, code)
      state.success = res
    } catch (err) {
      state.feedback = { type: 'error', text: err?.message ?? '签到失败' }
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
        return
      }
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function submitLocation() {
    state.busy = true
    state.locating = true
    state.feedback = null
    rerender()
    try {
      const pos = await getCurrentPosition()
      state.locating = false
      rerender()
      const res = await api.checkinWithLocation(id, pos.latitude, pos.longitude)
      state.success = res
    } catch (err) {
      state.feedback = { type: 'error', text: err?.message ?? '定位签到失败' }
    } finally {
      state.busy = false
      state.locating = false
      rerender()
    }
  }

  function appBarOf() {
    return appBar({ title: '签到', back: true })
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:80px"></div>
        <div class="sm-skel" style="height:200px"></div>
      </main>`
    }
    if (!state.detail) {
      return `<main class="sm-main sm-stack">
        ${alert('error', state.error || '活动不存在。')}
        ${button('返回', { action: 'back', variant: 'primary', block: true })}
      </main>`
    }

    const d = state.detail
    const my = d.participants?.find((p) => p.user_id === store.me?.id)

    if (state.success) {
      return `<main class="sm-main sm-stack">
        <section class="sm-card" style="text-align:center;padding:28px 16px">
          <div style="font-size:46px;line-height:1">✅</div>
          <h2 style="font-size:19px;font-weight:700;margin-top:10px">签到成功</h2>
          <p class="sm-card__hint" style="margin-top:6px">
            ${esc(state.success.method === 'location' ? `定位签到 · 距活动地点 ${state.success.distance_m} 米` : '签到码签到')}
          </p>
          <div class="sm-divider"></div>
          <div class="sm-facts" style="text-align:left">
            ${fact('活动', esc(d.title))}
            ${fact('时间', esc(fmtRange(d.start_time, d.end_time)))}
            ${fact('地点', `${esc(d.campus)} · ${esc(d.location)}`)}
          </div>
          <div class="sm-row" style="margin-top:16px">
            ${button('查看活动', { action: 'go-detail', block: true })}
            ${button('返回我的局', { action: 'go-manage', variant: 'primary', block: true })}
          </div>
        </section>
        <p class="sm-card__hint" style="text-align:center">
          活动结束后，发起人会确认到场名单；被确认到场的同学可以互相评价。
        </p>
      </main>`
    }

    return `<main class="sm-main sm-stack">
      <section class="sm-card">
        <div class="sm-row sm-row--between">
          <h2 style="font-size:16.5px;font-weight:680">${esc(d.title)}</h2>
          ${tag(SKILL_TEXT[d.skill_level] ?? d.skill_level)}
        </div>
        <p class="sm-card__hint" style="margin-top:4px">
          ${esc(fmtRange(d.start_time, d.end_time))} · ${esc(d.campus)} ${esc(d.location)}
        </p>
        ${
          my
            ? `<div class="sm-divider"></div>
               <div class="sm-row sm-row--between">
                 <span class="sm-card__hint">我的状态</span>
                 ${tag(my.status === 'checked_in' ? '已签到' : my.status === 'attended' ? '已确认到场' : '已报名', my.status === 'registered' ? 'ghost' : 'ok')}
               </div>`
            : `<div style="margin-top:12px">${alert('warn', '你还没有报名这场活动。请先报名再来签到。')}</div>`
        }
      </section>

      ${state.feedback ? alert(state.feedback.type, state.feedback.text) : ''}

      <form data-action="code" class="sm-card">
        <h3 class="sm-card__title">方式一 · 输入签到码</h3>
        <p class="sm-card__hint">找发起人要 ${RULES.CODE_LENGTH} 位数字，输入即可。</p>
        <input class="sm-input" name="code" inputmode="numeric" maxlength="${RULES.CODE_LENGTH}"
          autocomplete="one-time-code" placeholder="••••"
          value="${esc(state.code)}"
          style="margin-top:12px;text-align:center;font-family:var(--font-num);font-size:26px;letter-spacing:10px" />
        <button class="sm-btn sm-btn--primary sm-btn--block sm-btn--lg" type="submit" style="margin-top:12px"
          ${state.busy || !my ? 'disabled' : ''}>
          ${state.busy && !state.locating ? '签到中…' : '确认签到'}
        </button>
      </form>

      <section class="sm-card">
        <h3 class="sm-card__title">方式二 · 定位签到</h3>
        <p class="sm-card__hint">
          需要你在活动地点 ${RULES.CHECKIN_RADIUS_M} 米以内。超出范围后端会返回具体距离，
          直接按提示挪近一点再试。浏览器定位要求 HTTPS 或 localhost。
        </p>
        <button class="sm-btn sm-btn--block" type="button" data-action="location" style="margin-top:12px"
          ${state.busy || !my ? 'disabled' : ''}>
          ${state.locating ? '正在获取定位…' : '📍 用当前位置签到'}
        </button>
      </section>

      <section class="sm-card sm-card--flat">
        <p class="sm-card__hint">
          签到成功后状态会变成「已签到」。若长时间无法签到，先把情况告诉发起人，
          避免被记为爽约（会扣 15 分信用分）。
        </p>
      </section>
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      code(ctx) {
        state.code = ctx.form.code ?? ''
        return submitCode()
      },
      location() {
        return submitLocation()
      },
      'go-detail'() {
        navigate('activity', { id })
      },
      'go-manage'() {
        navigate('manage')
      },
      back() {
        navigate('activity', { id })
      },
    },
  }
}
