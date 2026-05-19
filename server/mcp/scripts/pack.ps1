# 在 server/mcp 目录或直接 ./scripts/pack.ps1 跑
# 产出 kanban-mcp-<version>.tgz 到 server/mcp 根目录

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location (Join-Path $here '..')

Write-Host '[1/2] 编译 TypeScript...' -ForegroundColor Cyan
npm run build

Write-Host '[2/2] 打包 tarball...' -ForegroundColor Cyan
$tarball = (npm pack 2>&1 | Select-Object -Last 1).Trim()

Write-Host ''
Write-Host "完成: $tarball" -ForegroundColor Green
Write-Host ''
Write-Host '分发给同事：' -ForegroundColor Yellow
Write-Host "  把 $tarball 拷贝给同事（钉钉、网盘均可）" -ForegroundColor Yellow
Write-Host "  同事在自己电脑上执行：" -ForegroundColor Yellow
Write-Host "    npm i -g .\$tarball" -ForegroundColor Yellow
Write-Host "  之后 'kanban-mcp' 命令进 PATH。" -ForegroundColor Yellow
