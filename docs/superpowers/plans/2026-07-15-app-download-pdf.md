# 主应用编辑器下载增加 PDF 选项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主应用编辑器的「下载」按钮点击后可选 Markdown 或 PDF；PDF 用隐藏打印容器 + `@media print` 只打印干净文档正文。

**Architecture:** 全部改动在 `public/index.html`。Task 1 加 PDF 基础设施（隐藏 `#printArea` 容器 + `@media print` 样式 + `downloadPdf()` 函数），先让"打印出干净文档"跑通。Task 2 把工具栏 `#btnRaw` 从直接下载改成下拉菜单（Markdown / PDF），Markdown 沿用现逻辑、PDF 调用 Task 1 的 `downloadPdf()`。

**Tech Stack:** 原生 HTML/CSS/JS + 页面已加载的 `marked`。无新依赖、无服务端改动。

## Global Constraints

- 只改 `public/index.html`；不动服务端/依赖/Docker/分享页。
- PDF 打印用**已保存的** `currentDoc.content`（与 Markdown 下载一致），不含编辑框未保存草稿。
- `@media print` 的浅色变量设在 `#printArea` 上（而非 `:root`），以稳健覆盖 app 的主题机制、不依赖源码顺序。
- 无 xUnit：单文件内联前端，验证用 chrome-devtools 浏览器 E2E（打印外观受工具限制处如实说明）。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 分支 `feature/app-download-pdf`，worktree `.worktrees/app-download-pdf/`。

---

## 共用：本地验证环境

```bash
# worktree 根目录
docker run -d --rm --name mh-appdl -p 3457:3457 -e ENABLE_AUTH=false -e API_KEY= \
  -v "$PWD/public/index.html:/app/public/index.html:ro" ghcr.io/jx453331958/markhive:latest
DOCID=$(curl -s -X POST http://localhost:3457/api/docs -H 'Content-Type: application/json' \
  -d '{"title":"下载测试文档","content":"# 下载测试文档\n\n段落文字。\n\n## 表格\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## 代码\n\n```js\nconst x = 1;\n```\n\n> 引用块\n"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "open http://localhost:3457/#/doc/$DOCID"
```
chrome-devtools MCP（`--browser-url=http://127.0.0.1:9222`，专用 profile；连不上用
`/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-debug-profile" &`）。桌面视口 `emulate viewport 1280x800`，打开上面的 URL（会进入该文档的查看模式）。验证后 `docker stop mh-appdl`。

---

## File Structure

- Modify: `public/index.html`
  - `<style>`：新增 `#printArea{display:none}` + `@media print{...}` + `.download-wrap/.download-menu/.download-item/#btnRaw` 下拉样式。
  - `<body>`：`</body>` 前加 `<div id="printArea"></div>`；`#mainActions` 内 `#btnRaw` 改为下拉结构。
  - `<script>`：新增 `downloadPdf()`/`downloadMarkdown()` + 下拉交互；改标签写入（`#btnRawLabel`）；移除旧的 `#btnRaw` 直接下载 handler。

两个 Task：Task 1 = PDF 打印基础设施（先跑通"打印出干净文档"）；Task 2 = 下拉 UI（接线 Markdown + PDF）。

---

### Task 1: PDF 打印基础设施（#printArea + @media print + downloadPdf）

**Files:**
- Modify: `public/index.html`（`<style>` 加 `#printArea` 基础样式 + `@media print` 块；`<body>` 加 `#printArea` 容器；`<script>` 加 `downloadPdf()`）。

**Interfaces:**
- Consumes: 全局 `currentDoc`（`.content`/`.title`）、页面已加载的 `marked`。
- Produces: 全局函数 `downloadPdf()`（Task 2 的 PDF 菜单项调用）；元素 `#printArea`。

- [ ] **Step 1: 加隐藏打印容器**

在 `</body>`（约 2246 行附近，`</script>` 之后 `</body>` 之前）加：

```html
<div id="printArea"></div>
```

- [ ] **Step 2: 加 `#printArea` 基础样式 + `@media print` 块**

在 `<style>` 末尾（`</style>` 前）加：

