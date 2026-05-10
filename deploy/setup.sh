#!/bin/bash
# 采购工作站 — 阿里云 ECS 一键部署脚本
# 适用系统: Ubuntu 22.04 LTS
# 运行方式: sudo bash setup.sh
# -------------------------------------------------------
set -e

# ── 颜色输出 ─────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }
section() { echo -e "\n${GREEN}══════════════════════════════════════${NC}"; echo -e "  $1"; echo -e "${GREEN}══════════════════════════════════════${NC}"; }

# ── 必须以 root 运行 ──────────────────────────────────────
[ "$EUID" -ne 0 ] && error "请以 root 运行: sudo bash setup.sh"

APP_DIR="/opt/kanban"
REPO_URL="https://github.com/Frankie-960/kanban.git"
SERVICE_NAME="kanban"
LOG_DIR="/var/log/kanban"

section "采购工作站 — 部署脚本 v1.0"
echo "  目标目录 : $APP_DIR"
echo "  代码仓库 : $REPO_URL"
echo ""

# ── 1. 系统更新与基础依赖 ─────────────────────────────────
section "1/7  安装系统依赖"
apt-get update -qq
apt-get install -y -qq curl git nginx ufw
info "系统依赖安装完成"

# ── 2. 安装 Node.js 20 LTS ───────────────────────────────
section "2/7  安装 Node.js 20"
if command -v node &>/dev/null && [[ "$(node -v)" == v20* ]]; then
  info "Node.js $(node -v) 已安装，跳过"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null
  apt-get install -y -qq nodejs
  info "Node.js $(node -v) 安装完成"
fi

# ── 3. 安装 PM2 ──────────────────────────────────────────
section "3/7  安装 PM2"
if command -v pm2 &>/dev/null; then
  info "PM2 $(pm2 -v) 已安装，跳过"
else
  npm install -g pm2 --quiet
  info "PM2 安装完成"
fi

# ── 4. 拉取代码 ──────────────────────────────────────────
section "4/7  获取应用代码"
mkdir -p "$LOG_DIR"
if [ -d "$APP_DIR/.git" ]; then
  info "代码目录已存在，执行 git pull..."
  cd "$APP_DIR"
  git pull origin master
else
  info "克隆代码到 $APP_DIR ..."
  git clone "$REPO_URL" "$APP_DIR"
fi
info "代码已是最新版本"

# ── 5. 配置环境变量 ──────────────────────────────────────
section "5/7  配置环境变量"
cd "$APP_DIR/server"

# 自动检测公网 IP（阿里云元数据服务 → 通用备用）
PUBLIC_IP=$(curl -s --connect-timeout 3 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null \
            || curl -s --connect-timeout 5 https://api.ipify.org 2>/dev/null \
            || echo "YOUR_SERVER_IP")

if [ ! -f .env ]; then
  cp .env.example .env

  # 自动生成随机密钥
  JWT_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  ENC_KEY=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")

  sed -i "s|your-super-secret-jwt-key-at-least-32-chars|$JWT_KEY|g" .env
  sed -i "s|ENCRYPTION_KEY=\"\"|ENCRYPTION_KEY=\"$ENC_KEY\"|g"      .env
  sed -i "s|FRONTEND_URL=\"http://localhost:5173\"|FRONTEND_URL=\"http://$PUBLIC_IP\"|g" .env
  sed -i "s|ALLOWED_ORIGINS=\"\"|ALLOWED_ORIGINS=\"http://$PUBLIC_IP\"|g" .env

  info ".env 已创建，JWT_SECRET 和 ENCRYPTION_KEY 已自动生成"
  warn "检测到服务器公网 IP: $PUBLIC_IP"
  warn "如果 IP 不正确，请手动编辑: nano $APP_DIR/server/.env"
  warn "如需邮件功能，填写 SMTP_HOST / SMTP_USER / SMTP_PASS"
  echo ""
else
  info ".env 已存在，跳过（如需重置请删除后重新运行）"
fi

# ── 6. 构建应用 ──────────────────────────────────────────
section "6/7  构建应用"
npm install --silent
info "依赖安装完成"

npm run build
info "TypeScript 编译完成"

npx prisma generate --silent 2>/dev/null || true
npx prisma db push --accept-data-loss 2>/dev/null
info "数据库初始化完成"

# ── 7. 配置 Nginx ─────────────────────────────────────────
section "7a/7  配置 Nginx"
cat > /etc/nginx/sites-available/kanban <<NGINX
server {
    listen 80 default_server;
    server_name _;

    # 静态前端文件
    root $APP_DIR/dist;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1024;

    # 静态资源长缓存
    location ~* \.(js|css|png|jpg|gif|ico|woff2?|svg)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # API 反向代理
    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        client_max_body_size 5m;
    }

    # 独立 HTML 页面（密码重置 / 管理员）
    location = /forgot-password { try_files /forgot-password.html =404; }
    location = /reset-password  { try_files /reset-password.html  =404; }
    location /admin/users       { try_files /admin-users.html     =404; }

    # SPA 路由回退
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

# 启用站点
ln -sf /etc/nginx/sites-available/kanban /etc/nginx/sites-enabled/kanban
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
info "Nginx 配置完成"

# ── 7b. 启动 PM2 ─────────────────────────────────────────
section "7b/7  启动应用（PM2）"
cd "$APP_DIR/server"

if pm2 list | grep -q "$SERVICE_NAME"; then
  pm2 restart "$SERVICE_NAME"
  info "应用已重启"
else
  pm2 start ecosystem.config.js
  info "应用已启动"
fi

pm2 save --force
# 设置开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null | grep "sudo env" | bash 2>/dev/null || true
info "PM2 开机自启已配置"

# ── 防火墙（可选） ────────────────────────────────────────
ufw allow 22/tcp  &>/dev/null
ufw allow 80/tcp  &>/dev/null
ufw allow 443/tcp &>/dev/null
ufw --force enable &>/dev/null 2>&1 || true

# ── 完成摘要 ─────────────────────────────────────────────
section "部署完成"
echo ""
echo -e "  ${GREEN}应用地址${NC} : http://$PUBLIC_IP"
echo -e "  ${GREEN}PM2 状态${NC} : pm2 status"
echo -e "  ${GREEN}查看日志${NC} : pm2 logs kanban"
echo -e "  ${GREEN}配置文件${NC} : $APP_DIR/server/.env"
echo ""
echo -e "  ${YELLOW}下次更新代码${NC}: sudo bash $APP_DIR/deploy/update.sh"
echo ""
warn "记得在阿里云控制台安全组放行 80 端口（TCP 入站）！"
echo ""
