# 分享页下载增加 PDF 选项 — 设计文档

日期：2026-07-14
分支：`feature/share-download-pdf`

## 背景

分享页（`renderSharePage`，在 `server.mjs` 内）头部当前有一个 Download 按钮，直接链到公共端点 `GET /api/share/<token>/download`，下载 Markdown 文件。页面正文由浏览器端 `marked` 把 Markdown 渲染成 HTML。

## 目标

用户点击 Download 后，可以自己选择下载 **Markdown** 还是 **PDF**。

## 方案概述

- **PDF 生成方式**：浏览器打印（`window.print()` + 打印专用 CSS）。零新依赖，不改 Docker 镜像，不改服务端逻辑。
- **选择器形态**：下拉菜单。保留单个 Download 按钮，点击弹出含 Markdown / PDF 两项的菜单。
- 全部改动集中在 `server.mjs` 的 `renderSharePage` 函数（HTML + CSS + 内联 JS）。**服务端 `/api/share/<token>/download` 端点完全不动。**

## 详细设计

### 1. 头部：按钮 → 下拉菜单

- 现有 `<a class="download-btn">` 改为 `<button class="download-btn">`，文案 "Download" + 尾部一个下拉箭头（caret svg）。
- 按钮外层包 `.download-wrap`（`position:relative`），内含绝对定位的 `.download-menu`，默认 `display:none`，展开时显示，定位在按钮下方、右对齐。
- 菜单两项，各带图标：
  - **Markdown**：`<a href="/api/share/<token>/download" download>` —— 走现有端点，行为不变。
  - **PDF**：`<button type="button">` —— 触发打印。
- 无障碍与触控：按钮加 `aria-haspopup="menu"`、`aria-expanded`（随开合切换）；菜单 `role="menu"`，项 `role="menuitem"`；移动端菜单项高度 ≥44px；保留可见 focus 态。

### 2. 下拉交互（内联 JS）

- 点击按钮切换菜单开合，同步 `aria-expanded`。
- 点击菜单外部关闭；按 `Esc` 关闭。
- 选中 PDF 项后先关菜单，再触发打印。

### 3. PDF = 浏览器打印

- 点 PDF → 关菜单 → `window.print()`；用户在系统打印对话框选"存储为 PDF"。
- 新增 `@media print` 样式：
  - 隐藏头部下载控件（`.download-wrap`），保留标题 `h1` 与 `.meta`。
  - **强制浅色排版**：`body` 白底、正文黑字，覆盖屏幕的深色模式变量，避免 PDF 深色底浪费墨、观感差。
  - 去掉容器多余 padding；代码块 / 表格 / 引用块用浅色边框，适配纸面。
  - 表格在打印下取消移动端的横向滚动（`display:block;overflow-x` 改回 `table`），保证完整呈现。
- **干净的 PDF 文件名**：打印前把 `document.title` 临时设为清洗过的文档标题（去掉 " - 站点名" 后缀），监听 `afterprint` 事件恢复原 `title`。这样保存的 PDF 默认名即文档标题。

### 4. 依赖与部署

- 零新依赖；不改 `Dockerfile` / `docker-compose.yml`；不改服务端路由与端点。
- 副作用说明：改成下拉后，Markdown 下载也需 JS 才能点开菜单。但页面本就依赖 JS 渲染正文（无 JS 时正文为空），未引入新的可用性退化。

## 不做的事（YAGNI）

- 不引入服务端 Puppeteer / 无头 Chromium。
- 不引入客户端 PDF 库（html2pdf / jsPDF）。
- 不改动主编辑器 App 的下载逻辑（本次仅针对公共分享页）。

## 验证

用 chrome-devtools 打开一个分享页：
- 下拉开 / 合、`Esc`、点外部关闭。
- Markdown 项正常下载 `.md`。
- PDF 项触发打印预览：确认浅色排版、无下载按钮、默认文件名为文档标题。
- 深色 / 浅色系统模式各验证一遍。
- 移动视口下菜单项触控尺寸与布局正常。