```css
#printArea { display: none; }
@media print {
  .app, .mobile-toggle, .sidebar-overlay { display: none !important; }
  #printArea {
    display: block !important;
    --bg-deep: #fff; --bg-surface: #fff; --bg-elevated: #f5f5f5; --bg-hover: transparent;
    --accent: #333; --text: #000; --text-bright: #000; --text-muted: #444; --border: #ccc;
  }
  body { background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #printArea .markdown-body { max-width: none; padding: 24px 0; color: #000; }
  #printArea .markdown-body a { text-decoration: underline; }
  #printArea .markdown-body table { display: table; overflow: visible; }
  #printArea .markdown-body pre,
  #printArea .markdown-body blockquote,
  #printArea .markdown-body table,
  #printArea .markdown-body img { page-break-inside: avoid; break-inside: avoid; }
}
```

说明：把浅色变量设在 `#printArea` 上，其后代 `.markdown-body`（用 `var(--text-bright)` 等）自动取浅色值，稳健覆盖主题、无需逐条改色。

- [ ] **Step 3: 加 `downloadPdf()` 函数**

在 `<script>` 里、`function renderDocList` 或其它顶层函数附近（`btnRaw` 事件绑定区之前）加：

```js
function downloadPdf() {
  if (!currentDoc) return;
  const area = document.getElementById('printArea');
  area.innerHTML = '<div class="markdown-body">' + marked.parse(currentDoc.content) + '</div>';
  const prevTitle = document.title;
  const clean = (currentDoc.title || 'document')
    .replace(/[\x00-\x1f/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';
  const restore = () => { document.title = prevTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  document.title = clean;
  window.print();
}
```

- [ ] **Step 4: 验证（打印隔离）**

按"共用：本地验证环境"启动，chrome-devtools 打开文档查看页：
- `evaluate_script` 执行 `downloadPdf` 的填充部分并读回：
  `(() => { const a=document.getElementById('printArea'); a.innerHTML='<div class="markdown-body">'+marked.parse(currentDoc.content)+'</div>'; return { filled: a.querySelector('.markdown-body') !== null, hasTable: !!a.querySelector('table') }; })()` → `filled:true`。
- 打印外观（工具受限，用临时无条件套用打印规则来目视）：`evaluate_script` 注入一个把上面 `@media print` 规则改成无条件的 `<style>`（或给 `<html>` 加一个测试类复制这些规则），确认屏幕上只剩 `#printArea` 的浅色文档、`.app` 隐藏、表格/代码块/引用完整；`take_screenshot` 记录。移除测试样式。
- 用 `evaluate_script` 确认 `document.title` 在设定 clean 后等于文档标题（可直接调用 `downloadPdf` 后用 `window.print` 被 stub 拦截来读 title；或只验证填充 + 标题赋值逻辑）。
- 若可行，另用 headless `--print-to-pdf` 对已注入 `#printArea` 的页面做一次真打印目视（工具不支持则如实记为 concern）。

Expected: 打印内容为干净浅色文档正文、无 app 界面。`docker stop mh-appdl`。

- [ ] **Step 5: 提交**

```bash
git add public/index.html
git commit -m "feat: add print area and downloadPdf() for main-app document export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 下载按钮改下拉菜单（Markdown / PDF）

**Files:**
- Modify: `public/index.html`（`#mainActions` 内 `#btnRaw` 结构；下拉 CSS；标签写入行；`<script>` 加 `downloadMarkdown()` + 下拉交互；移除旧 `#btnRaw` 下载 handler）。

**Interfaces:**
- Consumes: Task 1 的 `downloadPdf()`；全局 `currentDoc`；i18n `t('raw')`。
- Produces: 元素 `#btnRawLabel`、`#dlAppMenu`、`#dlAppMd`、`#dlAppPdf`；函数 `downloadMarkdown()`。

- [ ] **Step 1: 把 `#btnRaw` 改成下拉结构**

把（约 1042 行）：

```html
        <button class="action-btn" id="btnRaw"></button>
```

替换为：

```html
        <div class="download-wrap">
          <button class="action-btn" id="btnRaw" aria-haspopup="menu" aria-expanded="false">
            <span id="btnRawLabel"></span>
            <svg class="dl-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="download-menu" id="dlAppMenu" role="menu" aria-labelledby="btnRaw" hidden>
            <button type="button" class="download-item" role="menuitem" id="dlAppMd">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Markdown</span>
            </button>
            <button type="button" class="download-item" role="menuitem" id="dlAppPdf">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>PDF</span>
            </button>
          </div>
        </div>
```

- [ ] **Step 2: 加下拉 CSS**

在 `.action-btn.danger:hover { ... }` 规则（约 308 行）之后加：

