# 侧边栏迷你栏（rail）收起/展开 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面端把侧边栏"收起"从整个隐藏改成迷你栏（rail，~60px，显示文档首字母块），移动端抽屉不变。

**Architecture:** 全部改动在 `public/index.html`（单文件，内联 CSS + JS）。桌面端 `.sidebar.collapsed` 从"负 margin 隐藏"改为"~60px 宽的 rail"（scope 在 `@media(min-width:769px)`，移动端不受影响）。`renderDocList()` 给每个 `.doc-item` 加首字母块 `.doc-mono` 与 `title`/`aria-label`；搜索框加"仅 rail 显示"的搜索图标按钮，点击展开并聚焦搜索框。复用现有 `markhive-sidebar` localStorage 持久化。

**Tech Stack:** 原生 HTML/CSS/JS（无框架、无构建）。无新依赖。

## Global Constraints

- 只改 `public/index.html`；不改服务端、不加依赖、不改 `Dockerfile`/`docker-compose.yml`。
- 移动端（`@media(max-width:768px)`）抽屉逻辑与 `.sidebar.open` 行为**保持不变**；rail 样式必须 scope 在 `@media(min-width:769px)`，不得泄漏到移动端。
- 复用现有 localStorage key `markhive-sidebar`（值 `expanded`/`collapsed`，`collapsed` 现在语义=rail）。
- 无 xUnit 测试框架：前端为单文件内联，验证用浏览器 E2E（chrome-devtools 连本地容器）。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 分支 `feature/sidebar-rail`，在 worktree `.worktrees/sidebar-rail/` 内作业。

---

## 共用：本地验证环境（每个 Task 的浏览器验证都用它）

把改后的 `public/index.html` 挂进镜像跑，关鉴权方便访问主界面并造数据：

```bash
# 在 worktree 根目录执行
docker run -d --rm --name mh-rail -p 3457:3457 -e ENABLE_AUTH=false -e API_KEY= \
  -v "$PWD/public/index.html:/app/public/index.html:ro" \
  ghcr.io/jx453331958/markhive:latest

# 造几篇文档，让侧边栏列表有内容（首字母块可见）
for t in "架构设计文档" "Release Notes" "会议纪要 0714" "API 参考"; do
  curl -s -X POST http://localhost:3457/api/docs -H 'Content-Type: application/json' \
    -d "{\"title\":\"$t\",\"content\":\"# $t\n\n正文内容。\"}" >/dev/null
done
echo "open http://localhost:3457/"
```

用 chrome-devtools MCP（`--browser-url=http://127.0.0.1:9222`，专用 profile；`list_pages` 报连不上就用
`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-debug-profile" &` 启动）打开 `http://localhost:3457/`。桌面视口用 `emulate` 设 `viewport 1280x800`。验证后 `docker stop mh-rail`。

---

## File Structure

- Modify: `public/index.html`
  - `:root` 变量（约 28 行）：加 `--rail-w`。
  - `.sidebar` 过渡与 `.sidebar.collapsed`（约 72–78 行）：改过渡属性、删除旧的负 margin collapsed 规则。
  - `.doc-item` 附近（约 137–160 行）：加 `.doc-mono`、`.search-rail-btn` 基础样式。
  - 新增桌面 rail 媒体块 `@media(min-width:769px)` 与 `@media(prefers-reduced-motion:reduce)`。
  - `.search-box` 标记（约 941–943 行）：加 `.search-rail-btn`。
  - `renderDocList()`（约 1412–1428 行）：加首字母块 + `title`/`aria-label`。
  - `applySidebar()`（约 1182–1187 行）与事件绑定区（约 2101 行附近）：aria-expanded + 搜索图标点击处理。

两个 Task：Task 1 = rail 的渲染（CSS + 首字母块 + 搜索图标标记，切换后 rail 视觉可用）；Task 2 = rail 的交互与无障碍（搜索图标展开+聚焦、aria-expanded）。边界清晰：reviewer 可单独否决渲染或交互。

---

### Task 1: Rail 渲染（CSS + 首字母块 + 搜索图标标记）

**Files:**
- Modify: `public/index.html`（`:root`、`.sidebar`/`.collapsed`、`.doc-item` 附近样式、新增媒体块、`.search-box` 标记、`renderDocList()`）。

**Interfaces:**
- Consumes: 现有 `.sidebar.collapsed` 切换机制（`applySidebar` 加/去 `.collapsed`）、`renderDocList` 的 `sorted`/`currentDoc`/`escapeHtml`/`formatTime`。
- Produces: CSS 类 `.doc-mono`（首字母块）、`.search-rail-btn`（rail 搜索图标，id 无，用 `.search-rail-btn` 选择）；每个 `.doc-item` 带 `title`/`aria-label`=完整标题、内含 `.doc-mono`。Task 2 依赖 `.search-rail-btn` 存在。

