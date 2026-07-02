#!/bin/bash
# Multi-Publish CI Runner Setup
# 用法: sudo bash scripts/setup-ci-runner.sh
# 在阿里云 ECS（Alibaba Cloud Linux 3 / Anolis）上执行
# 安装 xvfb + GitHub Actions self-hosted runner + 项目依赖
#
# 前提: 以 root 执行，已安装 git / node / npm

set -euo pipefail

REPO="Colinchiu007/Multi-Publish"
RUNNER_VERSION="2.322.0"
RUNNER_DIR="/srv/actions-runner"
PROJECT_DIR="/srv/projects/Multi-Publish"
DISPLAY_NUM=":99"

echo "============================================"
echo " Multi-Publish CI Runner Setup"
echo "============================================"

# ─── Step 1: System dependencies ────────────────
echo ""
echo "[1/6] Installing system dependencies..."
dnf install -y -q \
  xorg-x11-server-Xvfb \
  libXScrnSaver nss atk at-spi2-atk cups-libs \
  libdrm libgbm alsa-lib pango cairo gtk3 libXtst
echo "  ✓ xvfb and Electron deps installed"

# ─── Step 2: xvfb systemd service ──────────────
echo ""
echo "[2/6] Setting up xvfb as systemd service..."
cat > /etc/systemd/system/xvfb.service << 'UNIT'
[Unit]
Description=X Virtual Frame Buffer Service
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable xvfb
systemctl start xvfb
sleep 2
if systemctl is-active --quiet xvfb; then
  echo "  ✓ xvfb running on display :99"
else
  echo "  ✗ xvfb failed to start"
  systemctl status xvfb --no-pager | tail -5
  exit 1
fi

# ─── Step 3: GitHub Actions runner ──────────────
echo ""
echo "[3/6] Installing GitHub Actions runner..."
mkdir -p "${RUNNER_DIR}"
if [ ! -f "${RUNNER_DIR}/bin/Runner.Listener" ]; then
  cd "${RUNNER_DIR}"
  echo "  Downloading runner v${RUNNER_VERSION}..."
  wget -q --timeout=60 \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    -O runner.tar.gz
  echo "  Extracting..."
  tar xzf runner.tar.gz
  rm runner.tar.gz
  echo "  ✓ Runner extracted"
else
  echo "  ✓ Runner already installed"
fi

# ─── Step 4: Register runner (requires token) ───
echo ""
echo "[4/6] Register runner with GitHub..."
echo "  Get a registration token from:"
echo "    https://github.com/${REPO}/settings/actions/runners/new"
echo ""
REG_TOKEN="${1:-}"
if [ -z "${REG_TOKEN}" ]; then
  echo "  ⚠ No token provided as argument."
  echo "  ⚠ To register later, run:"
  echo "    cd ${RUNNER_DIR}"
  echo "    ./config.sh --url https://github.com/${REPO} --token YOUR_TOKEN"
else
  cd "${RUNNER_DIR}"
  if [ ! -f ".runner" ]; then
    ./config.sh --url "https://github.com/${REPO}" --token "${REG_TOKEN}" \
      --name "aliyun-ecs-runner" --labels "self-hosted,linux,x64,ecs" \
      --unattended --replace
    echo "  ✓ Runner registered"
  else
    echo "  ✓ Runner already registered"
  fi
fi

# ─── Step 5: Runner systemd service ─────────────
echo ""
echo "[5/6] Setting up runner as systemd service..."
if [ -f "${RUNNER_DIR}/.runner" ]; then
  cat > /etc/systemd/system/actions-runner.service << 'UNIT'
[Unit]
Description=GitHub Actions Runner (Multi-Publish)
After=network.target xvfb.service

[Service]
Type=simple
User=root
WorkingDirectory=/srv/actions-runner
ExecStart=/srv/actions-runner/run.sh
Restart=always
RestartSec=10
Environment="DISPLAY=:99"
Environment="XDG_RUNTIME_DIR=/tmp/runtime-root"
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable actions-runner
  systemctl start actions-runner
  echo "  ✓ actions-runner service started"
else
  echo "  ⚠ Runner not registered, skipping systemd service"
fi

# ─── Step 6: Project setup ──────────────────────
echo ""
echo "[6/6] Setting up Multi-Publish project"
if [ -d "${PROJECT_DIR}" ]; then
  cd "${PROJECT_DIR}"
  echo "  Pulling latest code..."
  git fetch origin main
  git checkout main
  git pull origin main
  echo "  Installing npm dependencies..."
  npm ci 2>&1 | tail -3
  echo "  ✓ Project ready"
else
  echo "  Cloning Multi-Publish..."
  git clone "git@github.com:${REPO}.git" "${PROJECT_DIR}"
  cd "${PROJECT_DIR}"
  npm ci 2>&1 | tail -3
  echo "  ✓ Project cloned and ready"
fi

echo ""
echo "============================================"
echo " ✅ CI Runner Setup Complete"
echo "============================================"
echo ""
echo "DISPLAY=${DISPLAY_NUM} (xvfb)"
echo "Runner: ${RUNNER_DIR}"
echo "Project: ${PROJECT_DIR}"
echo ""
echo "Next steps:"
echo "  1. Verify runner: sudo systemctl status actions-runner"
echo "  2. Check logs: journalctl -u actions-runner -f"
echo "  3. Trigger a CI run from GitHub"
