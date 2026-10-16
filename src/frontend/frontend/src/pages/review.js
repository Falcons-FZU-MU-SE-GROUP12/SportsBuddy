/**
 * P-08 评价同场伙伴
 * ---------------------------------------------------------------------------
 * 对应接口：GET /activities/{id}（拿到 participant 列表）、
 *           POST /activities/{id}/reviews { reviewee_id, score, tags, comment }
 *
 * 规则（后端为准）：只有状态为 attended（发起人已确认到场）的人可以评价，
 * 且不能评价自己、同一场对同一人只能评一次。
 */

import { api } from '../api/index.js'
import { alert, appBar, button, empty } from '../shared/components.js'
import { esc, fmtDateTime, initial } from '../shared/format.js'
import { REVIEW_TAGS, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { clearFlash, flash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create(params = {}) {
  const activityId = Number(params.activityId ?? params.id)
  const state = {
    detail: null,
    loading: true,
    busy: false,
    error: '',
    /** userId -> { score, tags: [], comment, done } */
    drafts: {},
    /** 当前正在编辑的对象 */
    active: null,
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  async function load() {
    clearFlash()
    state.loading = true
    state.error = ''
    rerender()
    try {
      const d = await api.getActivity(activityId, true)
      state.detail = d
      const meId = store.me?.id
      // 可评价对象：已确认到场、且不是自己
      const targets = (d.participants ?? []).filter((p) => p.status === 'attended' && p.user_id !== meId)
      for (const t of targets) {
        state.drafts[t.user_id] ??= { score: 5, tags: [], comment: '', done: false }
      }
      state.active = targets[0]?.user_id ?? null

      // 我已经给谁评过了？（后端没有"我发出的评价"接口，这里用收到列表无法反查，
      // 所以只在本地标记本次会话内提交成功的对象，并在提交时以后端 409 为准。）
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.detail = null
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function submit(userId) {
    const draft = state.drafts[userId]
    if (!draft) return
    state.busy = true
    state.error = ''
    rerender()
    try {
      await api.createReview(activityId, {
        reviewee_id: Number(userId),
        score: draft.score,
        tags: draft.tags,
        comment: draft.comment.slice(0, 200),
      })
      draft.done = true
      flash('ok', '评价已提交，感谢你帮大家筛出靠谱的搭子。')
      const next = Object.keys(state.drafts).find((k) => !state.drafts[k].done)
      state.active = next ? Number(next) : null
    } catch (err) {
      state.error = err?.message ?? '提交失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  function appBarOf() {
    return appBar({ title: '评价同场伙伴', back: true })
  }

  function starRow(userId, score) {
    return `<div class="sm-stars" role="radiogroup" aria-label="评分">${[1, 2, 3, 4, 5]
      .map(
        (n) => `<button class="sm-star" type="button" role="radio" aria-checked="${n <= score}"
          data-action="star" data-user="${userId}" data-score="${n}"
          aria-label="${n} 分">★</button>`
      )
      .join('')}<span class="sm-card__hint" style="align-self:center;margin-left:6px">${score} 分</span></div>`
  }

  function targetCard(t) {
    const draft = state.drafts[t.user_id]
    return `<section class="sm-card">
      <div class="sm-row" style="margin-bottom:10px">
        <span class="sm-avatar sm-avatar--lg" aria-hidden="true">${esc(initial(t.nickname))}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:650">${esc(t.nickname)}</div>
          <div class="sm-card__hint">
            ${esc(SKILL_TEXT[t.skill_level] ?? t.skill_level)} · 信用分 ${t.reliability_score}
            ${t.checked_in_at ? ` · 签到于 ${esc(fmtDateTime(t.checked_in_at))}` : ''}
          </div>
        </div>
        ${draft.done ? `<span class="sm-tag sm-tag--ok">已评价</span>` : ''}
      </div>

      ${
        draft.done
          ? `<p class="sm-card__hint">你给 TA 的评分：${draft.score} 分${draft.tags.length ? ` · ${draft.tags.join('、')}` : ''}${
              draft.comment ? ` · ${esc(draft.comment)}` : ''
            }</p>`
          : `<form data-action="submit" data-user="${t.user_id}">
               <span class="sm-label">这次一起玩的体验</span>
               ${starRow(t.user_id, draft.score)}
               <span class="sm-label" style="margin-top:14px">印象标签 <span class="sm-label__opt">（可多选）</span></span>
               <div class="sm-row sm-row--wrap" style="gap:8px">
                 ${REVIEW_TAGS.map(
                   (tagName) => `<button type="button" class="sm-chip"
                     data-action="tag" data-user="${t.user_id}" data-value="${esc(tagName)}"
                     aria-pressed="${draft.tags.includes(tagName)}">${esc(tagName)}</button>`
                 ).join('')}
               </div>
               <label class="sm-field" style="margin-top:14px">
                 <span class="sm-label">补充一句 <span class="sm-label__opt">（可选）</span></span>
                 <textarea class="sm-textarea" name="comment" rows="2" maxlength="200"
                   placeholder="例如：很准时，配合也好。">${esc(draft.comment)}</textarea>
               </label>
               <button class="sm-btn sm-btn--primary sm-btn--block" type="submit" style="margin-top:12px"
                 ${state.busy ? 'disabled' : ''}>${state.busy ? '提交中…' : '提交评价'}</button>
             </form>`
      }
    </section>`
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:60px"></div>
        <div class="sm-skel" style="height:240px"></div>
      </main>`
    }
    const d = state.detail
    if (!d) {
      return `<main class="sm-main sm-stack">
        ${alert('error', state.error || '活动不存在。')}
        ${button('返回', { action: 'back', block: true, variant: 'primary' })}
      </main>`
    }

    const meId = store.me?.id
    const mine = (d.participants ?? []).find((p) => p.user_id === meId)
    const targets = (d.participants ?? []).filter((p) => p.status === 'attended' && p.user_id !== meId)
    const notAttended = (d.participants ?? []).filter((p) => p.status !== 'attended' && p.user_id !== meId)

    return `<main class="sm-main sm-stack">
      <section class="sm-card">
        <h2 style="font-size:16.5px;font-weight:680">${esc(d.title)}</h2>
        <p class="sm-card__hint" style="margin-top:4px">
          ${esc(d.campus)} · ${esc(d.location)} · ${esc(fmtDateTime(d.start_time))}
        </p>
        <div class="sm-divider"></div>
        <p class="sm-card__hint">
          我的到场状态：${mine ? (mine.status === 'attended' ? '已确认到场 ✅' : mine.status === 'no_show' ? '爽约' : '未确认') : '未参与'}
        </p>
      </section>

      ${state.error ? alert('error', state.error) : ''}
      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}

      ${
        mine?.status !== 'attended'
          ? alert('info', '只有被发起人确认到场的参与者可以评价。如果确实到场了，请先联系发起人确认考勤。')
          : targets.length
            ? targets.map(targetCard).join('')
            : empty({ icon: '🙌', title: '没有需要评价的人', desc: '同场其他人都还没被确认到场，或只有你一个人。' })
      }

      ${
        notAttended.length
          ? `<section class="sm-card sm-card--flat">
               <h3 class="sm-card__title">本次不可评价</h3>
               ${notAttended
                 .map(
                   (p) =>
                     `<div class="sm-row sm-row--between" style="padding:6px 0">
                        <span>${esc(p.nickname)}</span>
                        <span class="sm-tag ${p.status === 'no_show' ? 'sm-tag--danger' : ''}">${p.status === 'no_show' ? '爽约' : p.status === 'checked_in' ? '已签到（待确认）' : '已报名'}</span>
                      </div>`
                 )
                 .join('')}
               <p class="sm-card__hint" style="margin-top:6px">评价只对"被确认到场"的人开放。</p>
             </section>`
          : ''
      }
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      star(ctx) {
        const uid = Number(ctx.data.user)
        state.drafts[uid].score = Number(ctx.data.score)
        rerender()
      },
      tag(ctx) {
        const uid = Number(ctx.data.user)
        const v = ctx.data.value
        const list = state.drafts[uid].tags
        const i = list.indexOf(v)
        if (i >= 0) list.splice(i, 1)
        else list.push(v)
        rerender()
      },
      submit(ctx) {
        const uid = ctx.data.user
        const draft = state.drafts[uid]
        draft.comment = ctx.form.comment ?? draft.comment
        return submit(uid)
      },
      back() {
        navigate('activity', { id: activityId })
      },
    },
  }
}
