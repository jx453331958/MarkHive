# 侧边栏迷你栏（rail）收起/展开 — 设计文档

日期：2026-07-14
分支：`feature/sidebar-rail`

## 背景

主应用前端 `public/index.html`（单文件，内联 CSS + JS）。左侧 `.sidebar`（宽 `--sidebar-w: 280px`）含：头部（`MarkHive` 标题 + 文档计数徽章 `#docCount` + 新建按钮 `.new-doc-btn`）、搜索框 `.search-box input`、文档列表 `.doc-list`（`renderDocList()` 渲染的 `.doc-item`，含 `.doc-item-title` + `.doc-item-meta`）、底部 `.sidebar-footer`（排序/语言/登出）。

当前已有收起/展开：主头部左上角 `#sidebarToggle`（☰）——桌面端切换 `.sidebar.collapsed`（负 `margin-left` + `opacity:0`，**整个隐藏**），状态存 localStorage `markhive-sidebar`；移动端（≤768px）切换 `.sidebar.open` 抽屉 + 遮罩。

## 目标

把桌面端"收起"从**整个隐藏**改为**迷你栏（rail，~60px）**，保留导航感。移动端抽屉行为不变。

## 方案概述

- 桌面端两个状态：完整（280px）↔ rail（~60px），沿用现有 `#sidebarToggle` 切换。
- 复用现有 `markhive-sidebar` localStorage 持久化；`collapsed` 语义从"隐藏"变为"rail"。
- 全部改动在 `public/index.html`（CSS + `renderDocList` + 搜索框标记 + 少量 JS）。移动端逻辑不改。

## 详细设计

### 1. Rail 布局（宽 `--rail-w: 60px`）

- **头部**：保留 `.new-doc-btn`（居中）；隐藏 `.sidebar-header h1` 与 `.doc-count`。
- **搜索**：`.search-box input` 隐藏，显示一个"仅 rail 显示"的搜索图标按钮 `.search-rail-btn`；点击 → 展开为完整侧边栏并聚焦搜索框（rail 太窄无法输入）。
- **文档列表**：每个 `.doc-item` 在 rail 下呈现为 ~40px 首字母方块（`.doc-mono`，取 `doc.title` 首个非空字符）；当前文档保留 `.active` 高亮（accent）；`title` 与 `aria-label` = 完整标题；点击照常 `selectDoc`（保持 rail）。列表竖向滚动保留。
- **底部** `.sidebar-footer`：rail 下隐藏（次要控件）。

### 2. CSS

- 新增 `:root --rail-w: 60px`。
- 重定义 `.sidebar.collapsed`（在 `@media(min-width:769px)` 内，**仅桌面**）：`width/min-width: var(--rail-w)`，不再用负 margin/opacity。
- rail 子元素显隐规则（均在 `@media(min-width:769px)`）：`.collapsed` 时隐藏 `.sidebar-header h1`、`.doc-count`、`.search-box input`、`.doc-item-title`、`.doc-item-meta`、`.sidebar-footer`；显示 `.doc-mono`、`.search-rail-btn`；`.doc-item` 改为居中布局。
- 默认（非 rail）：`.doc-mono`、`.search-rail-btn` 隐藏。
- 过渡：`.sidebar` 由过渡 `margin-left` 改为过渡 `width`；`@media(prefers-reduced-motion:reduce)` 下禁用该过渡。
- rail 样式全部 scope 在 `@media(min-width:769px)`，移动端 `@media(max-width:768px)` 的抽屉规则不受影响。

### 3. JS

- `renderDocList()`：每个 `.doc-item` 追加 `<span class="doc-mono" aria-hidden="true">{首字}</span>`，并设置 `title` 与 `aria-label` = 完整标题。首字取 `doc.title` trim 后第一个字符（无则回退占位如 `#`）。
- 搜索框新增 `.search-rail-btn`（SVG 放大镜图标）：点击时若处于 collapsed 则 `sidebarCollapsed=false; applySidebar()` 展开，并 `focus()` 搜索输入框。
- `applySidebar()`：逻辑不变（切 `.collapsed` + 存 localStorage），追加设置 `#sidebarToggle` 的 `aria-expanded`（展开=true / rail=false）。
- 桌面端 `#sidebarToggle` 点击处理不变（翻转 `sidebarCollapsed` → 现在得到 rail）。

## 无障碍 / 交互

- 首字母块非文字信息：`.doc-item` 带 `aria-label`=完整标题，`.doc-mono` `aria-hidden`。
- tooltip 用原生 `title`。
- `#sidebarToggle` 带 `aria-expanded`、`aria-label`（复用 `toggleSidebar` 文案）。
- 保留可见 focus 态；rail 按钮点击区域适中（桌面端）。
- 动画：仅过渡宽度（一次性布局变化），`prefers-reduced-motion` 下禁用。

## 不做（YAGNI）

- 不做悬停临时展开（hover-peek，易抖动）。
- 不做桌面三态（完整/rail/全隐藏）。
- 不改移动端抽屉逻辑。

## 验证

用 chrome-devtools 连本地容器实例：
- 桌面：☰ 切 rail↔完整；rail 下首字母块 + tooltip + `.active` 高亮正确；搜索图标点击展开并聚焦搜索框。
- 刷新后 rail/完整状态保持（localStorage）。
- `prefers-reduced-motion` 下无宽度动画。
- 375px 移动视口：抽屉行为与遮罩不受影响（rail 样式不泄漏到移动端）。
- 深/浅色模式各看一遍。
