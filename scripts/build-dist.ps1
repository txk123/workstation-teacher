# 构建绿色版交付包：dist\教师班主任工作台-本地服务版（含便携 Node）
# 用法：pwsh -File scripts\build-dist.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pkg = Join-Path $root 'dist\教师班主任工作台-本地服务版'

$nodeSrc = (Get-Command node).Source
if (-not $nodeSrc) { throw '未找到 node.exe，请先安装 Node.js 22' }

if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
@("$pkg\node", "$pkg\app\server", "$pkg\data") | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }

Copy-Item $nodeSrc "$pkg\node\node.exe"
Copy-Item (Join-Path $root 'index.html') "$pkg\app\index.html"
Copy-Item (Join-Path $root 'LICENSE') "$pkg\app\LICENSE"
Copy-Item (Join-Path $root 'server\server.js') "$pkg\app\server\"
Copy-Item (Join-Path $root 'server\store.js') "$pkg\app\server\"
Copy-Item (Join-Path $root 'server\ai.js') "$pkg\app\server\"
Copy-Item (Join-Path $root 'server\config.example.json') "$pkg\app\server\"

# 启动脚本与使用说明从 scripts\pkg-assets 复制（它们不在源码树里重复维护）
Copy-Item (Join-Path $PSScriptRoot 'pkg-assets\启动工作台.bat') "$pkg\启动工作台.bat"
Copy-Item (Join-Path $PSScriptRoot 'pkg-assets\使用说明.txt') "$pkg\使用说明.txt"

$zip = Join-Path $root 'dist\教师班主任工作台-本地服务版.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $pkg -DestinationPath $zip
Write-Host ("构建完成: " + $zip + " (" + [math]::Round((Get-Item $zip).Length / 1MB, 1) + " MB)")
