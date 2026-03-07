# MarkHive

基于 API 的 Markdown 文档管理系统，支持版本历史和 Diff 对比。

## 特性

- **RESTful API** - 通过 API 完成文档的增删改查，适合与 AI Agent / 自动化工具集成
- **版本历史** - 每次更新自动创建新版本，支持提交说明（类似 git commit）
- **Diff 对比** - 任意两个版本之间的差异比较，统一 diff 格式（类似 `git diff`）
- **Web 预览** - 内置暗色主题 Web 界面，支持文档浏览、历史查看和 Diff 展示
- **全文搜索** - 支持标题和内容的模糊搜索
- **Agent Skill** - 内置 `/api/skill` 端点，AI Agent 可直接学习如何使用本服务
- **极简依赖** - 纯 Node.js 服务端，唯一运行时依赖 `better-sqlite3`
- **Docker 部署** - 一键 Docker 部署，数据持久化

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 克隆项目
git clone https://github.com/jx453331958/MarkHive.git
cd MarkHive

# 使用管理脚本一键部署
chmod +x manage.sh
./manage.sh install
./manage.sh start
```

### 方式二：直接运行

```bash
npm install
npm run dev    # 开发模式（热重载）
npm start      # 生产模式
```

需要 Node.js >= 20，默认端口 `3457`。

## 管理脚本

项目提供 `manage.sh` 一键管理脚本：

```bash
./manage.sh install    # 首次安装（生成配置、构建镜像）
./manage.sh start      # 启动服务
./manage.sh stop       # 停止服务
./manage.sh restart    # 重启服务
./manage.sh status     # 查看运行状态
./manage.sh logs       # 查看实时日志
./manage.sh update     # 拉取最新代码并重新构建
./manage.sh backup     # 备份数据库
./manage.sh uninstall  # 停止并清理容器
```

## 配置说明

复制 `.env.example` 为 `.env` 并修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3457` | 服务端口 |
| `API_KEY` | _(空)_ | API 认证 Bearer Token，为空则不需要认证 |
| `ENABLE_AUTH` | `true` | 是否开启 Web 界面密码保护 |
| `AUTH_PASSWORD` | `admin` | Web 界面登录密码 |
| `DATA_DIR` | `./data` | SQLite 数据库存储目录 |

## API 文档

所有 API 端点接受/返回 JSON。认证方式：`Authorization: Bearer <API_KEY>`。

### Agent Skill 端点

```
GET /api/skill
```

返回完整的 API 使用说明（纯文本），AI Agent 可通过此端点自动学习如何使用本服务。无需认证。

### 文档管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/docs` | 获取文档列表 |
| `GET` | `/api/docs?search=关键词` | 搜索文档 |
| `POST` | `/api/docs` | 创建文档 |
| `GET` | `/api/docs/:id` | 获取单个文档 |
| `PUT` | `/api/docs/:id` | 更新文档（自动创建新版本） |
| `DELETE` | `/api/docs/:id` | 删除文档及所有版本 |

### 版本历史

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/docs/:id/history` | 获取版本历史列表 |
| `GET` | `/api/docs/:id/versions/:v` | 获取指定版本内容 |
| `GET` | `/api/docs/:id/diff?from=1&to=2` | 对比两个版本的差异 |

### 使用示例

```bash
# 创建文档
curl -X POST http://localhost:3457/api/docs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "# 标题\n\n正文内容", "message": "首次创建"}'

# 更新文档
curl -X PUT http://localhost:3457/api/docs/DOC_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "# 标题\n\n更新后的内容", "message": "修改了正文"}'

# 查看历史
curl http://localhost:3457/api/docs/DOC_ID/history \
  -H "Authorization: Bearer YOUR_API_KEY"

# 对比版本
curl "http://localhost:3457/api/docs/DOC_ID/diff?from=1&to=2" \
  -H "Authorization: Bearer YOUR_API_KEY"

# 删除文档
curl -X DELETE http://localhost:3457/api/docs/DOC_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 请求/响应格式

**创建/更新请求体：**
```json
{
  "content": "# Markdown 内容",
  "title": "可选标题（不传则从 # 标题提取）",
  "message": "可选版本说明"
}
```

**文档列表响应：**
```json
[
  {
    "id": "uuid",
    "title": "文档标题",
    "created_at": "2026-03-07T14:00:00.000Z",
    "updated_at": "2026-03-07T15:00:00.000Z",
    "version": 3
  }
]
```

**版本历史响应：**
```json
{
  "doc_id": "uuid",
  "title": "文档标题",
  "revisions": [
    { "version": 2, "message": "修改了正文", "additions": 5, "deletions": 2, "created_at": "..." },
    { "version": 1, "message": "首次创建", "additions": 10, "deletions": 0, "created_at": "..." }
  ]
}
```

**Diff 响应：**
```json
{
  "doc_id": "uuid",
  "from_version": 1,
  "to_version": 2,
  "hunks": [
    {
      "oldStart": 1, "oldLines": 5, "newStart": 1, "newLines": 7,
      "changes": [
        { "type": "context", "value": "未变更的行" },
        { "type": "delete", "value": "被删除的行" },
        { "type": "insert", "value": "新增的行" }
      ]
    }
  ],
  "stats": { "additions": 3, "deletions": 1 }
}
```

## Docker 部署

```bash
# 拉取镜像并启动（推荐）
docker compose up -d

# 或本地构建
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

预构建的多架构镜像（`linux/amd64` + `linux/arm64`）通过 GitHub Actions 自动发布到 GHCR。

数据存储在 `./data/` 目录中（作为 Docker Volume 挂载），重建容器不会丢失数据。

## 架构说明

- **服务端**: 单文件 Node.js HTTP 服务 (`server.mjs`)，约 550 行
- **数据库**: SQLite，通过 `better-sqlite3` 访问，WAL 模式
- **前端**: 纯 HTML/CSS/JS，使用 `marked.js` 渲染 Markdown
- **Diff 引擎**: 基于 LCS 算法的行级差异比较，输出统一 diff 格式
- **认证**: Web 界面使用 Session Cookie，API 使用 Bearer Token
