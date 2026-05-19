#!/usr/bin/env bash
# 在 server/mcp 目录或直接 ./scripts/pack.sh 跑
# 产出 kanban-mcp-<version>.tgz 到 server/mcp 根目录

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/2] 编译 TypeScript..."
npm run build

echo "[2/2] 打包 tarball..."
TARBALL=$(npm pack 2>&1 | tail -n 1)

echo ""
echo "完成: $TARBALL"
echo ""
echo "分发给同事："
echo "  把 $TARBALL 拷贝给同事（钉钉、网盘均可）"
echo "  同事在自己电脑上执行："
echo "    npm i -g ./$TARBALL"
echo "  之后 'kanban-mcp' 命令进 PATH。"
