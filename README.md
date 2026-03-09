# MarkHive

[中文文档](README_CN.md)

API-driven Markdown document management with version history and diff.

## Features

- **RESTful API** - Full CRUD for markdown documents via API
- **Version History** - Every update creates a new revision with commit message
- **Diff Support** - Compare any two versions with unified diff (like `git log` / `git diff`)
- **Dark Theme UI** - Built-in responsive web viewer for browsing, history, and diff (mobile-friendly)
- **Full-text Search** - Search across document titles and content
- **Zero Framework** - Pure Node.js server, single dependency (`better-sqlite3`)
- **Agent Skill** - Built-in `/api/skill` endpoint for AI agent discovery
- **Docker Ready** - One-command deployment with `manage.sh`

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/jx453331958/MarkHive/main/install.sh | bash
```

This will download config files, pull the Docker image, and start the service. Server runs on `http://localhost:3457`.

### Development

```bash
git clone https://github.com/jx453331958/MarkHive.git
cd MarkHive
npm install
npm run dev
```

Requires Node.js >= 20.

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3457` | Server port |
| `API_KEY` | _(empty)_ | Bearer token for API auth. Empty = open access |
| `ENABLE_AUTH` | `true` | Require password for web UI |
| `AUTH_PASSWORD` | `admin` | Web UI login password |
| `DATA_DIR` | `./data` | SQLite database directory |

## API Reference

All API endpoints accept/return JSON. Authenticate with `Authorization: Bearer <API_KEY>`.

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/docs` | List all documents |
| `GET` | `/api/docs?search=keyword` | Search documents |
| `POST` | `/api/docs` | Create document |
| `GET` | `/api/docs/:id` | Get document |
| `PUT` | `/api/docs/:id` | Update document |
| `DELETE` | `/api/docs/:id` | Delete document |

### Version History

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/docs/:id/history` | List all revisions |
| `GET` | `/api/docs/:id/versions/:v` | Get specific version |
| `GET` | `/api/docs/:id/diff?from=1&to=2` | Diff between versions |

### Examples

```bash
# Create a document
curl -X POST http://localhost:3457/api/docs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "# Hello\n\nWorld", "message": "Initial version"}'

# Update a document
curl -X PUT http://localhost:3457/api/docs/DOC_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "# Hello\n\nUpdated content", "message": "Fixed intro"}'

# View history
curl http://localhost:3457/api/docs/DOC_ID/history \
  -H "Authorization: Bearer YOUR_API_KEY"

# Compare versions
curl "http://localhost:3457/api/docs/DOC_ID/diff?from=1&to=2" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Request/Response Formats

**Create/Update body:**
```json
{
  "content": "# Markdown content here",
  "title": "Optional title (extracted from # heading if omitted)",
  "message": "Optional revision message"
}
```

**History response:**
```json
{
  "doc_id": "uuid",
  "title": "Document Title",
  "revisions": [
    { "version": 2, "message": "Updated intro", "additions": 5, "deletions": 2, "created_at": "..." },
    { "version": 1, "message": "Initial version", "additions": 10, "deletions": 0, "created_at": "..." }
  ]
}
```

**Diff response:**
```json
{
  "doc_id": "uuid",
  "from_version": 1,
  "to_version": 2,
  "hunks": [
    {
      "oldStart": 1, "oldLines": 5, "newStart": 1, "newLines": 7,
      "changes": [
        { "type": "context", "value": "unchanged line" },
        { "type": "delete", "value": "removed line" },
        { "type": "insert", "value": "added line" }
      ]
    }
  ],
  "stats": { "additions": 3, "deletions": 1 }
}
```

## Docker

```bash
# Pull and run (recommended)
docker compose up -d

# Or build locally
docker compose up -d --build
```

Pre-built images for `linux/amd64` and `linux/arm64` are published to GHCR via GitHub Actions.

Data persists in `./data/` directory (mounted as volume).

## Architecture

- **Server**: Single-file Node.js HTTP server (`server.mjs`)
- **Database**: SQLite via `better-sqlite3` (WAL mode)
- **Frontend**: Vanilla HTML/CSS/JS with `marked.js` for rendering
- **Diff**: LCS-based algorithm producing unified diff with hunks
- **Auth**: Session cookies (web UI) + Bearer token (API)
