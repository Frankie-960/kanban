#!/bin/bash
# 采购工作看板 — 更新脚本
# 用法: sudo bash /opt/kanban/deploy/update.sh
# -------------------------------------------------------
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
section() { echo -e "\n${GREEN}──────────────────────────${NC} $1"; }

[ "$EUID" -ne 0 ] && { echo "请以 root 运行: sudo bash update.sh"; exit 1; }

APP_DIR="/opt/kanban"

section "拉取最新代码"
cd "$APP_DIR"
git pull origin master
info "代码已更新"

section "安装依赖 & 重新编译"
cd "$APP_DIR/server"
npm install --silent
npm run build
info "编译完成"

section "数据库迁移（如有新增表/字段）"
npx prisma generate --silent 2>/dev/null || true
npx prisma db push 2>/dev/null
info "数据库已同步"

section "重启应用"
pm2 restart kanban
pm2 save --force
info "应用已重启"

echo ""
echo -e "${GREEN}更新完成！${NC}  运行 'pm2 logs kanban' 查看日志。"
