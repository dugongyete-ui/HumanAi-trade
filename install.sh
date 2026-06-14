#!/usr/bin/env bash
# ============================================================
#  XAUUSD AI Trading Bot — One-Shot Installer
#  Jalankan sekali: bash install.sh
# ============================================================

set -euo pipefail

# ── Warna ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅  $*${NC}"; }
info() { echo -e "${CYAN}ℹ️   $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
fail() { echo -e "${RED}❌  $*${NC}"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}▶  $*${NC}"; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    XAUUSD AI Trading Bot — Installer         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Node.js ─────────────────────────────────────────────
step "Memeriksa Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js tidak ditemukan. Install Node.js 20+ terlebih dahulu."
fi
NODE_VER=$(node --version)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $NODE_VER terlalu lama. Butuh v20+."
fi
ok "Node.js $NODE_VER"

# ── 2. pnpm ────────────────────────────────────────────────
step "Memeriksa pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "pnpm tidak ditemukan, menginstall via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
PNPM_VER=$(pnpm --version)
ok "pnpm $PNPM_VER"

# ── 3. Python ──────────────────────────────────────────────
step "Memeriksa Python..."
if ! command -v python3 &>/dev/null; then
  fail "Python 3 tidak ditemukan. Install Python 3.10+ terlebih dahulu."
fi
PY_VER=$(python3 --version)
ok "$PY_VER"

# ── 4. Node dependencies (semua workspace) ─────────────────
step "Menginstall Node.js dependencies (semua workspace)..."
pnpm install --frozen-lockfile 2>&1 | grep -E 'Packages|Already|warn|error|ERR' || true
ok "Node.js dependencies terinstall"

# ── 5. Build shared libs (TypeScript) ─────────────────────
step "Build shared TypeScript libraries..."
pnpm run typecheck:libs
ok "Shared libs berhasil di-build"

# ── 6. Python dependencies (MCP server) ────────────────────
step "Menginstall Python dependencies (MCP time server)..."
pip install --quiet mcp
ok "Python package 'mcp' terinstall"

# ── 7. OpenAPI codegen ─────────────────────────────────────
step "Generate API types dari OpenAPI spec..."
pnpm --filter @workspace/api-spec run codegen 2>&1 | grep -E 'Generated|Error|error|warn' || true
ok "API codegen selesai"

# ── 8. Cek environment variables ───────────────────────────
step "Memeriksa environment variables..."

MISSING=()
check_env() {
  if [ -z "${!1:-}" ]; then
    MISSING+=("$1")
  fi
}

check_env "TELEGRAM_BOT_TOKEN"
check_env "TELEGRAM_CHAT_ID"
check_env "AI_API_KEY"

if [ ${#MISSING[@]} -gt 0 ]; then
  warn "Environment variables berikut belum diset:"
  for v in "${MISSING[@]}"; do
    echo -e "   ${YELLOW}• $v${NC}"
  done
  warn "Set via Replit Secrets atau file .env sebelum menjalankan bot."
else
  ok "Semua environment variables tersedia"
fi

# ── Selesai ────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║    ✅  Instalasi selesai!                    ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Cara menjalankan bot:${NC}"
echo -e "  ${CYAN}pnpm --filter @workspace/api-server run dev${NC}   ← API + Bot Telegram"
echo -e "  ${CYAN}pnpm --filter @workspace/dashboard run dev${NC}    ← Dashboard web"
echo ""
echo -e "${BOLD}Perintah Telegram bot:${NC}"
echo -e "  /start   — Mulai & bantuan"
echo -e "  /analyze — Analisis manual sekarang"
echo -e "  /status  — Status bot, mode, win rate"
echo -e "  /pause   — Jeda analisis otomatis"
echo -e "  /resume  — Lanjutkan analisis otomatis"
echo ""
