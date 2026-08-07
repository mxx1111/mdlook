# 参与 mdlook 开发

感谢你帮助改进 mdlook。mdlook 基于 [doocs/md](https://github.com/doocs/md) 演进，保留上游版权与 WTFPL 许可；产品问题、功能建议和代码变更请提交到 mdlook 自己的仓库。

## 开始之前

- Node.js ≥ 22.22.2
- pnpm
- 构建 macOS App 时还需要 Rust 与 Tauri 2 的系统依赖

```bash
git clone https://github.com/mxx1111/mdlook.git
cd mdlook
pnpm install
pnpm web dev
```

如需跟踪上游变化，可以额外添加只读上游：

```bash
git remote add upstream https://github.com/doocs/md.git
```

不要把功能分支直接推送到上游 doocs/md。

## 分支与提交

- 功能分支：`feat/description`
- 修复分支：`fix/description`
- 提交信息使用英文 Conventional Commits，例如：

```text
feat(sync): add account draft recovery
fix(desktop): refresh editor after file switch
docs(security): update private reporting route
```

## 提交前检查

按改动范围运行最小但充分的检查：

```bash
pnpm run type-check
pnpm exec eslint <changed-files>
```

涉及不同发布端时再运行对应构建：

```bash
pnpm --filter @md/web build:h5-netlify
pnpm --filter @md/web ext:zip
pnpm --filter @md/web tauri build
```

根域名部署只能使用 `build:h5-netlify` 的 `/static/...` 资源产物，不能上传普通 `/md/` 构建。

## 安全与隐私

- 不要提交 API Key、密码、Token、数据库连接信息或支付凭据。
- 不要把个人文风 Skill 正文、写作样本或本地绝对路径打入前端资源。
- 不要在日志或错误提示中回显服务端密钥、私有 Skill 片段或 AI 上游响应中的敏感内容。
- 安全问题请按 [SECURITY.md](./SECURITY.md) 私密报告，不要公开披露利用细节。

## 问题与建议

- 普通问题和功能建议：[mdlook Issues](https://github.com/mxx1111/mdlook/issues)
- 版本记录：[CHANGELOG.md](./CHANGELOG.md)
- 产品与同步设计：[docs/DESKTOP-PRODUCT-AND-SYNC-PLAN.md](./docs/DESKTOP-PRODUCT-AND-SYNC-PLAN.md)