- [ ] **Step 1: 加 `--rail-w` 变量**

在 `:root` 中 `--sidebar-w: 280px;` 同组下方加一行：

```css
  --rail-w: 60px;
```

- [ ] **Step 2: 改 `.sidebar` 过渡属性**

把（约 72 行）：

```css
  transition: margin-left .25s ease, opacity .2s ease;
```

改为：

```css
  transition: width .25s ease, min-width .25s ease;
```

（移动端 `@media(max-width:768px)` 已用 `transition: transform .25s` 覆盖，不受影响。）

- [ ] **Step 3: 删除旧的整隐藏 `.sidebar.collapsed` 规则**

删除（约 74–78 行）整段：

```css
.sidebar.collapsed {
  margin-left: calc(var(--sidebar-w) * -1);
  opacity: 0;
  pointer-events: none;
}
```

rail 行为改在 Step 6 的桌面媒体块里定义。

- [ ] **Step 4: 加 `.doc-mono` 与 `.search-rail-btn` 基础样式**

在 `.doc-item-meta { ... }` 规则（约 156–160 行）之后插入：

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
.search-rail-btn {
  display: none;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color .2s, color .2s;
}
.search-rail-btn:hover { color: var(--text); border-color: var(--accent); }
.search-rail-btn svg { width: 16px; height: 16px; }
```

- [ ] **Step 5: 搜索框加 rail 搜索图标按钮**

把（约 941–943 行）：

```html
    <div class="search-box">
      <input type="text" id="searchInput">
    </div>
```

改为：

```html
    <div class="search-box">
      <input type="text" id="searchInput">
      <button class="search-rail-btn" id="searchRailBtn" type="button" aria-label="Search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>
