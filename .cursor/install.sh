#!/usr/bin/env bash
# Idempotent repository bootstrap for the Monthly Capsule Cloud Agent environment.
# Installs system + project dependencies and the Supabase CLI. Safe to re-run.
# Runtime services (Docker daemon, Supabase stack, dev server) are started by start.sh.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "[install] Ensuring system packages (docker, fuse) ..."
if ! command -v docker >/dev/null 2>&1 || ! command -v fuse-overlayfs >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    docker.io fuse-overlayfs fuse3 curl ca-certificates
  # fuse3 ships an interactive conffile prompt; force keep-old to avoid hanging.
  sudo DEBIAN_FRONTEND=noninteractive dpkg --force-confold --configure -a || true
fi

echo "[install] Ensuring the current user can reach the Docker socket ..."
sudo groupadd -f docker
sudo usermod -aG docker "$USER" || true

echo "[install] Ensuring Supabase CLI is installed ..."
if ! command -v supabase >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)" # amd64 / arm64
  TAG="$(curl -fsSL https://api.github.com/repos/supabase/cli/releases/latest \
    | grep -oP '"tag_name":\s*"\K[^"]+')"
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/supabase.tar.gz" \
    "https://github.com/supabase/cli/releases/download/${TAG}/supabase_linux_${ARCH}.tar.gz"
  tar -xzf "$TMP/supabase.tar.gz" -C "$TMP"
  sudo install -m 0755 "$TMP/supabase" /usr/local/bin/supabase
  rm -rf "$TMP"
fi
supabase --version

echo "[install] Installing Node dependencies (npm ci) ..."
npm ci

echo "[install] Done."
