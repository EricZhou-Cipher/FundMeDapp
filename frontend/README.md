# FundMeDapp 前端环境搭建全记录 & 极客避坑指南

**Author:** EricZhou
**Date:** 2025-03-04  
**Environment:** macOS + zsh + nvm + Node.js 20 + Next.js 15 + Tailwind 4 + Ethers.js 6  
**Status:** 环境搭建成功 ✅

---

## 背景介绍

这是我为 FundMeDapp 搭建前端环境时采过的所有坑与统一结论。
适合所有**macOS 用户**，特别是想用**Next.js + TailwindCSS + Ethers.js**开发 Web3 DApp 的极客们。

---

## 环境版本

| 环境      | 版本                           |
| --------- | ------------------------------ |
| 系统      | macOS Sonoma                   |
| Shell     | zsh                            |
| 包管理    | nvm + npm                      |
| Node 版本 | 20.18.3                        |
| npm 版本  | 9.9.4（推荐）或 10.8.2（兼容） |

---

## 环境搭建步骤

### 1. nvm 安装

不直接用`install.sh`，而是直接从 GitHub 加载完整 release 包：

```bash
curl -L https://github.com/nvm-sh/nvm/archive/refs/tags/v0.39.3.tar.gz -o ~/Downloads/nvm-0.39.3.tar.gz
mkdir -p ~/.nvm
tar -xvzf ~/Downloads/nvm-0.39.3.tar.gz -C ~/.nvm --strip-components=1
```

配置环境变量：

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.zshrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.zshrc
source ~/.zshrc
```

---

### 2. Node 和 npm 搭建

直接 nvm 安装 LTS 版

```bash
nvm install 20
nvm use 20
nvm alias default 20
```

### 注意：不要 npm10 降级 npm9，这会触发大量不兼容坑。

---

### 3. 初始化 Next.js

```bash
npx create-next-app@latest frontend
```

---

### 4. TailwindCSS 配置

直接首次试回处事：

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p  # 如果这步失败，直接手动创建
```

---

### 5. 手动创建 Tailwind 配置

```bash
touch tailwind.config.js postcss.config.js
```

**tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

**postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

### 6. 启动 Next.js 服务

```bash
npm run dev
```

若看到 localhost:3000 正常启动，前端环境全部 OK。

---

## 总结

| 岗位         | 优化规则                                       |
| ------------ | ---------------------------------------------- |
| nvm 安装     | 直接用 release 包，不依赖任何镜像和 install.sh |
| Node 选版    | Node 20 最稳选择                               |
| npm 版本     | 避免 npm 大版本降级                            |
| cache 清理   | npm cache clean --force                        |
| package-lock | 全清重环境时一定要删 package-lock.json         |
| npx 失灵     | 不依赖 npx，直接 touch 配置文件                |

---

## 结尾

> 这不是普通的 README，这是极客的血与泪。

> 如果你是 macOS 用户+Web3 开发者，我的坑记就是你的强选指南。

若成功复现，请给我 Star：https://github.com/mastershy/FundMeDapp
