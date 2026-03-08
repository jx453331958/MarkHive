// MarkHive - API-driven Markdown Document Management with Version History
import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

// ============================================================
// Configuration
// ============================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3457');
const API_KEY = process.env.API_KEY || '';
const ENABLE_AUTH = process.env.ENABLE_AUTH !== 'false';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// ============================================================
// Database
// ============================================================
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'markhive.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    message TEXT DEFAULT '',
    additions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_revisions_doc_version
    ON revisions(document_id, version);
`);

// Prepared statements
const stmts = {
  listDocs: db.prepare(`
    SELECT d.id, d.title, d.created_at, d.updated_at,
      (SELECT MAX(version) FROM revisions WHERE document_id = d.id) as version
    FROM documents d ORDER BY d.updated_at DESC
  `),
  searchDocs: db.prepare(`
    SELECT d.id, d.title, d.created_at, d.updated_at,
      (SELECT MAX(version) FROM revisions WHERE document_id = d.id) as version
    FROM documents d
    WHERE d.title LIKE ? OR d.content LIKE ?
    ORDER BY d.updated_at DESC
  `),
  getDoc: db.prepare(`
    SELECT d.id, d.title, d.content, d.created_at, d.updated_at,
      (SELECT MAX(version) FROM revisions WHERE document_id = d.id) as version
    FROM documents d WHERE d.id = ?
  `),
  getDocById: db.prepare('SELECT * FROM documents WHERE id = ?'),
  insertDoc: db.prepare(`
    INSERT INTO documents (id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateDoc: db.prepare(`
    UPDATE documents SET title = ?, content = ?, updated_at = ? WHERE id = ?
  `),
  deleteDoc: db.prepare('DELETE FROM documents WHERE id = ?'),
  maxVersion: db.prepare(
    'SELECT MAX(version) as v FROM revisions WHERE document_id = ?'
  ),
  insertRevision: db.prepare(`
    INSERT INTO revisions (document_id, version, title, content, message, additions, deletions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listRevisions: db.prepare(`
    SELECT version, title, message, additions, deletions, created_at
    FROM revisions WHERE document_id = ? ORDER BY version DESC
  `),
  getRevision: db.prepare(`
    SELECT version, title, content, message, additions, deletions, created_at
    FROM revisions WHERE document_id = ? AND version = ?
  `),
};

// ============================================================
// Sessions
// ============================================================
const SESSIONS = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, { createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  const session = SESSIONS.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
    SESSIONS.delete(token);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of SESSIONS) {
    if (now - session.createdAt > SESSION_MAX_AGE) SESSIONS.delete(token);
  }
}, 60 * 60 * 1000);

// ============================================================
// Helpers
// ============================================================
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { reject(new Error('Body too large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve(null); }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function extractTitle(content, fallback = 'Untitled') {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].replace(/[*_`\[\]]/g, '').trim() : fallback;
}

// ============================================================
// Auth
// ============================================================
function requireApiAuth(req) {
  if (!API_KEY) return true;
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') && auth.slice(7) === API_KEY;
}

function requireSessionAuth(req) {
  if (!ENABLE_AUTH) return true;
  const token = getCookie(req, 'session');
  return validateSession(token);
}

function requireAuth(req) {
  return requireApiAuth(req) || requireSessionAuth(req);
}

// ============================================================
// Diff Algorithm (LCS-based)
// ============================================================
function lcsEdits(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  const dp = [];
  for (let i = 0; i <= m; i++) dp[i] = new Uint32Array(n + 1);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const edits = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: 'equal', value: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: 'insert', value: newLines[j - 1] });
      j--;
    } else {
      edits.unshift({ type: 'delete', value: oldLines[i - 1] });
      i--;
    }
  }
  return edits;
}

function computeStats(oldText, newText) {
  if (oldText === newText) return { additions: 0, deletions: 0 };
  const edits = lcsEdits(oldText.split('\n'), newText.split('\n'));
  let additions = 0, deletions = 0;
  for (const e of edits) {
    if (e.type === 'insert') additions++;
    if (e.type === 'delete') deletions++;
  }
  return { additions, deletions };
}

