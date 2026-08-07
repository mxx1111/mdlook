# mdlook

**mdlook** is a Markdown editor for writing, previewing, and publishing WeChat Official Account articles across the Web and macOS.

- Source and releases: [github.com/mxx1111/mdlook](https://github.com/mxx1111/mdlook)
- Chinese documentation: [README.md](./README.md)
- Release notes: [CHANGELOG.md](./CHANGELOG.md)

## What mdlook provides

- Source, split, preview, and WYSIWYG editing modes.
- WeChat-ready themes, code highlighting, diagrams, formulas, and one-click rich-content copy.
- A native macOS app with local folders, recoverable temporary drafts, Save As, exports, and file associations.
- Username/password accounts, per-user preferences, local-first drafts, and cross-device cloud synchronization.
- AI formatting through the authenticated mdlook proxy, with encrypted provider credentials.
- Private per-user Skills and a review-before-replace writing-style polishing workflow.
- Responsive editing and preview interactions for mobile browsers.

Guest drafts stay in a separate local workspace. Signing in does not silently move or delete them; users can explicitly copy guest drafts into their account.

## Development

Requirements:

- Node.js 22.22.2 or newer
- pnpm
- Rust and the Tauri prerequisites when building the macOS app

```bash
pnpm install
pnpm web dev
```

Useful checks and builds:

```bash
pnpm run type-check
pnpm --filter @md/web build:h5-netlify
pnpm --filter @md/web ext:zip
pnpm --filter @md/web tauri build
```

Deploying at a domain root requires `build:h5-netlify`; the normal Web build keeps the inherited `/md/` base for compatibility and is not suitable for `https://your-domain.example/`.

## Security and privacy

Do not commit API keys or private Skill content. Cloud AI credentials and private Skill files are encrypted by the mdlook backend; this is server-side encryption, not end-to-end encryption, because the backend must decrypt selected data when calling the chosen AI provider.

See [SECURITY.md](./SECURITY.md) before reporting a vulnerability.

## Open-source attribution

mdlook evolves from the excellent [doocs/md](https://github.com/doocs/md) project. It retains the upstream copyright notices and the repository's [WTFPL license](./LICENSE). The Markdown rendering foundation remains the work of the original authors and contributors; mdlook maintains its own product experience, desktop workflow, account services, and deployment.