```

- [ ] **Step 6: 新增桌面 rail 媒体块 + reduced-motion**

在 `.sidebar-toggle:hover { ... }` 规则（约 210 行）之后插入：

```css
/* ===== Desktop mini-rail (collapsed) ===== */
@media (min-width: 769px) {
  .sidebar.collapsed { width: var(--rail-w); min-width: var(--rail-w); overflow: hidden; }
  .sidebar.collapsed .sidebar-header { justify-content: center; padding: 14px 0; }
  .sidebar.collapsed .sidebar-header h1,
  .sidebar.collapsed .doc-count,
  .sidebar.collapsed .search-box input,
  .sidebar.collapsed .doc-item-title,
  .sidebar.collapsed .doc-item-meta,
  .sidebar.collapsed .sidebar-footer { display: none; }
  .sidebar.collapsed .search-box { display: flex; justify-content: center; padding: 10px 0; }
  .sidebar.collapsed .search-rail-btn { display: flex; }
  .sidebar.collapsed .doc-item { display: flex; justify-content: center; padding: 8px 0; border-left-color: transparent; }
  .sidebar.collapsed .doc-item.active { background: transparent; border-left-color: transparent; }
  .sidebar.collapsed .doc-mono { display: flex; }
  .sidebar.collapsed .doc-item.active .doc-mono { background: var(--accent); border-color: var(--accent); color: #fff; }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar { transition: none; }
}
```

- [ ] **Step 7: `renderDocList` 加首字母块 + title/aria-label**

把（约 1417–1423 行）：

```js
  list.innerHTML = sorted.map(doc => `
    <div class="doc-item${currentDoc && currentDoc.id === doc.id ? ' active' : ''}"
         data-id="${doc.id}">
      <div class="doc-item-title">${escapeHtml(doc.title)}</div>
      <div class="doc-item-meta">v${doc.version} · ${formatTime(doc.updated_at)}</div>
    </div>
  `).join('');
```

改为：

```js
  list.innerHTML = sorted.map(doc => {
    const title = escapeHtml(doc.title);
    const mono = escapeHtml(doc.title.trim().charAt(0) || '#');
    return `
    <div class="doc-item${currentDoc && currentDoc.id === doc.id ? ' active' : ''}"
         data-id="${doc.id}" title="${title}" aria-label="${title}">
      <span class="doc-mono" aria-hidden="true">${mono}</span>
      <div class="doc-item-title">${title}</div>
      <div class="doc-item-meta">v${doc.version} · ${formatTime(doc.updated_at)}</div>
    </div>
  `;
  }).join('');
```

- [ ] **Step 8: 浏览器验证（渲染）**

按"共用：本地验证环境"启动容器造数据，chrome-devtools 桌面视口（1280x800）打开 `http://localhost:3457/`：
- 初始为完整侧边栏（280px），标题/搜索框/文档标题+meta/底部均正常。
- 点左上角 ☰ → 侧边栏收缩为 ~60px rail：标题/计数/搜索输入框/文档标题+meta/底部隐藏；每个文档显示居中的首字母方块；新建 `+` 按钮与搜索图标可见。
- 当前打开的文档，其首字母块为 accent 高亮。
- 悬停文档首字母块，出现原生 tooltip（完整标题）。
- 再点 ☰ → 恢复完整侧边栏。
- 深/浅色模式各看一遍 rail。

Expected: 全部通过。验证后 `docker stop mh-rail`。

- [ ] **Step 9: 提交**

```bash
git add public/index.html
git commit -m "feat: render sidebar as mini-rail when collapsed on desktop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rail 交互与无障碍（搜索图标展开+聚焦、aria-expanded）

**Files:**
- Modify: `public/index.html`（`applySidebar()` 加 aria-expanded；事件绑定区加 `#searchRailBtn` 点击处理）。

**Interfaces:**
- Consumes: Task 1 的 `#searchRailBtn`（`.search-rail-btn`）、`#searchInput`、`#sidebarToggle`；全局 `sidebarCollapsed`、`applySidebar()`。
- Produces: 无对外接口。

- [ ] **Step 1: `applySidebar` 设置 aria-expanded**

把（约 1182–1187 行）：

```js
function applySidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('markhive-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  document.getElementById('sidebarToggle').title = t('toggleSidebar');
}
```

改为（追加一行 aria-expanded；展开=true / rail=false）：

```js
function applySidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('markhive-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  const toggle = document.getElementById('sidebarToggle');
  toggle.title = t('toggleSidebar');
  toggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
}
```

- [ ] **Step 2: 搜索图标点击 → 展开并聚焦搜索框**

在 `#sidebarToggle` 的点击监听（约 2101–2111 行）之后插入：

```js
document.getElementById('searchRailBtn').addEventListener('click', () => {
  if (sidebarCollapsed) { sidebarCollapsed = false; applySidebar(); }
  document.getElementById('searchInput').focus();
});
```

- [ ] **Step 3: 浏览器验证（交互 + a11y）**

按"共用：本地验证环境"启动（若容器已停则重启），chrome-devtools 桌面视口打开：
- 点 ☰ 收成 rail → 点 rail 里的搜索图标 → 侧边栏展开为完整，且搜索框获得焦点（可用 `evaluate_script` 读 `document.activeElement.id === 'searchInput'` 确认）。
- 检查 `#sidebarToggle` 的 `aria-expanded`：完整时为 `"true"`，rail 时为 `"false"`。
- 刷新页面：rail/完整状态按 localStorage 保持。
- `emulate` 设 `prefers-reduced-motion: reduce`（或读 `getComputedStyle(sidebar).transitionProperty`）确认 rail 切换无宽度动画。
- `emulate` 设 375px 移动视口：☰ 打开的仍是抽屉 + 遮罩（`.sidebar.open`），**不出现 60px rail**；rail 样式未泄漏。

Expected: 全部通过。验证后 `docker stop mh-rail`。

- [ ] **Step 4: 提交**

```bash
git add public/index.html
git commit -m "feat: rail search icon expands sidebar and focuses search; toggle aria-expanded

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（对照 spec）：**
- rail 布局：头部隐藏标题/计数保留新建 → Task1 Step6；搜索换图标 → Step5/6；文档首字母块+高亮+tooltip+aria → Step4/6/7；底部隐藏 → Step6。✅
- CSS：`--rail-w`、collapsed 改 rail、过渡改 width、reduced-motion、scope 桌面 → Task1 Step1/2/3/6。✅
- JS：renderDocList 首字母/aria → Task1 Step7；搜索图标展开+聚焦 → Task2 Step2；applySidebar aria-expanded → Task2 Step1。✅
- 复用 localStorage、移动端不变、rail 不泄漏移动端 → Global Constraints + Task1 Step6（min-width:769px）+ Task2 Step3 移动验证。✅
无遗漏。

**2. Placeholder scan：** 无 TBD/TODO；每个改代码步骤均给完整代码。✅

**3. Type/命名一致性：** id `searchRailBtn`/`searchInput`/`sidebarToggle`、类 `.doc-mono`/`.search-rail-btn`/`.sidebar.collapsed` 在 Task1 定义、Task2 引用一致；`sidebarCollapsed`/`applySidebar` 为现有全局，Task2 复用；`escapeHtml`/`formatTime`/`currentDoc`/`sorted` 均现有。✅
