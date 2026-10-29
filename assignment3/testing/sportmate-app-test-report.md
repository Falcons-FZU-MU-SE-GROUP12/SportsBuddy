# sportmate-app.zip 测试报告

- 测试对象：sportmate-app.zip（5.35 MB）
- 静态服务器：`http://127.0.0.1:5178`（Node v24.21.0，后台运行）
- 测试日期：2026-10-17
- 测试人：060725

## 一、测试结果总览

| # | 测试项 | 结果 |
| --- | --- | --- |
| 1 | `verify.mjs` 自检 99 项（接口覆盖 / 业务规则 / 页面渲染 / 时区 / 找局解析） | 通过 99/99 |
| 2 | `check-links.mjs`：5 个入口页共 36 个本地资源引用 | 全部可达 |
| 3 | HTTP 服务行为：入口页 200、未知路径 404、MIME 正确（js/css/svg） | 正常 |
| 4 | `check-class-diagram.py` 类图几何 5 项 | 通过：15 类、无溢出、无穿框 |
| 5 | `check-mojibake.py` 乱码校验 3 项 | 通过：无豆腐块、无误判 |
| 6 | `build-prototype.mjs` 原型再生成 vs 交付物对比 | 通过：0 差异 |
| 7 | README 声明核对：11 页面、12 原型 JPG、15 类、19 接口封装 | 通过：数字属实 |

## 二、业务规则验证（`verify.mjs` 摘录）

| 规则 | 结果 |
| --- | --- |
| 重复报名 → 409「你已经报名过该活动」 | 通过 |
| 满员活动报名 → 409「活动已满员」 | 通过 |
| 信用分低于 60 报名 → 403（提示当前分数） | 通过 |
| 签到码错误 → 403「签到码错误」 | 通过 |
| 定位超出 300 米 → 403（提示实际距离）；范围内签到成功 | 通过 |
| 距开始不足 2 小时取消 → `is_late_cancel = true`，信用分扣 5 | 通过 |
| 考勤返回 `attended` / `no_show` / `score_changes`，未勾选记爽约 | 通过 |
| 非发起人拿不到 `checkin_code`（返回 null） | 通过 |
| 已开始活动报名 → 400「活动已开始，无法报名」 | 通过 |

## 三、页面渲染与契约

11 个页面（login / discover / activities / activity / activity-new / activity-manage / checkin / manage / me / review / user）逐一验证：标签配平、无 undefined 等异常值、所有 `data-action` 均有对应处理函数；登录态与游客态各跑一遍，全部通过。

## 四、过程中发现并处理的 3 个小问题（均非代码缺陷）

1. 类图校验脚本在中文 Windows 崩溃 —— `UnicodeEncodeError: 'gbk'`；设置 `PYTHONIOENCODING=utf-8` 后正常。
2. 乱码校验缺 Pillow —— 已安装 Pillow 后正常。
3. 链接检查需先启动服务器 —— 首跑失败属预期，服务启动后全部通过。

## 五、未完成项

真机浏览器 UI 人工测试未进行 —— 桌面浏览器未连接到测试会话。页面渲染层目前由 `verify.mjs` 的程序化校验兜底。可人工查看的地址：

- 前端应用 → `http://127.0.0.1:5178/frontend/`
- 可交互原型（12 屏）→ `http://127.0.0.1:5178/prototype/screens.html`
- 类图 → `http://127.0.0.1:5178/docs/diagrams/class-diagram.html`

## 六、结论

包内全部可自动化验证的测试均通过（99 + 5 + 3 + 36 + 5 项），交付物与 README 声明完全一致，未发现代码缺陷。剩余仅为「肉眼看界面」的人工验收环节。
