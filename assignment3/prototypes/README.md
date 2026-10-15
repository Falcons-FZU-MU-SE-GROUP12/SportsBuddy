# Prototypes — 界面原型

交付物 4（SRS 第 4 章）的 **界面原型**：12 个画面（登录注册 / 找局 / 活动列表与详情 / 发起活动 / 签到 / 管理 / 我的局 / 我的 / 个人主页 / 评价）。

| 文件 | 用途 |
| --- | --- |
| `00-总览.jpg` + `P-01`…`P-12*.jpg` | **13 张位图**，可直接插进 Word / PPT |
| `screens.html` | 可交互原型：12 屏并排，框里能直接点 |
| `wireframe.html` | 信息架构图 + 路由表 |
| `index.html` | 交付物索引 + 19 个接口的覆盖表 |
| `css/gallery.css` | 上面三页的样式 |

本地查看（在仓库根目录执行）：

```powershell
node src/frontend/tools/server.mjs
# 打开 http://127.0.0.1:5178/assignment3/prototypes/index.html
```

> 本目录文件取自 `src/frontend/` 的交付包（原件未改动），仅修正了 HTML 里指向共享样式 `app.css` 的相对路径。
