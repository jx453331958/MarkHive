#!/bin/bash
# MarkHive Management Script
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="$PROJECT_DIR/backups"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[MarkHive]${NC} $1"; }
warn() { echo -e "${YELLOW}[MarkHive]${NC} $1"; }
err()  { echo -e "${RED}[MarkHive]${NC} $1"; }

# Generate random string
gen_key() { openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64; }

cmd_install() {
  log "Starting MarkHive installation..."

  # Generate .env if not exists
  if [ ! -f "$ENV_FILE" ]; then
    log "Generating .env configuration..."
    API_KEY=$(gen_key)
    cat > "$ENV_FILE" << EOF
PORT=3457
API_KEY=$API_KEY

ENABLE_AUTH=true
AUTH_PASSWORD=admin
EOF
    log "Generated .env with API_KEY: ${CYAN}$API_KEY${NC}"
    warn "Default password is 'admin', change AUTH_PASSWORD in .env for production"
  else
    log ".env already exists, skipping"
  fi

  # Create data directory
  mkdir -p "$PROJECT_DIR/data"

  # Build docker image
  log "Building Docker image..."
  docker compose -f "$COMPOSE_FILE" build

  log "Installation complete!"
  echo ""
  log "Next steps:"
  echo "  1. Edit .env to customize settings"
  echo "  2. Run: ./manage.sh start"
}

cmd_start() {
  log "Starting MarkHive..."
  docker compose -f "$COMPOSE_FILE" up -d
  sleep 1

  # Health check
  PORT=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "3457")
  PORT=${PORT:-3457}
  if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
    log "MarkHive is running at ${CYAN}http://localhost:$PORT${NC}"
  else
    warn "Service started but health check pending, try: ./manage.sh status"
  fi
}

cmd_stop() {
  log "Stopping MarkHive..."
  docker compose -f "$COMPOSE_FILE" down
  log "Stopped"
}

cmd_restart() {
  log "Restarting MarkHive..."
  docker compose -f "$COMPOSE_FILE" restart
  sleep 1
  log "Restarted"
}

cmd_status() {
  echo ""
  docker compose -f "$COMPOSE_FILE" ps
  echo ""

  PORT=$(grep -E "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "3457")
  PORT=${PORT:-3457}
  if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
    log "Health: ${GREEN}OK${NC}"
  else
    err "Health: ${RED}UNREACHABLE${NC}"
  fi
}

cmd_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f --tail=100
}

cmd_update() {
  log "Updating MarkHive..."

  # Pull latest code
  if git -C "$PROJECT_DIR" rev-parse --git-dir > /dev/null 2>&1; then
    log "Pulling latest code..."
    git -C "$PROJECT_DIR" pull
  else
    warn "Not a git repository, skipping code update"
  fi

  # Rebuild and restart
  log "Rebuilding Docker image..."
  docker compose -f "$COMPOSE_FILE" build
  docker compose -f "$COMPOSE_FILE" up -d
  sleep 1
  log "Update complete!"
}

cmd_backup() {
  mkdir -p "$BACKUP_DIR"
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/markhive_$TIMESTAMP.db"

  DB_FILE="$PROJECT_DIR/data/markhive.db"
  if [ ! -f "$DB_FILE" ]; then
    err "Database file not found at $DB_FILE"
    exit 1
  fi

  # Use SQLite backup command for safe hot backup
  if command -v sqlite3 > /dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
  else
    cp "$DB_FILE" "$BACKUP_FILE"
  fi

  log "Backup saved to: ${CYAN}$BACKUP_FILE${NC}"

  # Show size
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "Backup size: $SIZE"

  # Cleanup old backups (keep last 10)
  BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/markhive_*.db 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt 10 ]; then
    ls -1t "$BACKUP_DIR"/markhive_*.db | tail -n +11 | xargs rm -f
    log "Cleaned old backups, keeping latest 10"
  fi
}

cmd_uninstall() {
  warn "This will stop containers and remove images."
  read -p "Continue? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker compose -f "$COMPOSE_FILE" down --rmi local
    log "Containers and images removed"
    log "Data in ./data/ and .env are preserved"
  else
    log "Cancelled"
  fi
}

cmd_help() {
  echo ""
  echo -e "${CYAN}MarkHive${NC} - Markdown Document Management"
  echo ""
  echo "Usage: ./manage.sh <command>"
  echo ""
  echo "Commands:"
  echo "  install     First-time setup (generate config, build image)"
  echo "  start       Start the service"
  echo "  stop        Stop the service"
  echo "  restart     Restart the service"
  echo "  status      Show service status and health"
  echo "  logs        Show live logs (Ctrl+C to exit)"
  echo "  update      Pull latest code and rebuild"
  echo "  backup      Backup the database"
  echo "  uninstall   Stop and remove containers"
  echo ""
}

# Main
case "${1:-help}" in
  install)   cmd_install ;;
  start)     cmd_start ;;
  stop)      cmd_stop ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  logs)      cmd_logs ;;
  update)    cmd_update ;;
  backup)    cmd_backup ;;
  uninstall) cmd_uninstall ;;
  help|*)    cmd_help ;;
esac
