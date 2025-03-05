#!/bin/bash

set -e  # 遇错即停
cd "$(dirname "$0")"  # 保证脚本在项目根目录执行

# 函数：同步系统时间
sync_time() {
    echo "⏰ 同步系统时间..."

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux系统
        if command -v ntpdate >/dev/null; then
            sudo ntpdate pool.ntp.org
        elif command -v chronyd >/dev/null; then
            sudo chronyd -q 'pool pool.ntp.org iburst'
        else
            echo "⚠️ 未找到ntpdate或chronyd，无法同步时间"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS系统
        if command -v sntp >/dev/null; then
            sudo sntp -sS pool.ntp.org
        else
            echo "⚠️ 未找到sntp，无法同步时间"
        fi
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        # Windows系统（通过Git Bash或Cygwin）
        powershell -Command "Set-Date -Date (Invoke-RestMethod -Uri 'http://worldtimeapi.org/api/timezone/Etc/UTC').datetime"
    else
        echo "⚠️ 不支持的系统类型：$OSTYPE"
    fi
}

# 执行时间同步
sync_time

echo "🚀 Step 1: 启动Hardhat节点"
npx hardhat node &

# 获取Hardhat节点的进程ID
HARDHAT_PID=$!

# 检查Hardhat节点是否启动
echo "⏳ 等待Hardhat节点8545端口就绪... (开始时间: $(date))"
START_TIME=$(date +%s)
for i in {1..15}; do
    if nc -z 127.0.0.1 8545; then
        END_TIME=$(date +%s)
        echo "✅ Hardhat节点已启动 (耗时: $((END_TIME - START_TIME))秒)"
        break
    fi
    sleep 1
done

if ! nc -z 127.0.0.1 8545; then
    echo "❌ Hardhat节点未能正常启动，退出"
    kill $HARDHAT_PID 2>/dev/null || true
    exit 1
fi

echo "🚀 Step 2: 部署合约"
npx hardhat run scripts/deploy.js --network localhost

echo "🔗 Step 3: 同步合约信息到前端"
cp ./artifacts/contracts/FundMe.sol/FundMe.json ./frontend/utils/FundMe.json

echo "🚀 Step 4: 启动前端"
cd frontend

# 确认Node和Yarn版本
echo "🛠️ Node版本: $(node -v)"
echo "🛠️ Yarn版本: $(yarn -v)"

# 自动安装依赖（防止漏装）
yarn install --frozen-lockfile || {
    echo "⚠️ 依赖安装异常，自动清理缓存并重装"
    yarn cache clean
    rm -rf node_modules yarn.lock
    yarn install
}

# 启动Next.js前端
yarn dev &

# 获取前端进程ID
FRONTEND_PID=$!

# 确认前端3000端口是否启动
echo "⏳ 等待前端3000端口就绪... (开始时间: $(date))"
START_TIME=$(date +%s)
for i in {1..15}; do
    if nc -z 127.0.0.1 3000; then
        END_TIME=$(date +%s)
        echo "✅ 前端服务已启动 (耗时: $((END_TIME - START_TIME))秒)"
        break
    fi
    sleep 1
done

if ! nc -z 127.0.0.1 3000; then
    echo "❌ 前端服务未正常启动，退出"
    kill $FRONTEND_PID 2>/dev/null || true
    kill $HARDHAT_PID 2>/dev/null || true
    exit 1
fi

# 自动打开浏览器（兼容macOS/Linux/WSL）
if which xdg-open > /dev/null; then
    xdg-open http://localhost:3000
elif which open > /dev/null; then
    open http://localhost:3000
else
    echo "✅ 请手动访问：http://localhost:3000"
fi

echo "✅ DApp全流程启动完成"

# 保持前后台进程，并添加异常退出处理
trap 'kill $HARDHAT_PID 2>/dev/null; kill $FRONTEND_PID 2>/dev/null; echo "🛑 进程已清理"; exit' INT TERM
wait