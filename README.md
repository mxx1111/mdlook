<div align="center">

<img src="./apps/web/public/favicon.png" width="88" alt="mdlook app icon" />

<h1>mdlook</h1>

**Markdown 排版 · 微信公众号复制 · Mac 本地阅读**

网页端即开即用 · Mac 端管理本地 Markdown · 一键复制到公众号

[![node](https://img.shields.io/badge/node-%3E%3D22-42cc23?style=flat-square&labelColor=564341)](https://nodejs.org) [![tauri](https://img.shields.io/badge/desktop-Tauri%202-42cc23?style=flat-square&labelColor=564341)](https://tauri.app) [![based on](https://img.shields.io/badge/based%20on-doocs%2Fmd-42cc23?style=flat-square&labelColor=564341)](https://github.com/doocs/md)

</div>

## 项目介绍

**mdlook** 是一款面向公众号写作者和 Markdown 重度用户的排版工具，把两类场景合在一起：

1. **网页端排版发布** —— 打开浏览器即可写 Markdown、调主题、粘贴图片、复制到微信公众号后台；
2. **Mac 本地 Markdown App** —— 打开本地文件夹，左侧文件树浏览所有 `.md`，点击即时预览，改了能存回源文件。

> 本项目基于优秀的开源项目 **[doocs/md](https://github.com/doocs/md)** 演进，沿用仓库所附 **WTFPL** 并完整保留上游版权信息。核心渲染与排版能力归功于原作者，mdlook 侧重点是「更好看的默认主题」「可动态导入 DESIGN.md 主题」「Mac 本地文件管理」和「自托管图床 / 公众号图片链路」。

## 主要特性

- 🎨 **Claude 默认主题**：黏土橙点缀、舒适字号与标题层级，默认就适合公众号长文阅读
- 🧩 **DESIGN.md 动态主题**：内置 Claude / Linear / Vercel / Stripe / Apple / Figma / Notion，可从 URL 导入自定义主题
- 📋 **一键复制到公众号**：内联 CSS，粘贴不掉格式；桌面端走原生剪贴板，规避 WebView 限制
- 🖼 **图片粘贴与图床**：支持复制图片后粘贴上传；自托管后端可使用 GitHub / R2 / Docker 本地存储
- 🔁 **微信图片转换雏形**：可在复制前把文章图片上传到公众号图文图片接口并替换 URL（需后端配置公众号 AppID / AppSecret）
- 🤖 **AI 自动排版**：一键整理标题层级、段落节奏、列表结构与加粗密度；也可只用「基础排版」在本机处理空行、标点与中英文间距，完全不调 AI
- ✒️ **私有文风润色**：用你自己的文风 Skill 重写全文，先生成预览、确认差异后才替换正文
- 🔐 **云端密钥安全代理**：API Key 加密保存在服务端，前端只显示掩码；这是服务端加密而非端到端加密，因为后端调用供应商时必须解密
- 🗂 **本地文件树**（桌面端）：打开文件夹浏览所有 Markdown，点击即看，支持保存回源文件
- 🔗 **`.md` 文件关联**：Finder 双击 / 右键「用 mdlook 打开」直接载入（支持中文路径）
- 🔎 **文章库搜索 / 替换**：侧栏支持跨文章标题与内容搜索、正则、大小写与批量替换
- ✍️ **丰富语法**：表格、数学公式（KaTeX）、Mermaid、GFM 警告块、脚注、代码高亮等
- 🔤 **可选字体**：无衬线 / 衬线 / 宋体 / 仿宋（公文）/ 等宽，自由切换
- 🌗 **明暗模式**：跟随系统或手动切换

## 产品收敛

mdlook 当前重点维护 **Web 排版发布** 与 **Mac 本地 Markdown App**。上游 doocs/md 的能力大多保留在代码里，但按完成度用构建开关控制是否挂到界面上，避免实验功能干扰写作主流程 —— **界面上看不到，通常不代表功能被删了**。

默认开启：账户登录与个人排版配置同步、AI 自动排版与私有文风润色。默认关闭：文章正文多端同步、分享页、赞赏与会员。

各开关默认值见 `apps/web/.env.example`，在前端构建环境变量中显式覆盖即可：

```env
VITE_ACCOUNT_UI_ENABLED=true   # 账户入口（Footer 与移动端菜单）
VITE_AI_UI_ENABLED=true        # AI 助手、自动排版与图片能力
VITE_SYNC_UI_ENABLED=true      # 文章正文云同步
VITE_SHARE_UI_ENABLED=true     # 分享页
VITE_FUND_UI_ENABLED=true      # 赞赏 / 会员
```

> 账户、AI 代理和私有 Skill 走 `VITE_ACCOUNT_API_URL`；图床、微信图片、主题与分享走 `VITE_CAPABILITY_API_URL`。这是两个独立后端，**不要用一个模糊基址同时表示两者**，否则登录凭据会被发到不该去的服务。

## 适用场景

- **公众号写作者**：把 Markdown 文章快速排成适合微信后台粘贴的富文本。
- **团队演示 / 原型**：先选一套 DESIGN.md 品牌风格，再快速生成统一调性的演示文档。
- **Mac 本地知识库**：用桌面端打开本地 Markdown 文件夹，作为轻量阅读、预览和修订工具。
- **自托管用户**：把前端静态站点和后端 API 部署到自己的服务器，图床文件保存在自己的存储中。

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
pnpm desktop:release patch           # 正式发布：构建、校验 DMG 并生成 latest.json

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

正式发布产物位于 `dist-release/`。`pnpm desktop:release` 会核验 App 内版本并生成
包含版本、发布日期、源码提交、文件大小和 SHA-256 的 `latest.json`；远端部署可使用
`pnpm desktop:deploy`，服务器地址与路径通过环境变量传入，不写入公开仓库。

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
VITE_CAPABILITY_API_URL=https://your-domain.example/api \
VITE_UPLOAD_VIA_API=true \
SERVER_ENV=NETLIFY \
pnpm --filter @md/web build:h5-netlify

rsync -az --delete apps/web/dist/ \
  your-server:/var/www/your-domain.example/dist/
```

HTTPS 证书可用 `acme.sh` 或 Certbot 申请与续期。

若同时启用用户名密码账户，另设
`VITE_ACCOUNT_API_URL=https://your-account-domain.example/shiyi`。账户后端与
图床、主题、微信图片和文档同步能力后端是两个独立接口，不能共用同一个模糊基址。

AI 自动排版与私有文风润色也走账户后端的 `/mdlook/ai/chat/completions` 代理，
因此需要账户后端可用；未配置 `VITE_ACCOUNT_API_URL` 时，界面上这些入口不会出现。
若代理的上游模型默认开启「思考模式」（如 DeepSeek V4），务必在后端请求体里显式关闭
（`thinking.type = disabled`）—— 否则推理会先耗尽 `max_tokens`，正文一个字都发不出来。

「帮助 → 下载 Mac 版」的跳转地址由 `VITE_DOWNLOAD_PAGE_URL` 指定，留空则隐藏该菜单项。

## 桌面端使用

- **打开文件夹**：左上角「打开文件夹」→ 选目录 → 左侧出现文件树
- **打开单文件**：文件树旁的 ➕；其所在文件夹会自动加载到列表
- **Finder 双击 / 右键打开**：首次可「右键 → 打开方式 → mdlook」，之后可设为默认
- **保存回源文件**：左下角「保存到源文件」

## 开发路线（待办）

### 已完成

- Claude 默认主题、标题层级优化、字体 / 主题色可选
- DESIGN.md 官方主题列表、自定义 URL 导入与本地保存
- Tauri Mac 桌面端、本地文件树、`.md` 文件关联、保存回源文件
- 原生剪贴板、所见即所得（Vditor IR）、Markdown / HTML / PDF / PNG 导出
- 默认图床 API（GitHub / R2 / Docker 本地存储）
- 文章库跨文章搜索 / 替换
- 微信公众号图文图片转换接口雏形（当前需自托管后端开启）
- 用户名密码账户、个人排版配置跨设备同步
- AI 自动排版、私有文风润色（预览确认后替换）、云端密钥安全代理
- 云同步、分享页、赞赏 / 会员入口默认隐藏，必要时通过 `VITE_*_UI_ENABLED` 显式开启

### 进行中 / 待完善

1. **网页端大众化体验** —— 首次引导、示例文章、空状态、错误提示、主题预览图与移动端细节还可以继续打磨。
2. **公众号图片链路** —— 目前已支持 `uploadimg` 转换雏形，后续可补图片压缩、失败重试、素材库 / 封面图管理。
3. **Mac App 分发体验** —— 目前按自用分发处理；短期不做付费 Apple Developer 签名 / 公证，优先补 DMG、自动更新提示和更清楚的首次打开说明。
4. **本地文件夹全局检索** —— 现有搜索覆盖文章库，桌面端还需要进一步支持对打开文件夹的磁盘级跨文件检索。
5. **多平台导出适配** —— 当前重点是微信公众号；知乎、掘金、少数派等平台可增加独立导出 / 复制规则。
6. **跨平台与质量** —— Windows / Intel Mac CI 构建、统一全语法测试文档、主题截图回归测试还未完成。

> 已知限制：整页米白背景在预览 / 导出生效，但微信公众号会强制白底，整页米白可能不保留（逐元素样式可保留）。

## 致谢与许可

- 基于 **[doocs/md](https://github.com/doocs/md)** 持续演进，遵循仓库所附 [WTFPL LICENSE](./LICENSE)，并保留原作者版权信息。
- 原项目文档：[README（doocs/md）](https://github.com/doocs/md/blob/main/README.md)。
- 感谢 doocs 社区与所有原项目贡献者。

mdlook 作为独立产品持续维护；任何分发与再开发都会保留上游项目署名及许可证。
