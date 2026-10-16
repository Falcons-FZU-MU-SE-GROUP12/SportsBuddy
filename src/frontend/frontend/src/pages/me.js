/**
 * P-11 我的
 * ---------------------------------------------------------------------------
 * 对应接口：GET /me、PATCH /me、POST /auth/logout、
 *           GET /users/{id}/reviews（看别人给我的评价）、GET /activities/mine（统计）
 * 未登录时这一页变成"登录引导 + 产品说明"，仍然是完整可用的一屏。
 */

import { api } from '../api/index.js'
import {
  alert,
  appBar,
  button,
  creditCard,
  empty,
  field,
  input,
  select,
  switchGroup,
  tabBar,
  tag,
} from '../shared/components.js'
import { esc, fmtDateTime, initial, localZoneLabel } from '../shared/format.js'
import { CAMPUS_OPTIONS, RULES, SKILL, SKILL_TEXT } from '../shared/domain.js'
import { BASE_URL, USE_MOCK } from '../api/http.js'
import { navigate } from '../router.js'
import { TABS, clearFlash, flash, setSession, store } from '../store.js'
import { setShell } from '../shared/ui.js'

export function create() {
  const state = {
    loading: false,
    busy: false,
    error: '',
    editing: false,
    reviews: [],
    counts: { organized: 0, joined: 0 },
    form: { nickname: '', campus: '旗山校区', skill_level: SKILL.ANY, favorite_sports: [] },
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  async function load() {
    clearFlash()
    state.error = ''
    if (!store.me) {
      rerender()
      return
    }
    state.loading = true
    rerender()
    try {
      const me = await api.getMe()
      setSession(me)
      state.form = {
        nickname: me.nickname,
        campus: me.campus,
        skill_level: me.skill_level,
        favorite_sports: [...(me.favorite_sports ?? [])],
      }
      const [reviews, mine] = await Promise.all([
        api.getUserReviews(me.id).catch(() => []),
        api.getMyActivities().catch(() => ({ organized: [], joined: [] })),
      ])
      state.reviews = reviews ?? []
      state.counts = {
        organized: mine.organized?.length ?? 0,
        joined: mine.joined?.length ?? 0,
      }
    } catch (err) {
      state.error = err?.message ?? '加载失败'
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
        return
      }
    } finally {
      state.loading = false
      rerender()
    }
  }

  async function save() {
    state.busy = true
    state.error = ''
    rerender()
    try {
      const me = await api.updateMe({
        nickname: state.form.nickname,
        campus: state.form.campus,
        skill_level: state.form.skill_level,
        favorite_sports: state.form.favorite_sports,
      })
      setSession(me)
      state.editing = false
      flash('ok', '资料已更新。')
    } catch (err) {
      state.error = err?.message ?? '保存失败'
    } finally {
      state.busy = false
      rerender()
    }
  }

  async function logout() {
    state.busy = true
    rerender()
    try {
      await api.logout()
    } catch {
      /* 即使服务端吊销失败，本地也要清掉 */
    } finally {
      store.me = null
      state.busy = false
      flash('ok', '已退出登录。')
      navigate('discover')
    }
  }

  function appBarOf() {
    return appBar({
      title: '我的',
      sub: store.me ? `${store.me.campus} · ${localZoneLabel()}` : '未登录',
      right: store.me
        ? button(state.editing ? '取消' : '编辑', { action: 'toggle-edit', size: 'sm', variant: 'ghost' })
        : button('登录', { action: 'go-login', size: 'sm' }),
    })
  }

  function guestView() {
    return `<main class="sm-main sm-stack">
      <section class="sm-auth__card" style="max-width:none">
        <div class="sm-auth__logo" aria-hidden="true">🏸</div>
        <h1 class="sm-auth__title" style="font-size:20px">登录后开始组局</h1>
        <p class="sm-auth__sub">信用分、签到、评价都跟账号绑定</p>
      </section>

      <section class="sm-card">
        <h3 class="sm-card__title">为什么需要登录</h3>
        <ul class="sm-card__hint" style="line-height:2">
          <li>· 报名需要实名到人，方便发起人核到到场名单</li>
          <li>· 信用分跟着账号走：按时到场会累积完成次数</li>
          <li>· 爽约、临期取消会被记录，大家组局更放心</li>
        </ul>
        <div class="sm-row" style="margin-top:14px">
          ${button('登录 / 注册', { action: 'go-login', variant: 'primary', block: true })}
        </div>
      </section>

      <section class="sm-card sm-card--flat">
        <h3 class="sm-card__title">当前运行模式</h3>
        <div class="sm-list">
          <div class="sm-list__item" style="cursor:default">
            <span class="sm-list__icon">${USE_MOCK ? '🧪' : '🔌'}</span>
            <span class="sm-list__body">
              <span class="sm-list__title">${USE_MOCK ? '离线演示数据' : '真实后端'}</span>
              <span class="sm-list__desc">${esc(BASE_URL)}</span>
            </span>
          </div>
        </div>
        <p class="sm-card__hint" style="margin-top:10px">
          想连真实后端：在 <code>frontend/index.html</code> 里把
          <code>useMock</code> 设为 <code>false</code>，并把 <code>apiBaseUrl</code> 指向后端地址。
        </p>
      </section>

      ${tabBar('me', TABS)}
    </main>`
  }

  function view() {
    if (!store.me) return guestView()
    const me = store.me

    if (state.editing) {
      return `<main class="sm-main sm-stack">
        ${state.error ? alert('error', state.error) : ''}
        <form data-action="save" class="sm-card">
          <h3 class="sm-card__title">编辑资料</h3>
          ${field({ label: '昵称', control: input({ name: 'nickname', value: state.form.nickname, attrs: 'maxlength="32"' }) })}
          ${field({
            label: '校区',
            control: select({ name: 'campus', value: state.form.campus, options: CAMPUS_OPTIONS.map((c) => ({ value: c, label: c })) }),
          })}
          <div class="sm-field">
            <span class="sm-label">我的水平</span>
            ${switchGroup({
              name: 'skill_level',
              value: state.form.skill_level,
              options: [SKILL.BEGINNER, SKILL.INTERMEDIATE, SKILL.ADVANCED, SKILL.ANY].map((v) => ({
                value: v,
                label: SKILL_TEXT[v],
              })),
            })}
          </div>
          <div class="sm-field">
            <span class="sm-label">常玩项目 <span class="sm-label__opt">（可多选）</span></span>
            <div class="sm-row sm-row--wrap" style="gap:8px">
              ${store.sports
                .map(
                  (s) => `<button type="button" class="sm-chip" data-action="pick-sport" data-value="${esc(s.name)}"
                    aria-pressed="${state.form.favorite_sports.includes(s.name)}">${s.icon} ${esc(s.name)}</button>`
                )
                .join('')}
            </div>
          </div>
          <div class="sm-row" style="margin-top:16px">
            ${button('取消', { action: 'toggle-edit', block: true })}
            <button class="sm-btn sm-btn--primary sm-btn--block" type="submit" ${state.busy ? 'disabled' : ''}>
              ${state.busy ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </main>`
    }

    return `<main class="sm-main sm-stack">
      ${store.flash ? alert(store.flash.type, store.flash.text) : ''}
      ${state.error ? alert('error', state.error) : ''}

      <section class="sm-card">
        <div class="sm-row" style="gap:14px">
          <span class="sm-avatar sm-avatar--lg" aria-hidden="true">${esc(initial(me.nickname))}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em">${esc(me.nickname)}</div>
            <div class="sm-card__hint">@${esc(me.username)} · ${esc(me.campus)}</div>
            <div class="sm-act__tags" style="margin-top:8px">
              ${tag(SKILL_TEXT[me.skill_level] ?? me.skill_level, 'brand')}
              ${(me.favorite_sports ?? []).map((s) => tag(s)).join('')}
            </div>
          </div>
        </div>
      </section>

      ${creditCard(me)}

      <section class="sm-list">
        <div class="sm-list__item" role="button" tabindex="0" data-action="go-manage">
          <span class="sm-list__icon">🎯</span>
          <span class="sm-list__body">
            <span class="sm-list__title">我的局</span>
            <span class="sm-list__desc">我发起 ${state.counts.organized} · 我报名 ${state.counts.joined}</span>
          </span>
          <span class="sm-list__chev">›</span>
        </div>
        <div class="sm-list__item" role="button" tabindex="0" data-action="go-my-page">
          <span class="sm-list__icon">👤</span>
          <span class="sm-list__body">
            <span class="sm-list__title">我的主页（别人看到的样子）</span>
            <span class="sm-list__desc">信用分、评价与印象标签</span>
          </span>
          <span class="sm-list__chev">›</span>
        </div>
        <div class="sm-list__item" role="button" tabindex="0" data-action="go-discover">
          <span class="sm-list__icon">🔍</span>
          <span class="sm-list__body">
            <span class="sm-list__title">去找局</span>
            <span class="sm-list__desc">一句话匹配适合你的活动</span>
          </span>
          <span class="sm-list__chev">›</span>
        </div>
        <div class="sm-list__item" role="button" tabindex="0" data-action="go-new">
          <span class="sm-list__icon">➕</span>
          <span class="sm-list__body">
            <span class="sm-list__title">发起活动</span>
            <span class="sm-list__desc">发布后会生成只有你能看到的签到码</span>
          </span>
          <span class="sm-list__chev">›</span>
        </div>
      </section>

      <section class="sm-card">
        <div class="sm-row sm-row--between">
          <h3 class="sm-card__title" style="margin:0">我收到的评价（${state.reviews.length}）</h3>
          <span class="sm-score">${me.review_average ?? '—'} 分</span>
        </div>
        ${
          state.reviews.length
            ? state.reviews
                .slice(0, 3)
                .map(
                  (r) => `<div style="padding:12px 0;border-top:1px solid var(--line)">
                    <div class="sm-row sm-row--between">
                      <b style="font-size:13.5px">${esc(r.reviewer?.nickname ?? '匿名同学')}</b>
                      <span style="color:#ffb020;letter-spacing:2px">${'★'.repeat(r.score)}<span style="color:#d9dde7">${'★'.repeat(5 - r.score)}</span></span>
                    </div>
                    ${r.tags?.length ? `<div class="sm-act__tags" style="margin-top:6px">${r.tags.map((t) => tag(t, 'ok')).join('')}</div>` : ''}
                    ${r.comment ? `<p style="margin-top:6px;font-size:13px">${esc(r.comment)}</p>` : ''}
                  </div>`
                )
                .join('') + (state.reviews.length > 3 ? `<div style="margin-top:10px">${button('看全部评价', { action: 'go-my-page', size: 'sm', variant: 'ghost', block: true })}</div>` : '')
            : `<p class="sm-card__hint" style="margin-top:8px">还没有收到评价。参加活动结束后，同场伙伴可以给你打分。</p>`
        }
      </section>

      <section class="sm-card sm-card--flat">
        <h3 class="sm-card__title">账号与运行环境</h3>
        <div class="sm-list" style="border:0">
          <div class="sm-list__item" style="cursor:default;padding-left:0;padding-right:0">
            <span class="sm-list__icon">🕒</span>
            <span class="sm-list__body">
              <span class="sm-list__title">时间显示</span>
              <span class="sm-list__desc">本地时间 ${localZoneLabel()}（后端返回 UTC，已自动换算）</span>
            </span>
          </div>
          <div class="sm-list__item" style="cursor:default;padding-left:0;padding-right:0">
            <span class="sm-list__icon">${USE_MOCK ? '🧪' : '🔌'}</span>
            <span class="sm-list__body">
              <span class="sm-list__title">${USE_MOCK ? '离线演示数据' : '真实后端'}</span>
              <span class="sm-list__desc">${esc(BASE_URL)}</span>
            </span>
          </div>
          <div class="sm-list__item" style="cursor:default;padding-left:0;padding-right:0">
            <span class="sm-list__icon">📅</span>
            <span class="sm-list__body">
              <span class="sm-list__title">注册时间</span>
              <span class="sm-list__desc">${esc(fmtDateTime(me.created_at))}</span>
            </span>
          </div>
        </div>
        <p class="sm-card__hint" style="margin-top:10px">
          信用分低于 ${RULES.MIN_CREDIT} 分无法报名新活动；距开始 ${RULES.LATE_CANCEL_HOURS} 小时内取消报名扣 ${RULES.LATE_CANCEL_PENALTY} 分；爽约扣 15 分。
        </p>
      </section>

      <button class="sm-btn sm-btn--danger sm-btn--block" type="button" data-action="logout"
        ${state.busy ? 'disabled' : ''}>退出登录</button>

      ${tabBar('me', TABS)}
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      'toggle-edit'() {
        state.editing = !state.editing
        state.error = ''
        rerender()
      },
      'pick-sport'(ctx) {
        const v = ctx.data.value
        const list = state.form.favorite_sports
        const i = list.indexOf(v)
        if (i >= 0) list.splice(i, 1)
        else list.push(v)
        rerender()
      },
      switch(ctx) {
        state.form[ctx.data.name] = ctx.data.value
        rerender()
      },
      save(ctx) {
        state.form.nickname = ctx.form.nickname ?? state.form.nickname
        state.form.campus = ctx.form.campus ?? state.form.campus
        return save()
      },
      logout() {
        return logout()
      },
      'go-manage'() {
        navigate('manage')
      },
      'go-my-page'() {
        navigate('user', { id: store.me.id })
      },
      'go-discover'() {
        navigate('discover')
      },
      'go-new'() {
        navigate('activity-new')
      },
      'go-login'() {
        navigate('login')
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
