#!/bin/bash

# 合同管理系统 - 部署脚本

echo "=========================================="
echo "  合同管理系统部署脚本"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 请先安装 Node.js 18.x"
    exit 1
fi

echo "Node.js 版本: $(node -v)"

# 进入 server 目录
cd "$(dirname "$0")/server"
echo "当前目录: $(pwd)"

# 创建 .env 文件（如果不存在）
if [ ! -f .env ]; then
    echo "创建 .env 文件..."
    cp .env.example .env
    echo "请编辑 .env 文件配置数据库和密钥"
fi

# 安装依赖
echo "安装依赖..."
npm install

# 生成 Prisma Client
echo "生成 Prisma Client..."
npx prisma generate

# 初始化数据库（创建表）
echo "初始化数据库..."
npx prisma db push

# 启动服务
echo "启动服务..."
echo "=========================================="
echo "后端 API: http://localhost:3001"
echo "前端: 请配置 Nginx 反向代理到 /www/contract-generator/dist"
echo "=========================================="
echo ""
echo "使用 PM2 启动（推荐）:"
echo "  pm2 start ecosystem.config.js"
echo ""
echo "或直接运行:"
echo "  npm run dev"
