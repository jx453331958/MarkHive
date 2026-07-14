# 侧边栏 rail 首字母块美化 + 右侧 hover 标题气泡 — 设计文档

日期：2026-07-14
分支：`feature/rail-polish`

## 背景

主应用 `public/index.html`。桌面端侧边栏收起为 ~60px rail 后，每个文档显示一个首字母块 `.doc-mono`（当前 40×40、字号 15px、字重 600、`text-transform:uppercase`、`--bg-elevated` 底 + `--border` 边框、`--text-bright` 字）。当前问题：首字母又大又粗、强制 uppercase、中文单字/emoji 混排，观感突兀不协调。rail 下识别文档目前只靠原生 `title` tooltip（有 ~500ms 延迟、样式不统一）。

参考开源惯例：这属于 Discord/Slack/Element 那类"实体头像栏"——首字母/缩写头像（字号不大、中等字重、圆角块、统一柔和底色）+ hover 弹出完整名字气泡。

## 目标

1. 把首字母块改得精致（对标 Discord/Slack 首字母头像）。
2. 加一个右侧即时 hover 气泡显示完整文档标题，方便 rail 下识别与跳转。

## 方案概述

- 全部改动在 `public/index.html`（CSS + 少量 JS + `renderDocList` 属性调整 + 一个静态 tooltip 容器）。
- 桌面 rail 专属；移动端抽屉与完整侧边栏不受影响。

## 详细设计

### 1. 首字母块 `.doc-mono` 重做

- 尺寸 40×40 → **38×38**；字号 15px → **14px**；字重 600 → **500**；**移除 `text-transform:uppercase`**；字色 `--text-bright` → **`--text`**。
- **移除边框**；圆角 8px → **10px**；底色仍统一 `--bg-elevated`（中性）。
- 加 `line-height:1` 与 `transition: background .15s, color .15s`。
- 状态（在桌面 rail 媒体块内）：
  - hover：`.sidebar.collapsed .doc-item:hover .doc-mono` 底 `--bg-hover`、字 `--text-bright`。
  - active：`.sidebar.collapsed .doc-item.active .doc-mono` 底 `--accent`、字 `#fff`（保留现状，去掉 border 引用）。
- 首字取值不变（`[...doc.title.trim()][0] || '#'`，首个码点）。

### 2. 右侧 hover 气泡 tooltip

- 新增单个静态容器 `<div id="railTooltip" class="rail-tooltip"></div>`（`position:fixed`，`z-index` 高于侧边栏，`pointer-events:none`，默认 `opacity:0`，`.show` 时 `opacity:1`，样式：`--bg-elevated` 底 + `--border` 边框 + 圆角 + 阴影 + `white-space:nowrap` + 13px 字）。
- 用 `fixed` 定位以**逃出** `.sidebar.collapsed` 的 `overflow:hidden` 裁剪。
- JS：在文档列表 `#docList` 上做事件委托——
  - `mouseover`：若 `sidebarCollapsed && window.innerWidth > 768` 且命中 `.doc-item`，取其 `aria-label` 为完整标题填入气泡，按该项 `getBoundingClientRect()` 定位到其右侧（`left = rect.right + 8`，`top = rect.top + rect.height/2`，`transform: translateY(-50%)`），加 `.show`。
  - `mouseout`（离开 `.doc-item`）：移除 `.show`。
  - `#docList` 滚动时：隐藏气泡（避免错位）。
- **移除** `renderDocList` 中 doc-item 的原生 `title` 属性（避免与自定义气泡重复弹两个），保留 `aria-label`（无障碍 + 作为气泡文本来源）。

### 3. 范围与不做

- 仅改 `public/index.html`；不动服务端/依赖/Docker；不动移动端抽屉与完整侧边栏逻辑。
- 不做键盘触发气泡（doc-item 本就非 focusable，与现状一致，`aria-label` 已供屏幕阅读器）——YAGNI。
- 不做每文档彩色底（本次用统一中性底）。

## 无障碍 / 交互

- 气泡 `pointer-events:none`，不干扰点击；`aria-label` 保留。
- 气泡仅桌面 rail 触发；移动端无 hover、rail 样式不生效，不受影响。
- reduced-motion：气泡是 opacity 过渡（≤120ms）；`.doc-mono` 的颜色过渡短，均属细微，可保留。

## 验证

chrome-devtools 桌面视口，rail 状态：
- 首字母块新样式（38px、14px、字重 500、无边框、圆角 10、柔和字色、无 uppercase）。
- 悬停某文档 → 右侧即时弹出完整标题气泡（含中文/emoji 标题）；移开消失；滚动隐藏。
- active 文档块为 accent 高亮；点击块跳转且保持 rail。
- 深/浅色各看一遍。
- 375px 移动视口：抽屉正常、无 rail、无气泡泄漏。