```css
.download-wrap { position: relative; }
#btnRaw { display: inline-flex; align-items: center; gap: 4px; }
#btnRaw .dl-caret { width: 12px; height: 12px; transition: transform .15s; }
#btnRaw[aria-expanded="true"] .dl-caret { transform: rotate(180deg); }
.download-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 160px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 40; }
.download-menu[hidden] { display: none; }
.download-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 12px; min-height: 40px; box-sizing: border-box; font-family: inherit; font-size: 14px; color: var(--text-bright); background: none; border: none; border-radius: 6px; cursor: pointer; text-align: left; }
.download-item svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--text-muted); }
.download-item:hover { background: var(--bg-hover); }
```

- [ ] **Step 3: 标签写入改为 `#btnRawLabel`**

把（约 1377 行）：

```js
    document.getElementById('btnRaw').textContent = t('raw');
```

改为：

```js
    document.getElementById('btnRawLabel').textContent = t('raw');
```

- [ ] **Step 4: 替换 `#btnRaw` 的事件处理为下拉 + Markdown/PDF**

把当前（约 2159–2168 行）整段：

```js
  document.getElementById('btnRaw').addEventListener('click', () => {
    if (!currentDoc) return;
    const blob = new Blob([currentDoc.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDoc.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });
```

替换为：

```js
  (function () {
    const btn = document.getElementById('btnRaw');
    const menu = document.getElementById('dlAppMenu');
    function openMenu() { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    function closeMenu() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', (e) => { if (!currentDoc) return; e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !btn.contains(e.target) && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); btn.focus(); } });
    document.getElementById('dlAppMd').addEventListener('click', () => { closeMenu(); downloadMarkdown(); });
    document.getElementById('dlAppPdf').addEventListener('click', () => { closeMenu(); downloadPdf(); });
  })();
```

- [ ] **Step 5: 加 `downloadMarkdown()` 函数**

在 `downloadPdf()` 函数（Task 1 所加）附近加：

```js
function downloadMarkdown() {
  if (!currentDoc) return;
  const blob = new Blob([currentDoc.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentDoc.title}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: 验证（下拉 + 两项）**

按"共用：本地验证环境"启动，chrome-devtools 打开文档：
- 工具栏下载按钮显示为 "下载 ▾"（label + caret）；点击弹出菜单，含 Markdown / PDF 两项；`aria-expanded` 切 true、caret 翻转。
- 再点 / 点外部 / `Esc` 均关闭。
- 点 Markdown → 下载 `${title}.md`（chrome://downloads 确认或拦截 `a.click`）。
- 点 PDF → 触发打印（可 stub `window.print` 确认被调用 + `#printArea` 被填充 + `document.title` 临时为标题）。
- 切到编辑模式再点 PDF → 仍能打印（`#printArea` 用已保存内容填充，与模式无关）。
- 中英文切换：按钮标签随 `t('raw')` 变，菜单 Markdown/PDF 不变。
- 375px 移动视口：菜单定位正常、可点。

Expected: 全部通过。`docker stop mh-appdl`。

- [ ] **Step 7: 提交**

```bash
git add public/index.html
git commit -m "feat: main-app download button becomes Markdown/PDF dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage：**
- 下载按钮→下拉（Markdown/PDF、图标、aria、外部/ESC 关闭）→ Task 2 Step1/2/4。✅
- Markdown 沿用现逻辑（已保存内容）→ Task 2 Step5。✅
- PDF = 隐藏打印容器 + `window.print()` + 文件名 → Task 1 Step1/3。✅
- `@media print` 只显示 `#printArea`、隐藏 app、浅色、纸面适配 → Task 1 Step2。✅
- 任何模式可打印（用已保存内容）→ Task 1 Step3（填充 currentDoc.content）+ Task 2 Step6 编辑模式验证。✅
- 仅改 index.html、不动服务端/分享页 → Global Constraints + File Structure。✅
无遗漏。

**2. Placeholder scan：** 无 TBD/TODO；每步给完整代码。✅

**3. Type/命名一致性：** `downloadPdf`（Task1 定义、Task2 Step4 调用）、`downloadMarkdown`（Task2 定义+调用）、`#printArea`（Task1 建、Task1/downloadPdf 用）、`#btnRaw`/`#btnRawLabel`/`#dlAppMenu`/`#dlAppMd`/`#dlAppPdf`（Task2 内定义并引用一致）、`currentDoc`/`marked`/`t` 为现有。Task 2 依赖 Task 1 的 `downloadPdf` 已定义（顺序：先 Task1 后 Task2）。✅
