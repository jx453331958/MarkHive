# 分享页下载增加 PDF 选项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让公共分享页的 Download 按钮变成下拉菜单，用户点击后可选择下载 Markdown 或 PDF（PDF 走浏览器打印）。

**Architecture:** 全部改动在 `server.mjs` 的 `renderSharePage(share)` 函数内——它返回一段服务端渲染的 HTML 字符串（含内联 CSS 与 JS）。把原来单个 `<a>` 下载链接改为“按钮 + 下拉菜单”；Markdown 项复用现有端点 `GET /api/share/<token>/download`，PDF 项调用 `window.print()` 并配一套 `@media print` 浅色打印样式。服务端路由与端点不改。

**Tech Stack:** Node.js（无框架 `http`）、服务端字符串模板、原生浏览器 JS/CSS。无新依赖。

## Global Constraints

- 零新依赖：不改 `package.json`、`Dockerfile`、`docker-compose.yml`。
- 只改 `server.mjs` 的 `renderSharePage` 函数；**不改** `handleShareDownload` 及 `/api/share/<token>/download` 端点。
- 无 xUnit 测试框架：项目无测试目录/框架，`renderSharePage` 未导出，且 `server.mjs` 一加载即初始化 SQLite + 监听端口，host 上 better-sqlite3 原生绑定无法加载。因此验证手段为：`node --check server.mjs`（语法）+ 在 Docker 镜像里挂载改后的 `server.mjs` 跑起来、用 chrome-devtools 做端到端浏览器验证。
- 提交信息结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 分支 `feature/share-download-pdf`，在 worktree `.worktrees/share-download-pdf/` 内作业。

---

## 共用：本地验证环境（每个 Task 的浏览器验证都用它）

镜像 `ghcr.io/jx453331958/markhive:latest` 内含已编译的 better-sqlite3。把改后的 `server.mjs` 挂进去跑，关掉鉴权方便建测试数据：

```bash
# 在 worktree 根目录执行；后台启动
docker run -d --rm --name mh-verify -p 3457:3457 \
  -e ENABLE_AUTH=false -e API_KEY= \
  -v "$PWD/server.mjs:/app/server.mjs:ro" \
  ghcr.io/jx453331958/markhive:latest

# 造一个含标题/表格/代码块/长内容的测试文档，拿到 docId
DOCID=$(curl -s -X POST http://localhost:3457/api/docs \
  -H 'Content-Type: application/json' \
  -d '{"title":"打印测试文档 Print Test","content":"# 打印测试文档\n\n段落文字。\n\n## 表格\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## 代码\n\n```js\nconst x = 1;\n```\n\n> 引用块\n"}' \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

# 建分享，拿到 token
TOKEN=$(curl -s -X POST http://localhost:3457/api/docs/$DOCID/share \
  -H 'Content-Type: application/json' -d '{}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

echo "Share URL: http://localhost:3457/share/$TOKEN"
```

用 chrome-devtools MCP（`--browser-url=http://127.0.0.1:9222`，专用 profile）打开该 URL 验证。验证结束后 `docker stop mh-verify`。

---

## File Structure

- Modify: `server.mjs` — 仅 `renderSharePage(share)` 函数（约 527–620 行）：头部 HTML 块、`.download-*` 相关 CSS、`@media print` CSS、内联 `<script>` 交互与打印文件名逻辑。

无新建文件。两个 Task 都改同一函数的不同片段，边界清晰、可分别 review：Task 1 = 下拉菜单本体（结构 + 屏幕样式 + 交互，Markdown 可下载、PDF 触发打印）；Task 2 = 打印样式与干净的 PDF 文件名（让打印出来的 PDF 浅色、无按钮、默认名为文档标题）。

---

### Task 1: 把 Download 按钮改成下拉菜单（Markdown / PDF）

**Files:**
- Modify: `server.mjs` — `renderSharePage`：头部 `<a class="download-btn">…</a>` 块、`.download-btn` 相关 CSS、页面末尾 `<script>` 追加下拉交互。

**Interfaces:**
- Consumes: `share.token`（用于 Markdown 下载链接）、`escapeHtmlServer`（已存在）。
- Produces: DOM 元素 id `dlBtn`（触发按钮）、`dlMenu`（菜单容器）、`dlPdf`（PDF 菜单项按钮）；Task 2 的打印文件名脚本与 `dlPdf` 的点击行为独立，不依赖本 Task 的内部变量。

- [ ] **Step 1: 替换头部下载按钮的 HTML 块**

在 `renderSharePage` 中，找到当前的（约 574–577 行）：

```html
<a class="download-btn" href="/api/share/${escapeHtmlServer(share.token)}/download" download title="Download Markdown">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
<span>Download</span>
</a>
```

整块替换为：

