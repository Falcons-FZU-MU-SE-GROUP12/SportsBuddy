/**
 * P-09 个人主页（他人）
 * ---------------------------------------------------------------------------
 * 对应接口：GET /users/{id}、GET /users/{id}/reviews
 * 这两个接口都允许匿名，所以未登录也能看。
 */

import { api } from '../api/index.js'
import { alert, appBar, button, empty, tag } from '../shared/components.js'
import { esc, fmtDateTime, initial } from '../shared/format.js'
import { RULES, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create(params = {}) {
  const id = Number(params.id)
  const state = { user: null, reviews: [], loading: true, error: '' }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  async function load() {
    state.loading = true
    state.error = ''
    rerender()
    try {
      const [user, reviews] = await Promise.all([api.getUser(id), api.getUserReviews(id)])
      state.user = user
      state.reviews = reviews ?? []
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      state.user = null
    } finally {
      state.loading = false
      rerender()
    }
  }

  function appBarOf() {
    return appBar({ title: state.user?.nickname ?? '个人主页', back: true })
  }

  /** 评价分布（1~5 星各几票）。 */
  function distribution() {
    const buckets = [5, 4, 3, 2, 1].map((n) => ({
      n,
      count: state.reviews.filter((r) => r.score === n).length,
    }))
    const total = state.reviews.length || 1
    return `<div class="sm-bars">${buckets
      .map(
        (b) => `<div class="sm-bar">
          <span>${b.n} 星</span>
          <span class="sm-bar__track"><span class="sm-bar__fill" style="width:${Math.round((b.count / total) * 100)}%"></span></span>
          <span class="sm-bar__num">${b.count}</span>
        </div>`
      )
      .join('')}</div>`
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:100px"></div>
        <div class="sm-skel" style="height:160px"></div>
      </main>`
    }
    if (!state.user) {
      return `<main class="sm-main sm-stack">
        ${alert('error', state.error || '找不到这位用户。')}
        ${button('返回', { action: 'back', block: true, variant: 'primary' })}
      </main>`
    }

    const u = state.user
    const low = u.reliability_score < RULES.MIN_CREDIT
    const isMe = store.me?.id === u.id
    const tagCount = {}
    for (const r of state.reviews) for (const t of r.tags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    return `<main class="sm-main sm-stack">
      <section class="sm-card">
        <div class="sm-row" style="gap:14px">
          <span class="sm-avatar sm-avatar--lg" aria-hidden="true">${esc(initial(u.nickname))}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em">${esc(u.nickname)}</div>
            <div class="sm-card__hint">${esc(u.campus)} · ${esc(SKILL_TEXT[u.skill_level] ?? u.skill_level)}</div>
            <div class="sm-act__tags" style="margin-top:8px">
              ${(u.favorite_sports ?? []).map((s) => tag(s, 'brand')).join('')}
            </div>
          </div>
        </div>

        <div class="sm-divider"></div>

        <div class="sm-credit__stats">
          <div class="sm-stat">
            <div class="sm-stat__num" style="color:${low ? 'var(--danger)' : 'var(--accent)'}">${u.reliability_score}</div>
            <div class="sm-stat__label">信用分</div>
          </div>
          <div class="sm-stat"><div class="sm-stat__num">${u.completed_count}</div><div class="sm-stat__label">完成次数</div></div>
          <div class="sm-stat"><div class="sm-stat__num">${u.no_show_count}</div><div class="sm-stat__label">爽约次数</div></div>
        </div>

        ${low ? `<div style="margin-top:12px">${alert('warn', `TA 的信用分低于 ${RULES.MIN_CREDIT} 分，目前无法报名新活动。组局前可以留意一下。`)}</div>` : ''}

        ${
          isMe
            ? `<div style="margin-top:12px">${button('这是你自己，去「我的」', { action: 'go-me', size: 'sm', block: true })}</div>`
            : ''
        }
      </section>

      <section class="sm-card">
        <div class="sm-row sm-row--between">
          <h3 class="sm-card__title" style="margin:0">收到的评价（${state.reviews.length}）</h3>
          <span class="sm-score">${u.review_average ?? '—'} 分</span>
        </div>
        ${state.reviews.length ? distribution() : `<p class="sm-card__hint" style="margin-top:8px">还没有人评价过 TA。</p>`}
        ${
          topTags.length
            ? `<div class="sm-act__tags" style="margin-top:12px">
                 ${topTags.map(([t, n]) => tag(`${t} ×${n}`, 'ok')).join('')}
               </div>`
            : ''
        }
      </section>

      ${
        state.reviews.length
          ? `<section class="sm-stack">
               ${state.reviews
                 .map(
                   (r) => `<article class="sm-card">
                     <div class="sm-row sm-row--between">
                       <span class="sm-row" style="gap:8px">
                         <span class="sm-avatar" aria-hidden="true">${esc(initial(r.reviewer?.nickname))}</span>
                         <b style="font-size:14px">${esc(r.reviewer?.nickname ?? '匿名同学')}</b>
                       </span>
                       <span style="color:#ffb020;letter-spacing:2px">${'★'.repeat(r.score)}<span style="color:#d9dde7">${'★'.repeat(5 - r.score)}</span></span>
                     </div>
                     ${r.tags?.length ? `<div class="sm-act__tags" style="margin-top:8px">${r.tags.map((t) => tag(t, 'ok')).join('')}</div>` : ''}
                     ${r.comment ? `<p style="margin-top:8px;font-size:13.5px">${esc(r.comment)}</p>` : ''}
                     <p class="sm-card__hint" style="margin-top:8px">${esc(fmtDateTime(r.created_at))}</p>
                   </article>`
                 )
                 .join('')}
             </section>`
          : empty({ icon: '💬', title: '还没有评价', desc: '参加活动后，同场伙伴可以互相评价。' })
      }
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      'go-me'() {
        navigate('me')
      },
      back() {
        navigate('me')
      },
    },
  }
}
