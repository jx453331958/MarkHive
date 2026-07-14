# 侧边栏 rail 首字母块美化 + 右侧 hover 标题气泡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把桌面 rail 里的文档首字母块改精致（Discord/Slack 风），并加一个右侧即时 hover 气泡显示完整标题，方便 rail 下识别与跳转。

**Architecture:** 全部改动在 `public/index.html`。Task 1 纯 CSS 重做 `.doc-mono` 及其 rail 状态；Task 2 加一个 `position:fixed` 的自定义 tooltip（静态容器 + CSS + JS 事件），并从 `renderDocList` 移除原生 `title`（避免与自定义气泡重复）。桌面 rail 专属，移动端不受影响。

**Tech Stack:** 原生 HTML/CSS/JS，无框架、无依赖。

## Global Constraints

- 只改 `public/index.html`；不动服务端/依赖/Docker；不动移动端抽屉与完整侧边栏逻辑。
- rail 相关样式保持在 `@media(min-width:769px)` 内；tooltip 仅在 `sidebarCollapsed && window.innerWidth > 768` 触发。
- 无 xUnit 测试框架：单文件内联前端，验证用 chrome-devtools 浏览器 E2E。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 分支 `feature/rail-polish`，在 worktree `.worktrees/rail-polish/` 内作业。

---

## 共用：本地验证环境

```bash
# worktree 根目录
docker run -d --rm --name mh-polish -p 3457:3457 -e ENABLE_AUTH=false -e API_KEY= \
  -v "$PWD/public/index.html:/app/public/index.html:ro" \
  ghcr.io/jx453331958/markhive:latest
for t in "🚀火箭发射计划" "架构设计文档说明书很长的标题测试" "Release Notes" "会议纪要 0714"; do
  curl -s -X POST http://localhost:3457/api/docs -H 'Content-Type: application/json' \
    -d "{\"title\":\"$t\",\"content\":\"# $t\n\n正文。\"}" >/dev/null
done
echo "open http://localhost:3457/"
```

chrome-devtools MCP（`--browser-url=http://127.0.0.1:9222`，专用 profile；连不上用
`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-debug-profile" &`）。桌面视口 `emulate viewport 1280x800`，导航到 `http://localhost:3457/`，点 `#sidebarToggle` 收成 rail。验证后 `docker stop mh-polish`。

---

## File Structure

- Modify: `public/index.html`
  - `.doc-mono` 样式（约 157–171 行）— Task 1。
  - 桌面 rail 媒体块内 `.doc-mono` 的 hover/active 规则（约 252、255 行）— Task 1。
  - 新增 `.rail-tooltip` 样式；新增 `<div id="railTooltip">` 容器；新增 tooltip JS；`renderDocList` 移除原生 `title` 并加 hover 绑定 — Task 2。

两个 Task：Task 1 = 首字母块视觉；Task 2 = hover 标题气泡。可分别 review。

---

### Task 1: 首字母块 `.doc-mono` 美化

**Files:**
- Modify: `public/index.html`（`.doc-mono` 基础样式 + rail 块内 hover/active）。

**Interfaces:**
- Consumes: 现有 `.doc-mono` 元素（由 `renderDocList` 输出）、CSS 变量 `--bg-elevated`/`--text`/`--bg-hover`/`--text-bright`/`--accent`。
- Produces: 无接口变化，仅视觉。

- [ ] **Step 1: 重写 `.doc-mono` 基础样式**

把（约 157–171 行）整段：

```css
.doc-mono {
  display: none;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-bright);
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}
```

替换为：

```css
.doc-mono {
  display: none;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  flex-shrink: 0;
  transition: background .15s, color .15s;
}
```

- [ ] **Step 2: 更新 rail 块内 `.doc-mono` 的 hover/active 规则**

在桌面 rail 媒体块（约 239–256 行）内：

把 hover 规则（约 252 行）：

```css
  .sidebar.collapsed .doc-item:hover .doc-mono { background: var(--bg-hover); }
```

改为（加字色）：

```css
  .sidebar.collapsed .doc-item:hover .doc-mono { background: var(--bg-hover); color: var(--text-bright); }
```

把 active 规则（约 255 行）：

```css
  .sidebar.collapsed .doc-item.active .doc-mono { background: var(--accent); border-color: var(--accent); color: #fff; }
```

改为（移除已不存在的 border-color 引用）：

```css
  .sidebar.collapsed .doc-item.active .doc-mono { background: var(--accent); color: #fff; }
```

- [ ] **Step 3: 浏览器验证（视觉）**

按"共用：本地验证环境"启动，chrome-devtools 桌面视口收成 rail：
- 首字母块为 38×38、圆角更圆、无边框、字号更小（14px）、字重中等（500）、字色柔和（`--text`）、英文不再强制大写。
- 悬停某块 → 底变 `--bg-hover`、字变亮。
- 当前文档块 → accent 底 + 白字。
- 深/浅色各看一遍，观感协调（截图确认）。

Expected: 通过。`docker stop mh-polish`。

- [ ] **Step 4: 提交**

```bash
git add public/index.html
git commit -m "feat: refine rail monogram tiles (smaller, medium weight, softer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 右侧 hover 标题气泡

**Files:**
- Modify: `public/index.html`（新增 `.rail-tooltip` CSS、`#railTooltip` 容器、tooltip JS、`renderDocList` 移除 `title` + 加 hover 绑定）。

