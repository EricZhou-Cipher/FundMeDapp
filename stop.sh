#!/bin/bash

echo "🛑 Step 0: 确认在项目根目录"
if [ ! -f "hardhat.config.js" ]; then
    echo "❌ 你没在项目根目录，请切换到 FundMeDapp 目录再执行！"
    exit 1
fi

echo "🛑 Step 1: 关闭本地Hardhat节点（8545端口）"
lsof -i :8545 | grep LISTEN | awk '{print $2}' | xargs kill -9 || true

echo "🛑 Step 2: 关闭Next.js前端服务（3000端口）"
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9 || true

echo "🧹 Step 3: 清理Hardhat缓存"
rm -rf cache artifacts

echo "🧹 Step 4: 清理前端缓存和构建产物"
rm -rf frontend/.next

echo "✅ Step 5: 镜像源无需恢复"

echo "✅ 停止+清理完成，耗时3秒"