# 主应用编辑器下载增加 PDF 选项 — 设计文档

日期：2026-07-15
分支：`feature/app-download-pdf`

## 背景

主应用前端 `public/index.html`（单文件，内联 CSS+JS）。工具栏 `#mainActions` 有若干 `.action-btn`（View/Edit/History/**Download**/Share/Delete）。下载按钮 `#btnRaw`（label i18n key `raw`，中文"下载"/英文"Download"）当前直接把 `currentDoc.content`（已保存内容）打包成 `.md` 下载（`public/index.html` 约 2159–2168 行），无格式选择。

之前"分享页 PDF 下载"功能只做在了公开分享页 `/share/<token>`（`server.mjs` 的 `renderSharePage`），主应用编辑器没有。用户希望主应用这个下载按钮也能选 Markdown / PDF。

关键差异：分享页整页即文档，可直接 `window.print()`；主应用页面还含侧边栏/工具栏/编辑框，直接打印会打出整个界面。

## 目标

主应用编辑器的下载按钮点击后可选 **Markdown** 或 **PDF**，与分享页行为一致。

## 方案概述

- 把 `#btnRaw` 从"直接下载"改成"下拉菜单"（复用分享页的下拉交互模式）。
- **Markdown**：沿用现有 `.md` 下载逻辑。
- **PDF**：用**隐藏打印容器** `#printArea` + `@media print` 只显示文档正文——任何模式（查看/编辑/历史）都能打印出干净文档，且用已保存的 `currentDoc.content`（与 Markdown 一致）。
- 全部改动在 `public/index.html`；不动服务端。

## 详细设计

### 1. 下载按钮 → 下拉菜单

- `#btnRaw` 改为下拉触发按钮（文案沿用 `raw` i18n，加下拉小箭头 caret），外层包一个 `position:relative` 的容器 `.download-wrap`（放在 `#mainActions` 内原 `#btnRaw` 位置）。
- 点击弹出 `.download-menu`（绝对定位在按钮下方），含两项，各带内联 SVG 图标：
  - **Markdown**（`#dlAppMd`）：把 `currentDoc.content` 打包成 `${title}.md` 下载（与现逻辑等价）。
  - **PDF**（`#dlAppPdf`）：见下。
- 交互：点击开合、点外部关闭、`Esc` 关闭；`aria-haspopup`/`aria-expanded`；菜单项键盘可点。
- 仅当有 `currentDoc` 时该按钮可用（`#mainActions` 本就 doc 打开才显示）。

### 2. PDF = 隐藏打印容器 + 浏览器打印

- 新增隐藏容器 `<div id="printArea"></div>`（屏幕上 `display:none`）。
- 点 PDF 项：
  1. `document.getElementById('printArea').innerHTML = '<div class="markdown-body">' + marked.parse(currentDoc.content) + '</div>'`（渲染已保存内容）。
  2. 临时把 `document.title` 设为清洗后的文档标题（`afterprint` 恢复），使保存的 PDF 默认名为标题。
  3. `window.print()`。
- 关闭菜单后再触发打印。

### 3. 打印样式 `@media print`

- 隐藏整个应用外壳：`.app`（及其内的侧边栏、工具栏、`#mainBody`、编辑框等）`display:none`。
- 仅显示 `#printArea`：打印时 `display:block`；正常时 `display:none`。
- 强制**浅色**排版（白底黑字，覆盖深色模式变量）；`#printArea .markdown-body` 的标题/表格/代码块/引用块/图片按纸面适配（浅色边框、`print-color-adjust:exact` 让底色渲染、`break-inside:avoid`）。
- 去掉多余页边留白，内容宽度适配 A4。
- 该打印块思路复用分享页 `@media print`，但选择器针对 `#printArea`。

### 4. 无障碍 / 交互

- 下拉按钮 `aria-haspopup="menu"`、`aria-expanded` 随开合；菜单 `role="menu"`、项 `role="menuitem"`。
- Markdown 项用 `<a download>` 或 `<button>` 均可（这里用 `<button>` + Blob，保持与现逻辑一致）。
- 打印文件名切换用 `beforeprint`/`afterprint`（或在点击处理里设/复原）。

## 不做（YAGNI）

- 不引入服务端 PDF / 无头 Chromium / 前端 PDF 库。
- 不改分享页（已具备该功能）。
- PDF 打印的是**已保存内容**，不含编辑框里未保存的改动（与现有 Markdown 下载一致）；不做"打印未保存草稿"。

## 验证

chrome-devtools + headless 打印：
- 打开一篇文档，下载按钮变 "下载 ▾"；点开有 Markdown / PDF 两项；点外部/ESC 关闭。
- Markdown 项下载 `.md`（内容 = 已保存内容），行为同前。
- PDF 项：查看模式与编辑模式下分别点，确认打印预览/PDF 为**干净文档正文**（浅色、无侧边栏/工具栏/编辑框）、文件名为标题、表格/代码块/引用完整。
- headless `--print-to-pdf` 生成真 PDF 目视确认浅色排版、无 app 界面。
- 深/浅色系统模式下打印均为浅色。
- 375px 移动视口：下拉菜单定位正常、可点。
