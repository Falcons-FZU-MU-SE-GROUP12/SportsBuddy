# Diagrams — 领域类图

交付物 3（SRS 第 3 章）的 **UML 类图**：15 个类 / 20 条关系。

| 文件 | 用途 |
| --- | --- |
| `class-diagram.svg` | **直接插进 Word / PPT**（矢量，缩放不失真） |
| `领域类图.jpg` | 位图版（全套） |
| `领域类图-适合插入文档.jpg` | 已按文档宽度裁好的位图版 |
| `class-diagram.html` | 可缩放查看页——GitHub 只显示源码，需本地打开 |
| `class-diagram.mmd` | Mermaid 源文件，便于后续修改重新生成 |

本地查看交互版（在仓库根目录执行）：

```powershell
node src/frontend/tools/server.mjs
# 打开 http://127.0.0.1:5178/assignment3/diagrams/class-diagram.html
```

> 本目录文件取自 `src/frontend/` 的交付包（原件未改动），仅修正了 HTML 里指向共享样式 `app.css` 的相对路径，
> 使其在本目录下也能正常渲染。
