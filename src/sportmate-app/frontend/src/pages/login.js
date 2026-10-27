/**
 * P-01 登录 / 注册
 * ---------------------------------------------------------------------------
 * 对应接口：POST /auth/register、POST /auth/login、GET /me
 * 这里把后端的字段约束前置到前端校验（用户名为 3~32 位字母数字下划线、密码 ≥6 位），
 * 目的是不要等到 422 才告诉用户哪里填错了。
 */

import { api, tokenStore } from '../api/index.js'
import { brandMark, alert } from '../shared/components.js'
import { esc } from '../shared/format.js'
import { CAMPUS_OPTIONS, SKILL, SKILL_TEXT } from '../shared/domain.js'
import { field, input, select } from '../shared/components.js'
import { navigate } from '../router.js'
import { flash, loadSports, setSession, store } from '../store.js'
import { setShell } from '../shared/ui.js'

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/

export function create() {
  const state = {
    mode: 'login', // login | register
    loading: false,
    error: '',
    form: {
      username: '',
      password: '',
      nickname: '',
      campus: '旗山校区',
      skill_level: SKILL.BEGINNER,
      favorite_sports: [],
    },
  }

  /** 提交前的本地校验，返回错误文案或空串。 */
  function validate() {
    const f = state.form
    if (!USERNAME_RE.test(f.username))
      return '用户名需为 3~32 位，只能用字母、数字、下划线（不能有中文和空格）。'
    if (f.password.length < 6) return '密码至少 6 位。'
    if (state.mode === 'register' && f.nickname && f.nickname.length > 32)
      return '昵称最长 32 个字符。'
    return ''
  }

  async function submit() {
    state.error = validate()
    if (state.error) {
      rerender()
      return
    }
    state.loading = true
    rerender()
    try {
      if (state.mode === 'login') {
        await api.login(state.form.username.trim(), state.form.password)
      } else {
        await api.register({
          username: state.form.username.trim(),
          password: state.form.password,
          nickname: state.form.nickname.trim() || state.form.username.trim(),
          campus: state.form.campus,
          skill_level: state.form.skill_level,
          favorite_sports: state.form.favorite_sports,
        })
      }
      setSession(await api.getMe())
      await loadSports()
      flash('ok', state.mode === 'login' ? '登录成功，开始找局吧。' : '注册成功，已自动登录。')
      navigate('discover')
    } catch (err) {
      state.error = err?.message ?? '请求失败'
      state.loading = false
      rerender()
    }
  }

  /** 演示账号一键登录（离线 mock 下账号密码固定为 secret123）。 */
  async function demoLogin() {
    state.form.username = 'linhao'
    state.form.password = 'secret123'
    state.mode = 'login'
    await submit()
  }

  const rerender = () => setShell({ body: view() })

  function view() {
    const isLogin = state.mode === 'login'
    const sports = store.sports
    const picked = state.form.favorite_sports

    return `<div class="sm-auth">
      <div class="sm-auth__card">
        <div class="sm-auth__logo" aria-hidden="true">🏸</div>
        <h1 class="sm-auth__title">SportsBuddy</h1>
        <p class="sm-auth__sub">校园运动组局 · 找到时间、水平、地点都合适的搭子</p>

        <div class="sm-card">
          <div class="sm-switch" style="width:100%;margin-bottom:16px" role="group" aria-label="登录或注册">
            <button type="button" style="flex:1" data-action="mode" data-value="login" aria-pressed="${isLogin}">登录</button>
            <button type="button" style="flex:1" data-action="mode" data-value="register" aria-pressed="${!isLogin}">注册</button>
          </div>

          ${state.error ? `<div style="margin-bottom:12px">${alert('error', state.error)}</div>` : ''}

          <form data-action="submit" novalidate>
            ${field({
              label: '用户名',
              control: input({
                name: 'username',
                value: state.form.username,
                placeholder: '字母、数字、下划线，至少 3 位',
                attrs: 'autocomplete="username" autocapitalize="off"',
              }),
            })}
            ${field({
              label: '密码',
              control: input({
                name: 'password',
                type: 'password',
                value: state.form.password,
                placeholder: '至少 6 位',
                attrs: 'autocomplete="current-password"',
              }),
            })}

            ${
              isLogin
                ? ''
                : `
              ${field({
                label: '昵称',
                optional: true,
                control: input({ name: 'nickname', value: state.form.nickname, placeholder: '别人看到的名字，留空则用用户名' }),
              })}
              ${field({
                label: '校区',
                control: select({
                  name: 'campus',
                  value: state.form.campus,
                  options: CAMPUS_OPTIONS.map((c) => ({ value: c, label: c })),
                }),
              })}
              ${field({
                label: '你的水平',
                hint: '用于匹配同水平的活动，之后可以在「我的」里改。',
                control: select({
                  name: 'skill_level',
                  value: state.form.skill_level,
                  options: [SKILL.BEGINNER, SKILL.INTERMEDIATE, SKILL.ADVANCED].map((v) => ({
                    value: v,
                    label: SKILL_TEXT[v],
                  })),
                }),
              })}
              <div class="sm-field">
                <span class="sm-label">常玩项目 <span class="sm-label__opt">（可多选）</span></span>
                <div class="sm-row sm-row--wrap" style="gap:8px">
                  ${(sports.length ? sports : [{ name: '篮球' }, { name: '跑步' }, { name: '羽毛球' }, { name: '足球' }])
                    .slice(0, 10)
                    .map(
                      (s) => `<button type="button" class="sm-chip ${picked.includes(s.name) ? '' : ''}"
                        data-action="pick-sport" data-value="${esc(s.name)}"
                        aria-pressed="${picked.includes(s.name)}">${esc(s.name)}</button>`
                    )
                    .join('')}
                </div>
              </div>`
            }

            <button class="sm-btn sm-btn--primary sm-btn--block sm-btn--lg" type="submit"
              style="margin-top:18px" ${state.loading ? 'disabled' : ''}>
              ${state.loading ? '处理中…' : isLogin ? '登录' : '注册并登录'}
            </button>
          </form>

          <button class="sm-btn sm-btn--ghost sm-btn--block" type="button" style="margin-top:10px"
            data-action="demo" ${state.loading ? 'disabled' : ''}>
            用演示账号体验（林浩）
          </button>
        </div>

        <p class="sm-auth__foot">
          新账号默认信用分 100 分，低于 60 分无法报名新活动。<br />
          登录状态会保存在本地，刷新不会掉线。
        </p>
        <p class="sm-auth__foot">${brandMark()} ${tokenStore.has() ? '检测到本地登录凭证' : '尚未登录'}</p>
      </div>
    </div>`
  }

  return {
    state,
    view,
    actions: {
      mode(ctx) {
        state.mode = ctx.data.value
        state.error = ''
        ctx.rerender()
      },
      'pick-sport'(ctx) {
        const v = ctx.data.value
        const list = state.form.favorite_sports
        const i = list.indexOf(v)
        if (i >= 0) list.splice(i, 1)
        else list.push(v)
        ctx.rerender()
      },
      submit(ctx) {
        // 从表单读实时值，避免重渲染丢输入
        Object.assign(state.form, {
          username: ctx.form.username ?? '',
          password: ctx.form.password ?? '',
          nickname: ctx.form.nickname ?? state.form.nickname,
          campus: ctx.form.campus ?? state.form.campus,
          skill_level: ctx.form.skill_level ?? state.form.skill_level,
        })
        return submit()
      },
      demo() {
        return demoLogin()
      },
      back() {
        navigate('discover')
      },
    },
  }
}