```html
<div class="download-wrap">
<button type="button" class="download-btn" id="dlBtn" aria-haspopup="menu" aria-expanded="false" title="Download">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
<span>Download</span>
<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
</button>
<div class="download-menu" id="dlMenu" role="menu" aria-labelledby="dlBtn" hidden>
<a class="download-item" role="menuitem" href="/api/share/${escapeHtmlServer(share.token)}/download" download>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
<span>Markdown</span>
</a>
<button type="button" class="download-item" role="menuitem" id="dlPdf">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
<span>PDF</span>
</button>
</div>
</div>
```

- [ ] **Step 2: 更新 `.download-btn` 相关 CSS**

找到当前的（约 549–551 行）：

```css
.download-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:500;color:var(--text-bright);background:var(--elevated);border:1px solid var(--border);border-radius:8px;text-decoration:none;cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap;flex-shrink:0}
.download-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.download-btn svg{width:14px;height:14px}
```

整段替换为：

```css
.download-wrap{position:relative;flex-shrink:0}
.download-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:500;color:var(--text-bright);background:var(--elevated);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:background .15s,border-color .15s;white-space:nowrap}
.download-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.download-btn svg{width:14px;height:14px}
.download-btn .caret{width:12px;height:12px;transition:transform .15s}
.download-btn[aria-expanded="true"] .caret{transform:rotate(180deg)}
.download-menu{position:absolute;top:calc(100% + 6px);right:0;min-width:160px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:20}
.download-menu[hidden]{display:none}
.download-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;min-height:44px;box-sizing:border-box;font-family:inherit;font-size:14px;color:var(--text-bright);background:none;border:none;border-radius:6px;text-decoration:none;cursor:pointer;text-align:left}
.download-item svg{width:16px;height:16px;flex-shrink:0;color:var(--text-muted)}
.download-item:hover{background:var(--elevated)}
```

- [ ] **Step 3: 移动端按钮全宽**

找到当前移动端头部规则（约 546 行）：

```css
@media(max-width:768px){.header h1{font-size:22px}.header{flex-direction:column;align-items:stretch}}
```

改为（追加 `.download-btn` 全宽居中，保持原来移动端满宽观感）：

```css
@media(max-width:768px){.header h1{font-size:22px}.header{flex-direction:column;align-items:stretch}.download-wrap{width:100%}.download-btn{width:100%;justify-content:center}}
```

- [ ] **Step 4: 追加下拉交互脚本**

在页面末尾 `<script>` 内、已有的目录 slug/锚点 IIFE 之后，追加：

```js
(function(){
  var btn=document.getElementById('dlBtn'),menu=document.getElementById('dlMenu'),pdf=document.getElementById('dlPdf');
  function open(){menu.hidden=false;btn.setAttribute('aria-expanded','true')}
  function close(){menu.hidden=true;btn.setAttribute('aria-expanded','false')}
  btn.addEventListener('click',function(e){e.stopPropagation();menu.hidden?open():close()});
  document.addEventListener('click',function(e){if(!menu.hidden&&!btn.contains(e.target)&&!menu.contains(e.target))close()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!menu.hidden){close();btn.focus()}});
  menu.addEventListener('click',function(e){var it=e.target.closest('.download-item');if(it&&it!==pdf)close()});
  pdf.addEventListener('click',function(){close();window.print()});
})();
```

- [ ] **Step 5: 语法检查**

Run: `node --check server.mjs`
Expected: 无输出（退出码 0）。

- [ ] **Step 6: 浏览器端到端验证**

按“共用：本地验证环境”启动容器并拿到 Share URL。用 chrome-devtools 打开，逐项确认：
- 头部是单个 “Download ▾” 按钮；点击后在下方弹出菜单，含 “Markdown”“PDF” 两项（各带图标），`aria-expanded` 变 `true`、caret 翻转。
- 再次点按钮 / 点菜单外部 / 按 `Esc` 均能关闭菜单。
- 点 “Markdown” 触发 `.md` 文件下载（Content-Disposition attachment），菜单关闭。
- 点 “PDF” 弹出系统打印对话框（本 Task 只验证“能触发打印”，打印排版留待 Task 2）。
- 缩到 375px 视口：按钮全宽居中，菜单项高度 ≥44px、可正常点击。

Expected: 上述全部通过。验证后 `docker stop mh-verify`。

- [ ] **Step 7: 提交**

