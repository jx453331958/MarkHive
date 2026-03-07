#!/bin/bash
# MarkHive One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/jx453331958/MarkHive/main/install.sh | bash
set -e

REPO_RAW="https://raw.githubusercontent.com/jx453331958/MarkHive/main"
INSTALL_DIR="${MARKHIVE_DIR:-./markhive}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[MarkHive]${NC} $1"; }
warn() { echo -e "${YELLOW}[MarkHive]${NC} $1"; }
err()  { echo -e "${RED}[MarkHive]${NC} $1"; exit 1; }

# Check dependencies
command -v docker >/dev/null 2>&1 || err "Docker is required but not installed."
command -v curl >/dev/null 2>&1 || err "curl is required but not installed."

log "Installing MarkHive to ${CYAN}$INSTALL_DIR${NC}..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download required files
log "Downloading files..."
curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$REPO_RAW/manage.sh" -o manage.sh
curl -fsSL "$REPO_RAW/.env.example" -o .env.example
chmod +x manage.sh

# Generate .env if not exists
if [ ! -f .env ]; then
  API_KEY=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
  cat > .env << EOF
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
mkdir -p data

# Pull image
log "Pulling Docker image..."
docker compose pull

# Start
log "Starting MarkHive..."
docker compose up -d

sleep 1
PORT=$(grep -E "^PORT=" .env 2>/dev/null | cut -d= -f2 || echo "3457")
PORT=${PORT:-3457}

echo ""
log "MarkHive is ready!"
echo ""
echo -e "  Web UI:   ${CYAN}http://localhost:$PORT${NC}"
echo -e "  API Key:  check ${CYAN}$INSTALL_DIR/.env${NC}"
echo ""
echo -e "  Manage:   ${CYAN}cd $INSTALL_DIR && ./manage.sh help${NC}"
echo ""
