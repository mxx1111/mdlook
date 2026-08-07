# macOS 桌面端打包（Tauri）

mdlook 桌面端基于 **Tauri 2**，源码在 `apps/web/src-tauri/`，复用同一套 Vue 前端。本文记录在 macOS 上构建 `.app` / `.dmg` 的完整步骤与常见坑。

## 一、前置依赖

| 依赖                     | 说明                                   |
| ------------------------ | -------------------------------------- |
| Node `>= 22.22.2`        | 见 `.nvmrc`；`nvm use` 切换            |
| pnpm                     | 通过 `corepack enable pnpm` 或全局安装 |
| Rust 工具链              | `cargo` / `rustc`，Tauri 编译必需      |
| Xcode Command Line Tools | `xcode-select --install`               |

安装 Rust（任选其一）：

```bash
brew install rust                 # 最简单，复用 Homebrew
# 或官方 rustup（可管理多版本）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

> **国内网络可选**：直连 crates.io 拉依赖很慢，可在 `~/.cargo/config.toml` 配镜像（示例用 rsproxy，也可换 ustc/tuna）：
>
> ```toml
> [source.crates-io]
> replace-with = "rsproxy-sparse"
>
> [source.rsproxy-sparse]
> registry = "sparse+https://rsproxy.cn/index/"
>
> [net]
> git-fetch-with-cli = true
> ```

## 二、构建命令

```bash
pnpm web tauri:dev     # 桌面开发模式（加载 Vite dev server）
pnpm web tauri:build   # 先 patch 版本号，再构建产物
pnpm web tauri build   # 直接构建，不 patch 版本号（重打包时用）
```

- `tauri:build` = `pnpm desktop:version patch && tauri build`，**每次都会把补丁版本号 +1**。
- 只想重打包、不动版本号时用 `pnpm web tauri build`。
- 版本号由 `scripts/bump-desktop-version.mjs` 统一同步到 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 三处，**不要手改**。

正式发布不要只执行底层构建命令，使用根目录发布命令：

```bash
pnpm desktop:release patch   # 默认 patch，也支持 minor / major / 0.2.0
```

发布命令要求 Git 工作区干净，并依次完成版本递增、Tauri 构建、App 内版本核验、
DMG 大小与 SHA-256 计算，最后生成：

- `dist-release/mdlook_<版本>_<架构>.dmg`
- `dist-release/latest.json`
- `apps/web/public/download/latest.json`

任一步骤失败都会恢复受版本发布影响的已跟踪文件，避免留下“版本已增加但包没构建成功”的状态。

准备好产物后，可通过环境参数发布到任意静态服务器：

```bash
MDLOOK_DESKTOP_RELEASE_HOST=your-server \
MDLOOK_DESKTOP_RELEASE_DIR=/srv/mdlook/releases \
MDLOOK_DESKTOP_WEB_DIST_DIR=/srv/mdlook/web \
MDLOOK_DESKTOP_BASE_URL=https://md.example.com \
pnpm desktop:deploy
```

部署命令会先上传到临时目录，在服务器核对 SHA-256 后再原子切换两份
`latest.json`，最后从公网重新下载 DMG 验证大小和哈希。相同文件名一旦内容不同会拒绝覆盖。

## 三、产物与目标

`bundle.targets` 在 `apps/web/src-tauri/tauri.conf.json` 配置：

```jsonc
{
  "bundle": {
    "targets": ["app", "dmg"]
  }
}
```

- `app` → `target/release/bundle/macos/mdlook.app`
- `dmg` → `target/release/bundle/dmg/mdlook_<版本>_<架构>.dmg`（带"拖到 Applications"安装界面）

只配 `["app"]` 时**不会生成 dmg**（也就没有拖拽安装界面）。

## 四、本地化（中文右键菜单）

WebView 的原生文本菜单（Look Up / Cut / Copy 等）默认按英文显示。`apps/web/src-tauri/Info.plist` 声明了简体中文本地化，使其在中文系统下显示中文：

```xml
<key>CFBundleDevelopmentRegion</key>
<string>zh-Hans</string>
<key>CFBundleLocalizations</key>
<array><string>zh-Hans</string><string>en</string></array>
```

Tauri 会自动把该 `Info.plist` 合并进 macOS 包。

## 五、签名与 Gatekeeper

当前构建**未签名**（没有配置 Apple 开发者证书）：

- 本地构建的 `.app` 一般没有 quarantine 标记，直接双击/`open` 即可启动。
- 从网络下载的 `.dmg`/`.app` 会被 Gatekeeper 拦截，**右键 →「打开」**，或：

  ```bash
  xattr -dr com.apple.quarantine /Applications/mdlook.app
  ```

如需正式分发（免拦截、可自动更新），再配置 `bundle.macOS.signingIdentity` 与公证流程。

## 六、桌面端运行时

- 桌面端通过 `useDesktopStore`（`apps/web/src/stores/desktop.ts`）调用 Rust 命令读写本地 `.md` 文件、原生剪贴板等。
- 后端地址等环境变量来自 `apps/web/.env` 与（被 gitignore 的）`.env.local`，构建时由 Vite 注入。