```bash
git add server.mjs
git commit -m "feat: turn share-page Download into Markdown/PDF dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 打印样式 + 干净的 PDF 文件名

**Files:**
- Modify: `server.mjs` — `renderSharePage`：`<style>` 末尾新增 `@media print` 块；页面末尾 `<script>` 追加打印文件名切换。

**Interfaces:**
- Consumes: `sanitizeFilename`（已存在，服务端函数，约 503 行）、`share.title`、`JSON.stringify`（内联注入字符串字面量）。
- Produces: 无对外接口；仅影响打印呈现与 PDF 默认文件名。

- [ ] **Step 1: 新增 `@media print` 样式**

在 `<style>` 块末尾（即当前最后一条移动端 `.markdown-body` 规则之后、`</style>` 之前）追加：

```css
@media print{
:root{--bg:#fff;--surface:#fff;--elevated:#f5f5f5;--text:#000;--text-bright:#000;--text-muted:#444;--border:#ccc;--accent:#333}
body{background:#fff;color:#000}
.container{max-width:none;padding:0}
.download-wrap{display:none}
.header{border-bottom:1px solid #ccc}
.markdown-body a{color:#000;text-decoration:underline}
.markdown-body code{background:#f5f5f5;color:#000}
.markdown-body pre{background:#f5f5f5;border:1px solid #ccc}
.markdown-body pre code{color:#000}
.markdown-body blockquote{border-left:3px solid #999;background:none;color:#333}
.markdown-body th{background:#f5f5f5;color:#000}
.markdown-body table{display:table;overflow:visible}
.markdown-body pre,.markdown-body blockquote,.markdown-body table,.markdown-body img{page-break-inside:avoid}
}
```

说明：`@media print` 在源码中位于移动端 `@media(max-width:768px)` 规则之后，故当两者同时命中时（如窄纸张），打印块的 `.markdown-body table{display:table}` 因源码靠后而生效，保证表格完整而非被移动端的 `display:block;overflow-x` 截断。

- [ ] **Step 2: 追加打印文件名切换脚本**

在页面末尾 `<script>` 内、Task 1 的下拉交互 IIFE 之后，追加（`clean` 用服务端 `sanitizeFilename` 在渲染期算好并注入为字符串字面量）：

```js
(function(){
  var full=document.title,clean=${JSON.stringify(sanitizeFilename(share.title))};
  window.addEventListener('beforeprint',function(){document.title=clean});
  window.addEventListener('afterprint',function(){document.title=full});
})();
```

- [ ] **Step 3: 语法检查**

Run: `node --check server.mjs`
Expected: 无输出（退出码 0）。

- [ ] **Step 4: 浏览器端到端验证（打印）**

按“共用：本地验证环境”启动容器并拿到 Share URL（若容器已停则重启）。用 chrome-devtools 打开：
- 触发打印预览（点 “PDF” 项，或 chrome-devtools 用 `emulate` 打印媒体 / 打开打印预览）。确认：
  - 排版为**浅色**（白底黑字），即使系统处于深色模式；
  - 头部的 Download 下拉控件**不出现**在打印内容里；标题与 meta 保留；
  - 表格完整呈现（不被截断）、代码块/引用块为浅色边框；
  - 打印对话框/预览里的**默认文件名为文档标题**（“打印测试文档 Print Test”），而非 “标题 - 站点名”。
- 分别在系统**深色**与**浅色**模式下各看一遍打印预览，确认都为浅色排版。

Expected: 上述全部通过。验证后 `docker stop mh-verify`。

- [ ] **Step 5: 提交**

```bash
git add server.mjs
git commit -m "feat: print stylesheet and clean PDF filename for share page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（对照 spec 各条）：**
- 头部按钮→下拉菜单（Markdown / PDF 两项，图标，aria，≥44px，外部/ESC 关闭）→ Task 1（Step 1–4、6）。✅
- PDF = 浏览器打印（点 PDF→关菜单→`window.print()`）→ Task 1 Step 4 的 `dlPdf` 处理。✅
- `@media print`：隐藏下载控件、强制浅色、去 padding、代码/表格/引用适配、表格取消移动端横向滚动 → Task 2 Step 1。✅
- 干净 PDF 文件名（`document.title` 打印期切换、`afterprint` 恢复）→ Task 2 Step 2。✅
- 零依赖、不改 Docker/服务端端点 → Global Constraints + File Structure（仅改 `renderSharePage`）。✅
- 依赖 JS 的副作用说明 → 已在 spec 记录，无需代码任务。✅
- 验证方式（chrome-devtools、深浅色、移动视口）→ Task 1 Step 6 / Task 2 Step 4。✅
无遗漏。

**2. Placeholder scan：** 无 TBD/TODO/“类似上文”；每个改代码的步骤都给了完整代码块。✅

**3. Type/命名一致性：** DOM id `dlBtn`/`dlMenu`/`dlPdf` 在 Task 1 定义并被同 Task 脚本引用；Task 2 脚本仅用 `document.title` 与注入的 `clean`，不依赖 Task 1 内部变量。CSS 类 `download-wrap`/`download-btn`/`download-menu`/`download-item`/`caret` 在结构与样式间一致。`sanitizeFilename`、`escapeHtmlServer`、`share.token`、`share.title` 均为已存在符号。✅
