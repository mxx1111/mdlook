<div align="center">

<img src="./apps/web/public/favicon.png" width="88" alt="mdlook app icon" />

<h1>mdlook</h1>

**本地 Markdown 查看器 · 微信公众号一键排版**

左看源码 · 右览预览 · 选中即排版 · 一键复制到公众号

[![node](https://img.shields.io/badge/node-%3E%3D22-42cc23?style=flat-square&labelColor=564341)](https://nodejs.org) [![tauri](https://img.shields.io/badge/desktop-Tauri%202-42cc23?style=flat-square&labelColor=564341)](https://tauri.app) [![based on](https://img.shields.io/badge/based%20on-doocs%2Fmd-42cc23?style=flat-square&labelColor=564341)](https://github.com/doocs/md)

</div>

## 项目介绍

**mdlook** 是一款给自己用的 Markdown 工具，把两件事合在一起：

1. **本地 Markdown 查看器** —— 桌面 App 打开本地文件夹，左侧文件树浏览所有 `.md`，点击即时预览，改了能存回源文件；
2. **公众号一键排版** —— 内置多套主题（含 **Claude 官网风**），把 Markdown 渲染成微信图文，**一键复制**粘进公众号后台不掉格式。

> 本项目基于优秀的开源项目 **[doocs/md](https://github.com/doocs/md)**（MIT License）定制，新增「Claude 主题」与「Tauri 桌面端本地文件浏览」。核心渲染与排版能力归功于原作者，特此致谢。

## 主要特性

- 🎨 **Claude 官网风主题**：米白底 + 黏土橙点缀 + 衬线标题，选中即用；另含经典 / 优雅 / 简洁主题
- 📋 **一键复制到公众号**：内联 CSS，粘贴不掉格式；桌面端走原生剪贴板，规避 WebView 限制
- 🗂 **本地文件树**（桌面端）：打开文件夹浏览所有 Markdown，点击即看，支持保存回源文件
- 🔗 **`.md` 文件关联**：Finder 双击 / 右键「用 mdlook 打开」直接载入（支持中文路径）
- ✍️ **丰富语法**：表格、数学公式（KaTeX）、Mermaid、GFM 警告块、脚注、代码高亮等
- 🔤 **可选字体**：无衬线 / 衬线 / 宋体 / 仿宋（公文）/ 等宽，自由切换
- 🌗 **明暗模式**：跟随系统或手动切换

## 开发与构建

> 环境：Node ≥ 22.22.2、pnpm（由 corepack 提供）、Rust（仅桌面端需要）。

```bash
pnpm install                         # 安装依赖

# 网页版
pnpm web dev                         # 开发：http://localhost:5173/md/
pnpm web build                       # 生产构建 → apps/web/dist

# 桌面 App（Tauri）
pnpm --filter @md/web tauri:dev      # 开发
pnpm --filter @md/web tauri:build    # 自动递增 patch 版本并打包

# 可选：手动指定桌面 App 版本
pnpm --filter @md/web desktop:version 0.2.0
```

### 自用 Mac 分发

当前桌面包未做 Apple Developer 正式签名 / 公证，自己几台 Mac 使用时可直接分发 `.app` 压缩包：

```bash
pnpm --filter @md/web tauri:build

mkdir -p dist-release
VERSION=$(node -p "require('./apps/web/src-tauri/tauri.conf.json').version")
ditto -c -k --sequesterRsrc --keepParent \
  apps/web/src-tauri/target/release/bundle/macos/mdlook.app \
  dist-release/mdlook_${VERSION}_aarch64.zip
```

在另一台 Mac 上解压后，把 `mdlook.app` 拖到 `/Applications`。首次打开不要直接双击，右键 `mdlook.app` →「打开」→ 再点「打开」即可。

如果仍被 Gatekeeper 拦截，可在目标 Mac 上执行：

```bash
xattr -dr com.apple.quarantine /Applications/mdlook.app
```

> 目前包名里的 `aarch64` 适用于 Apple Silicon。Intel Mac 需要单独构建 x86_64 包。

## 部署网页版

`apps/web/dist` 是纯静态文件，交给 Nginx 即可：

```nginx
server {
    listen 80;
    server_name md.example.com;
    root /var/www/mdlook/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

> 默认构建 base 为 `/md/`，访问 `https://域名/md/`。需根路径部署用 `SERVER_ENV=NETLIFY pnpm web build:h5-netlify`（base = `/`）。

### 自托管部署

以「OpenResty / Nginx 反代 + 后端 Docker 容器」为例，把 `your-domain.example` 换成你自己的域名：

- 前端：`https://your-domain.example/`
- 后端 API：`https://your-domain.example/api/`
- 图床文件：`https://your-domain.example/uploads/...`

参考结构：

- 前端静态目录：`/var/www/your-domain.example/dist/`
- 反代配置：把 `/api/`、`/uploads/` 反代到后端
- 后端源码与 Docker Compose：`deploy/md-api/docker-compose.yml`
- 图床持久化目录：宿主机任意持久化目录，挂载到容器 `/data/uploads`

启动后端容器：

```bash
cd deploy/md-api && docker compose up -d --build
```

后端默认监听 `127.0.0.1:8787`，由反代将同域路径转发到后端：

- `/api/` → `http://127.0.0.1:8787/`
- `/uploads/` → `http://127.0.0.1:8787/uploads/`

微信公众号图文图片转换由后端接口 `/api/wechat/normalize-images` 提供。开启时需在后端环境变量中配置：

```env
WECHAT_MP_IMAGE_ENABLED=true
WECHAT_MP_APP_ID=你的公众号 AppID
WECHAT_MP_APP_SECRET=你的公众号 AppSecret
```

这个能力会在复制前把文章里的公网 JPG/PNG 图片上传到微信公众号图文图片接口，并把 HTML 中的图片地址替换为微信返回的地址；`AppSecret` 只允许放后端，不能写入前端构建变量。

前端构建并发布到静态目录：

```bash
VITE_MD_API_URL=https://your-domain.example/api \
VITE_SYNC_API_URL=https://your-domain.example/api \
VITE_UPLOAD_VIA_API=true \
SERVER_ENV=NETLIFY \
pnpm --filter @md/web build:h5-netlify

rsync -az --delete apps/web/dist/ \
  your-server:/var/www/your-domain.example/dist/
```

HTTPS 证书可用 `acme.sh` 或 Certbot 申请与续期。

## 桌面端使用

- **打开文件夹**：左上角「打开文件夹」→ 选目录 → 左侧出现文件树
- **打开单文件**：文件树旁的 ➕；其所在文件夹会自动加载到列表
- **Finder 双击 / 右键打开**：首次可「右键 → 打开方式 → mdlook」，之后可设为默认
- **保存回源文件**：左下角「保存到源文件」

## 开发路线（待办）

> 已完成：Claude 主题、字体可选、Tauri 桌面端、本地文件树、`.md` 关联、原生剪贴板、所见即所得（Vditor IR）、默认图床 API（GitHub / R2 / Docker 本地存储）。

按优先级排列，有空逐步推进：

1. **本地全局搜索** —— Obsidian 式跨文件检索，强化"本地管理"能力
2. **代码签名 + 公证** —— 对外分发 / 上架前完成（Apple Developer，未签名时他人首次打开需右键绕过 Gatekeeper）
3. **多主题 + 多平台导出** —— 再精选几套主题（杂志 / 学术 / 极简）；导出适配知乎、掘金
4. **公众号官方图床增强** —— 在默认图床 API 之外，探索登录态 / 素材库链路
5. **DMG 打包** —— 目前仅出 `.app`（`dmg` 步骤在 macOS 偶发失败），正式发布时改回 `["app", "dmg"]`
6. **跨平台与质量** —— Windows / Intel 走 CI 构建；每套主题用统一"全语法测试文档"做 QA

> 已知限制：整页米白背景在预览 / 导出生效，但微信公众号会强制白底，整页米白可能不保留（逐元素样式可保留）。

## 致谢与许可

- 基于 **[doocs/md](https://github.com/doocs/md)** 定制开发，遵循其 [LICENSE](./LICENSE)。
- 原项目文档：[README（doocs/md）](https://github.com/doocs/md/blob/main/README.md)。
- 感谢 doocs 社区与所有原项目贡献者。

本仓库仅作个人使用与学习，保留原项目署名与许可证。