function computeDiff(oldText, newText) {
  if (oldText === newText) return { hunks: [], stats: { additions: 0, deletions: 0 } };

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const edits = lcsEdits(oldLines, newLines);

  // Assign line numbers
  let oldNum = 0, newNum = 0;
  const numbered = edits.map(e => {
    const r = { type: e.type, value: e.value };
    if (e.type === 'equal') { oldNum++; newNum++; r.oldLine = oldNum; r.newLine = newNum; }
    else if (e.type === 'delete') { oldNum++; r.oldLine = oldNum; }
    else { newNum++; r.newLine = newNum; }
    return r;
  });

  // Group into hunks
  const CONTEXT = 3;
  const changeIdx = numbered.map((e, i) => e.type !== 'equal' ? i : -1).filter(i => i !== -1);
  if (changeIdx.length === 0) return { hunks: [], stats: { additions: 0, deletions: 0 } };

  const groups = [[changeIdx[0]]];
  for (let k = 1; k < changeIdx.length; k++) {
    const last = groups[groups.length - 1];
    if (changeIdx[k] - last[last.length - 1] <= CONTEXT * 2) {
      last.push(changeIdx[k]);
    } else {
      groups.push([changeIdx[k]]);
    }
  }

  let additions = 0, deletions = 0;
  for (const e of numbered) {
    if (e.type === 'insert') additions++;
    if (e.type === 'delete') deletions++;
  }

  const hunks = groups.map(group => {
    const start = Math.max(0, group[0] - CONTEXT);
    const end = Math.min(numbered.length - 1, group[group.length - 1] + CONTEXT);
    const changes = [];
    let oldStart = 0, newStart = 0, oldCount = 0, newCount = 0;

    for (let i = start; i <= end; i++) {
      const e = numbered[i];
      if (e.type === 'equal') {
        if (!oldStart) { oldStart = e.oldLine; newStart = e.newLine; }
        changes.push({ type: 'context', value: e.value });
        oldCount++; newCount++;
      } else if (e.type === 'delete') {
        if (!oldStart) { oldStart = e.oldLine; newStart = e.oldLine; }
        changes.push({ type: 'delete', value: e.value });
        oldCount++;
      } else {
        if (!oldStart) { oldStart = e.newLine; newStart = e.newLine; }
        changes.push({ type: 'insert', value: e.value });
        newCount++;
      }
    }

    return { oldStart: oldStart || 1, oldLines: oldCount, newStart: newStart || 1, newLines: newCount, changes };
  });

  return { hunks, stats: { additions, deletions } };
}

// ============================================================
// Document Handlers
// ============================================================
async function handleListDocs(req, res, query) {
  const search = query.get('search');
  const docs = search
    ? stmts.searchDocs.all(`%${search}%`, `%${search}%`)
    : stmts.listDocs.all();
  sendJSON(res, 200, docs);
}

async function handleGetDoc(req, res, docId) {
  const doc = stmts.getDoc.get(docId);
  if (!doc) return sendJSON(res, 404, { error: 'Document not found' });
  sendJSON(res, 200, doc);
}

async function handleCreateDoc(req, res) {
  const body = await readBody(req);
  if (!body || !body.content) return sendJSON(res, 400, { error: 'content is required' });

  const id = crypto.randomUUID();
  const title = body.title || extractTitle(body.content);
  const now = new Date().toISOString();
  const lines = body.content.split('\n').length;

  db.transaction(() => {
    stmts.insertDoc.run(id, title, body.content, now, now);
    stmts.insertRevision.run(id, 1, title, body.content, body.message || 'Initial version', lines, 0, now);
  })();

  sendJSON(res, 201, { id, title, version: 1, created_at: now, updated_at: now });
}

async function handleUpdateDoc(req, res, docId) {
  const body = await readBody(req);
  if (!body || !body.content) return sendJSON(res, 400, { error: 'content is required' });

  const doc = stmts.getDocById.get(docId);
  if (!doc) return sendJSON(res, 404, { error: 'Document not found' });

  const title = body.title || extractTitle(body.content, doc.title);
  const now = new Date().toISOString();
  const maxVer = stmts.maxVersion.get(docId).v || 0;
  const stats = computeStats(doc.content, body.content);

  db.transaction(() => {
    stmts.updateDoc.run(title, body.content, now, docId);
    stmts.insertRevision.run(docId, maxVer + 1, title, body.content, body.message || '', stats.additions, stats.deletions, now);
  })();

  sendJSON(res, 200, { id: docId, title, version: maxVer + 1, updated_at: now });
}