**Interfaces:**
- Consumes: 全局 `sidebarCollapsed`、`#docList`、`.doc-item` 的 `aria-label`。
- Produces: 全局函数 `showRailTip(item)`、`hideRailTip()`；元素 `#railTooltip`。

- [ ] **Step 1: 新增 `.rail-tooltip` 样式**

在 `.doc-mono { ... }` 规则（Task 1 改后，约 157–171 行）之后插入：

```css
.rail-tooltip {
  position: fixed;
  z-index: 100;
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-bright);
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
  pointer-events: none;
  opacity: 0;
  transform: translateY(-50%);
  transition: opacity .12s;
}
.rail-tooltip.show { opacity: 1; }
```

- [ ] **Step 2: 新增静态 tooltip 容器**

在 `</body>`（约 2234 行）之前插入：

```html
<div class="rail-tooltip" id="railTooltip"></div>
```

- [ ] **Step 3: `renderDocList` 移除原生 `title` + 加 hover 绑定**

把当前（约 `function renderDocList` 内）：

```js
    <div class="doc-item${currentDoc && currentDoc.id === doc.id ? ' active' : ''}"
         data-id="${doc.id}" title="${title}" aria-label="${title}">
```

改为（移除 `title="${title}"`，保留 `aria-label`）：

```js
    <div class="doc-item${currentDoc && currentDoc.id === doc.id ? ' active' : ''}"
         data-id="${doc.id}" aria-label="${title}">
```

并把该函数底部的绑定循环：

```js
  list.querySelectorAll('.doc-item').forEach(el => {
    el.addEventListener('click', () => selectDoc(el.dataset.id));
  });
```

改为（加 hover 进/出绑定；并在重建前清掉可能残留的气泡）：

```js
  hideRailTip();
  list.querySelectorAll('.doc-item').forEach(el => {
    el.addEventListener('click', () => selectDoc(el.dataset.id));
    el.addEventListener('mouseenter', () => showRailTip(el));
    el.addEventListener('mouseleave', hideRailTip);
  });
```

- [ ] **Step 4: 新增 tooltip 辅助函数 + 滚动隐藏绑定**

在 `renderDocList` 函数定义之前（或 `applySidebar` 附近的顶层）插入两个函数：

```js
function showRailTip(item) {
  if (!sidebarCollapsed || window.innerWidth <= 768) return;
  const tip = document.getElementById('railTooltip');
  tip.textContent = item.getAttribute('aria-label') || '';
  const r = item.getBoundingClientRect();
  tip.style.top = (r.top + r.height / 2) + 'px';
  tip.style.left = (r.right + 8) + 'px';
  tip.classList.add('show');
}
function hideRailTip() {
  document.getElementById('railTooltip').classList.remove('show');
}
```

并在事件绑定区（如 `#searchRailBtn` 的监听附近）加一行——列表滚动时隐藏气泡：

```js
document.getElementById('docList').addEventListener('scroll', hideRailTip);
```

- [ ] **Step 5: 浏览器验证（气泡）**

按"共用：本地验证环境"启动，chrome-devtools 桌面视口收成 rail：
- 悬停某文档块 → 其**右侧即时**弹出完整标题气泡（用长标题、中文、🚀 emoji 标题各验证一遍），样式为 elevated 底 + 边框 + 圆角 + 阴影；移开鼠标气泡消失。
- 用 `evaluate_script` 确认：hover 时 `#railTooltip` 有 `show` 类、`textContent` 为完整标题、`left` 约等于该项右边缘 + 8px。
- 滚动文档列表 → 气泡隐藏。
- doc-item **不再有原生 `title` 属性**（`evaluate_script` 读 `document.querySelector('.doc-item').hasAttribute('title') === false`），不出现双重 tooltip。
- 点击块跳转且保持 rail；跳转后无残留气泡。
- 375px 移动视口：抽屉正常、无气泡（`showRailTip` 的宽度守卫）。

Expected: 通过。`docker stop mh-polish`。

- [ ] **Step 6: 提交**

```bash
git add public/index.html
git commit -m "feat: right-side hover tooltip shows full doc title in collapsed rail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage：**
- 首字母块美化（尺寸/字号/字重/去 uppercase/柔和字色/去边框/圆角/hover/active）→ Task 1 Step1/2。✅
- 右侧 hover 气泡（fixed 定位逃出 overflow、即时、样式统一、仅桌面 rail、滚动隐藏）→ Task 2 Step1/2/4。✅
- 移除原生 title 保留 aria-label → Task 2 Step3。✅
- 桌面专属 / 移动端不受影响 → Global Constraints + showRailTip 宽度守卫 + Task2 Step5 移动验证。✅
无遗漏。

**2. Placeholder scan：** 无 TBD/TODO；每步给完整代码。✅

**3. Type/命名一致性：** `showRailTip`/`hideRailTip`/`#railTooltip`/`.rail-tooltip` 在 Task 2 内定义并互相引用一致；`sidebarCollapsed`/`#docList`/`aria-label`/`renderDocList` 为现有；Task 1 与 Task 2 不冲突（Task 1 仅 CSS，Task 2 依赖 Task 1 后的 `.doc-mono` 存在但不改其规则）。✅
