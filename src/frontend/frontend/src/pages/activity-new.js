/**
 * P-05 发起活动（同一个页面兼任"编辑活动"）
 * ---------------------------------------------------------------------------
 * 对应接口：GET /sports（下拉字典）、POST /activities（新建）、
 *           GET /activities/{id}（拿签到码）、PATCH /activities/{id}（编辑）
 *
 * 两个必须处理的坑：
 *   1. POST /activities 的返回【不含 checkin_code】，所以创建成功后再查一次详情；
 *   2. 用户在 <input type="datetime-local"> 里填的是本地时间，
 *      提交前要用 localInputToUtc() 转成带 Z 的 UTC 串。
 */

import { api, getCurrentPosition } from '../api/index.js'
import { alert, appBar, button, field, input, select, switchGroup, textarea } from '../shared/components.js'
import { localInputToUtc } from '../shared/format.js'
import { CAMPUS_OPTIONS, SKILL, SKILL_TEXT } from '../shared/domain.js'
import { navigate } from '../router.js'
import { clearFlash, flash, store } from '../store.js'
import { setShell } from '../shared/ui.js'

/** 默认时长 2 小时，减少用户填表负担。 */
const DEFAULT_DURATION_MIN = 120

/** 把 UTC 串转成 <input type="datetime-local"> 需要的本地时间串。 */
function utcToLocalInput(iso) {
  if (!iso) return ''
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  const d = new Date(hasZone ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultStart() {
  // 默认"下一个整点 + 2 小时"
  const d = new Date(Date.now() + 2 * 3600 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function addMinutes(localStr, minutes) {
  const d = new Date(localStr)
  if (Number.isNaN(d.getTime())) return ''
  const t = new Date(d.getTime() + minutes * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export function create(params = {}) {
  const editingId = params.id ? Number(params.id) : null
  const start = defaultStart()

  const state = {
    mode: editingId ? 'edit' : 'create',
    loading: Boolean(editingId),
    busy: false,
    error: '',
    geo: null, // { latitude, longitude } 可选
    form: {
      title: '',
      sport: '篮球',
      campus: '旗山校区',
      location: '',
      start_time: start,
      end_time: addMinutes(start, DEFAULT_DURATION_MIN),
      skill_level: SKILL.ANY,
      capacity: 6,
      fee: 0,
      gender_limit: 'any',
      description: '',
    },
  }

  async function load() {
    clearFlash()
    if (!editingId) {
      // 新建：把默认人数按项目字典里的 default_capacity 预填
      const s = store.sports.find((x) => x.name === state.form.sport)
      if (s?.default_capacity) state.form.capacity = s.default_capacity
      return
    }
    try {
      const d = await api.getActivity(editingId, true)
      state.form = {
        title: d.title,
        sport: d.sport,
        campus: d.campus,
        location: d.location ?? '',
        start_time: utcToLocalInput(d.start_time),
        end_time: utcToLocalInput(d.end_time),
        skill_level: d.skill_level,
        capacity: d.capacity,
        fee: d.fee / 100,
        gender_limit: d.gender_limit ?? 'any',
        description: d.description ?? '',
      }
      if (d.latitude != null) state.geo = { latitude: d.latitude, longitude: d.longitude }
    } catch (err) {
      state.error = err?.message ?? '加载活动失败'
    } finally {
      state.loading = false
      rerender()
    }
  }

  /** 提交前校验，尽量把 422 拦在本地。 */
  function validate() {
    const f = state.form
    if (f.title.trim().length < 2) return '标题至少 2 个字，让人一眼知道是什么局。'
    if (!f.location.trim()) return '请填写具体地点，例如「风雨操场 3 号场」。'
    if (!f.start_time) return '请选择开始时间。'
    if (!f.end_time) return '请选择结束时间。'
    if (new Date(f.end_time) <= new Date(f.start_time)) return '结束时间必须晚于开始时间。'
    if (new Date(f.start_time).getTime() < Date.now() - 60000) return '开始时间不能早于现在。'
    const cap = Number(f.capacity)
    if (!Number.isInteger(cap) || cap < 2 || cap > 100) return '人数上限需为 2~100 的整数。'
    if (Number(f.fee) < 0) return '费用不能为负数。'
    if (f.description.length > 500) return '说明太长了，控制在 500 字以内。'
    return ''
  }

  function payload() {
    const f = state.form
    return {
      title: f.title.trim(),
      sport: f.sport,
      campus: f.campus,
      location: f.location.trim(),
      description: f.description.trim(),
      start_time: localInputToUtc(f.start_time),
      end_time: localInputToUtc(f.end_time),
      skill_level: f.skill_level,
      capacity: Number(f.capacity),
      fee: Math.round(Number(f.fee) * 100), // 元 → 分
      gender_limit: f.gender_limit,
      ...(state.geo ? { latitude: state.geo.latitude, longitude: state.geo.longitude } : {}),
    }
  }

  async function submit() {
    state.error = validate()
    if (state.error) {
      rerender()
      return
    }
    state.busy = true
    rerender()
    try {
      if (state.mode === 'edit') {
        await api.updateActivity(editingId, payload())
        flash('ok', '活动已更新。')
        navigate('activity', { id: editingId })
        return
      }
      const created = await api.createActivity(payload())
      // 返回值没有 checkin_code，必须再查一次详情
      const detail = await api.getActivity(created.id, true)
      flash(
        'ok',
        detail?.checkin_code
          ? `活动已发布，签到码 ${detail.checkin_code}（只有你能看到）。`
          : '活动已发布。'
      )
      navigate('activity', { id: created.id })
    } catch (err) {
      state.error = err?.message ?? '发布失败'
      if (err?.isAuthError) {
        store.me = null
        navigate('login')
        return
      }
      state.busy = false
      rerender()
    }
  }

  async function useMyLocation() {
    state.error = ''
    try {
      state.geo = await getCurrentPosition()
      flash('ok', '已记录场地坐标，同学到场后可以直接定位签到。')
    } catch (err) {
      state.error = err.message
    }
    rerender()
  }

  const rerender = () => setShell({ appBar: appBarOf(), body: view() })

  function appBarOf() {
    return appBar({ title: state.mode === 'edit' ? '编辑活动' : '发起活动', back: true })
  }

  function view() {
    if (state.loading) {
      return `<main class="sm-main sm-stack">
        <div class="sm-skel" style="height:60px"></div>
        <div class="sm-skel" style="height:260px"></div>
      </main>`
    }
    const f = state.form
    const durationMin = Math.round((new Date(f.end_time) - new Date(f.start_time)) / 60000)

    return `<main class="sm-main">
      ${store.flash ? `<div style="margin-bottom:12px">${alert(store.flash.type, store.flash.text)}</div>` : ''}
      ${state.error ? `<div style="margin-bottom:12px">${alert('error', state.error)}</div>` : ''}

      <form data-action="submit" class="sm-stack">
        <section class="sm-card">
          <h3 class="sm-card__title">这场局是什么</h3>
          ${field({
            label: '标题',
            control: input({
              name: 'title',
              value: f.title,
              placeholder: '例如：周三晚篮球 3v3，缺两人',
              attrs: 'maxlength="60"',
            }),
          })}
          ${field({
            label: '运动项目',
            control: select({
              name: 'sport',
              value: f.sport,
              options: store.sports.map((s) => ({ value: s.name, label: `${s.icon} ${s.name}` })),
            }),
          })}
          <div class="sm-field">
            <span class="sm-label">水平要求</span>
            ${switchGroup({
              name: 'skill_level',
              value: f.skill_level,
              options: [
                { value: SKILL.ANY, label: SKILL_TEXT[SKILL.ANY] },
                { value: SKILL.BEGINNER, label: SKILL_TEXT[SKILL.BEGINNER] },
                { value: SKILL.INTERMEDIATE, label: SKILL_TEXT[SKILL.INTERMEDIATE] },
                { value: SKILL.ADVANCED, label: SKILL_TEXT[SKILL.ADVANCED] },
              ],
            })}
          </div>
        </section>

        <section class="sm-card">
          <h3 class="sm-card__title">什么时候 · 在哪里</h3>
          <div class="sm-grid2">
            ${field({ label: '开始时间', control: input({ name: 'start_time', type: 'datetime-local', value: f.start_time }) })}
            ${field({ label: '结束时间', control: input({ name: 'end_time', type: 'datetime-local', value: f.end_time }) })}
          </div>
          <div class="sm-row" style="margin-top:8px;flex-wrap:wrap">
            ${[60, 90, 120, 180]
              .map((m) =>
                button(m >= 60 ? `${m / 60} 小时` : `${m} 分钟`, {
                  action: 'dur',
                  size: 'sm',
                  variant: 'ghost',
                  data: `data-min="${m}"`,
                })
              )
              .join('')}
            ${durationMin > 0 ? `<span class="sm-card__hint">当前时长 ${durationMin >= 60 ? `${Math.round((durationMin / 60) * 10) / 10} 小时` : `${durationMin} 分钟`}</span>` : ''}
          </div>
          <div class="sm-grid2" style="margin-top:12px">
            ${field({
              label: '校区',
              control: select({ name: 'campus', value: f.campus, options: CAMPUS_OPTIONS.map((c) => ({ value: c, label: c })) }),
            })}
            ${field({
              label: '具体地点',
              control: input({ name: 'location', value: f.location, placeholder: '风雨操场 3 号场', attrs: 'maxlength="60"' }),
            })}
          </div>
          <div class="sm-row" style="margin-top:10px;flex-wrap:wrap">
            ${button(state.geo ? '📍 已记录场地坐标' : '📍 用当前位置标记场地', { action: 'geo', size: 'sm', variant: state.geo ? 'ghost' : '' })}
            ${
              state.geo
                ? `<span class="sm-card__hint">${state.geo.latitude.toFixed(4)}, ${state.geo.longitude.toFixed(4)} · 可开启定位签到</span>`
                : `<span class="sm-card__hint">不标记也可以，同学用签到码签到</span>`
            }
          </div>
        </section>

        <section class="sm-card">
          <h3 class="sm-card__title">人数 · 费用</h3>
          <div class="sm-grid2">
            ${field({
              label: '人数上限',
              hint: '含你自己，2~100 人',
              control: input({ name: 'capacity', type: 'number', value: f.capacity, attrs: 'min="2" max="100" step="1" inputmode="numeric"' }),
            })}
            ${field({
              label: '人均费用（元）',
              hint: '免费填 0；场地费 AA 就写摊到每人的金额',
              control: input({ name: 'fee', type: 'number', value: f.fee, attrs: 'min="0" step="0.5" inputmode="decimal"' }),
            })}
          </div>
          <div class="sm-field">
            <span class="sm-label">性别限制</span>
            ${switchGroup({
              name: 'gender_limit',
              value: f.gender_limit,
              options: [
                { value: 'any', label: '不限' },
                { value: 'female', label: '限女生' },
                { value: 'male', label: '限男生' },
              ],
            })}
          </div>
        </section>

        <section class="sm-card">
          <h3 class="sm-card__title">补充说明</h3>
          ${field({
            label: '说明',
            optional: true,
            control: textarea({ name: 'description', value: f.description, placeholder: '缺几人、水平要求、要带什么、注意事项…', rows: 4 }),
          })}
        </section>

        <section class="sm-card sm-card--flat">
          <p class="sm-card__hint">
            发布后会自动生成 ${4} 位签到码（只有你能看到）；活动结束后记得记录考勤，
            未勾选到场的人会被记为爽约并扣分。
          </p>
        </section>

        <button class="sm-btn sm-btn--primary sm-btn--block sm-btn--lg" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '提交中…' : state.mode === 'edit' ? '保存修改' : '发布活动'}
        </button>
      </form>
    </main>`
  }

  return {
    appBar: appBarOf,
    view,
    load,
    actions: {
      submit(ctx) {
        // 从表单里读最新值（重渲染不会丢，但点按钮时以 DOM 为准更稳）
        const f = ctx.form
        Object.assign(state.form, {
          title: f.title ?? '',
          sport: f.sport ?? state.form.sport,
          campus: f.campus ?? state.form.campus,
          location: f.location ?? '',
          start_time: f.start_time ?? state.form.start_time,
          end_time: f.end_time ?? state.form.end_time,
          capacity: f.capacity ?? state.form.capacity,
          fee: f.fee ?? state.form.fee,
          description: f.description ?? '',
        })
        return submit()
      },
      switch(ctx) {
        state.form[ctx.data.name] = ctx.data.value
        // 切换项目时同步推荐的默认人数
        if (ctx.data.name === 'sport') {
          const s = store.sports.find((x) => x.name === ctx.data.value)
          if (s?.default_capacity && state.mode === 'create') state.form.capacity = s.default_capacity
        }
        rerender()
      },
      dur(ctx) {
        const min = Number(ctx.data.min)
        state.form.end_time = addMinutes(state.form.start_time, min)
        rerender()
      },
      async geo() {
        return useMyLocation()
      },
      back() {
        if (editingId) navigate('activity', { id: editingId })
        else navigate('discover')
      },
    },
  }
}