async function handleDeleteDoc(req, res, docId) {
  const doc = stmts.getDocById.get(docId);
  if (!doc) return sendJSON(res, 404, { error: 'Document not found' });
  stmts.deleteDoc.run(docId);
  sendJSON(res, 200, { ok: true });
}

async function handleDocHistory(req, res, docId) {
  const doc = stmts.getDoc.get(docId);
  if (!doc) return sendJSON(res, 404, { error: 'Document not found' });
  const revisions = stmts.listRevisions.all(docId);
  sendJSON(res, 200, { doc_id: docId, title: doc.title, revisions });
}

async function handleDocVersion(req, res, docId, version) {
  const rev = stmts.getRevision.get(docId, version);
  if (!rev) return sendJSON(res, 404, { error: 'Version not found' });
  sendJSON(res, 200, rev);
}

async function handleDocDiff(req, res, docId, query) {
  const from = parseInt(query.get('from'));
  const to = parseInt(query.get('to'));
  if (!from || !to) return sendJSON(res, 400, { error: 'from and to query params required' });

  const fromRev = stmts.getRevision.get(docId, from);
  const toRev = stmts.getRevision.get(docId, to);
  if (!fromRev || !toRev) return sendJSON(res, 404, { error: 'Version not found' });

  const diff = computeDiff(fromRev.content, toRev.content);
  sendJSON(res, 200, { doc_id: docId, from_version: from, to_version: to, ...diff });
}

// ============================================================
// Auth Handlers
// ============================================================
async function handleLogin(req, res) {
  const body = await readBody(req);
  if (!body || body.password !== AUTH_PASSWORD) {
    return sendJSON(res, 401, { error: 'Invalid password' });
  }
  const token = createSession();
  res.setHeader('Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}`
  );
  sendJSON(res, 200, { ok: true });
}

async function handleLogout(req, res) {
  const token = getCookie(req, 'session');
  if (token) SESSIONS.delete(token);
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
  sendJSON(res, 200, { ok: true });
}

function handleMe(req, res) {
  sendJSON(res, 200, { authenticated: requireSessionAuth(req) });
}

// ============================================================
// Static File Serving
// ============================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(res, filepath) {
  try {
    const ext = path.extname(filepath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await fs.readFile(filepath);
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': content.length });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ============================================================
// Skill (Agent-readable API documentation)
// ============================================================
function handleSkill(req, res) {
  const host = req.headers.host || `localhost:${PORT}`;
  const base = `http://${host}`;
  const authHeader = API_KEY
    ? `\nAuthentication: Bearer token via "Authorization: Bearer <API_KEY>" header.`
    : `\nAuthentication: None required (API_KEY not configured).`;

  const skill = `# MarkHive API Skill

MarkHive is an API-driven Markdown document management service with version history and diff.
Base URL: ${base}
${authHeader}

## Available Endpoints

### List Documents
GET ${base}/api/docs
GET ${base}/api/docs?search=<keyword>
Response: Array of {id, title, created_at, updated_at, version}

### Create Document
POST ${base}/api/docs
Content-Type: application/json
Body: {"content": "# Markdown content", "title": "optional", "message": "optional commit message"}
Response: {id, title, version, created_at, updated_at}

### Get Document
GET ${base}/api/docs/<id>
Response: {id, title, content, created_at, updated_at, version}

### Update Document
PUT ${base}/api/docs/<id>
Content-Type: application/json
Body: {"content": "# Updated content", "message": "what changed"}
Response: {id, title, version, updated_at}
Note: Each update creates a new version automatically.

### Delete Document
DELETE ${base}/api/docs/<id>
Response: {ok: true}
Note: Also deletes all version history.

### Version History
GET ${base}/api/docs/<id>/history
Response: {doc_id, title, revisions: [{version, title, message, additions, deletions, created_at}]}

### Get Specific Version
GET ${base}/api/docs/<id>/versions/<version_number>
Response: {version, title, content, message, additions, deletions, created_at}

### Diff Between Versions
GET ${base}/api/docs/<id>/diff?from=<v1>&to=<v2>
Response: {doc_id, from_version, to_version, hunks: [{oldStart, oldLines, newStart, newLines, changes: [{type, value}]}], stats: {additions, deletions}}
Change types: "context" (unchanged), "insert" (added), "delete" (removed)

## Workflow Examples

1. Create a doc: POST /api/docs with {"content": "# Title\\n\\nBody"}
2. Update it: PUT /api/docs/<id> with {"content": "...", "message": "describe change"}
3. View history: GET /api/docs/<id>/history
4. Compare versions: GET /api/docs/<id>/diff?from=1&to=2

## Notes
- Document titles are auto-extracted from the first # heading if not provided.
- All timestamps are ISO 8601 format.
- The "message" field is optional but recommended (like a git commit message).
- Diff uses LCS algorithm and returns unified diff hunks with context lines.
`;

  const body = skill.trim();
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ============================================================
// Router
// ============================================================
async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;
    const query = url.searchParams;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // Health
    if (pathname === '/health') return sendJSON(res, 200, { status: 'ok' });

    // Skill (no auth required - for agent discovery)
    if ((pathname === '/skill' || pathname === '/api/skill') && method === 'GET') return handleSkill(req, res);

    // Auth routes
    if (pathname === '/api/login' && method === 'POST') return handleLogin(req, res);
    if (pathname === '/api/logout' && method === 'POST') return handleLogout(req, res);
    if (pathname === '/api/me' && method === 'GET') return handleMe(req, res);

    // API routes
    if (pathname.startsWith('/api/')) {
      if (!requireAuth(req)) return sendJSON(res, 401, { error: 'Unauthorized' });

      if (pathname === '/api/docs' && method === 'GET') return handleListDocs(req, res, query);
      if (pathname === '/api/docs' && method === 'POST') return handleCreateDoc(req, res);

      // /api/docs/:id
      const docMatch = pathname.match(/^\/api\/docs\/([^/]+)$/);
      if (docMatch) {
        const docId = docMatch[1];
        if (method === 'GET') return handleGetDoc(req, res, docId);
        if (method === 'PUT') return handleUpdateDoc(req, res, docId);
        if (method === 'DELETE') return handleDeleteDoc(req, res, docId);
      }

      // /api/docs/:id/history
      const historyMatch = pathname.match(/^\/api\/docs\/([^/]+)\/history$/);
      if (historyMatch && method === 'GET') return handleDocHistory(req, res, historyMatch[1]);

      // /api/docs/:id/versions/:version
      const versionMatch = pathname.match(/^\/api\/docs\/([^/]+)\/versions\/(\d+)$/);
      if (versionMatch && method === 'GET') return handleDocVersion(req, res, versionMatch[1], parseInt(versionMatch[2]));

      // /api/docs/:id/diff?from=1&to=2
      const diffMatch = pathname.match(/^\/api\/docs\/([^/]+)\/diff$/);
      if (diffMatch && method === 'GET') return handleDocDiff(req, res, diffMatch[1], query);

      return sendJSON(res, 404, { error: 'Not found' });
    }

    // Frontend routes
    if (pathname === '/' || pathname === '/index.html') {
      if (ENABLE_AUTH && !requireSessionAuth(req)) {
        res.writeHead(302, { Location: '/login.html' });
        return res.end();
      }
      return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    if (pathname === '/login' || pathname === '/login.html') {
      return serveStatic(res, path.join(PUBLIC_DIR, 'login.html'));
    }

    // Other static files
    const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    return serveStatic(res, filePath);
  } catch (err) {
    console.error('Request error:', err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Internal server error' });
  }
}

// ============================================================
// Start Server
// ============================================================
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`MarkHive running on http://localhost:${PORT}`);
  if (API_KEY) console.log('API Key authentication enabled');
  if (ENABLE_AUTH) console.log('Frontend password authentication enabled');
});

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
