# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## mdlook-specific notes

`AGENTS.md` above documents the upstream **doocs/md** project. **This repo is `mdlook`**, a fork that adds a Tauri desktop app, a token-based theme system, and a deliberately narrowed UI. The notes below cover what AGENTS.md does not. Read `README.md` for the product framing.

### What mdlook adds on top of doocs/md

1. **Tauri 2 macOS desktop app** (`apps/web/src-tauri/`) — opens a local folder, browses a `.md` file tree, edits, and saves back to the source file. Same Vue web app, packaged natively.
2. **DESIGN.md token themes** (`packages/shared/src/design-md/`) — design-token-based themes (Claude / Linear / Vercel / Stripe / Apple / Figma / Notion) layered over the upstream CSS themes in `packages/shared/src/configs/theme-css/` (now including `claude.css`, the default).
3. **Product convergence** — account login, cloud sync, share pages, AI assistant, and tipping/membership code from upstream is **kept but hidden from the UI by default**. Don't assume a missing surface is deleted; it's likely just not mounted. The maintained surfaces are **web typesetting/publishing** and the **macOS local Markdown app**.

### Desktop (Tauri) commands

Run from repo root (the `web` script is `pnpm --filter @md/web`):

```bash
pnpm web tauri:dev        # run the desktop app in dev (loads the Vite dev server)
pnpm web tauri:build      # bump patch version (desktop:version) then tauri build
pnpm web desktop:version patch   # bump version across tauri.conf.json + Cargo.toml + Cargo.lock
```

`scripts/bump-desktop-version.mjs` keeps the Tauri version in sync across all three files — use it instead of editing versions by hand.

### Desktop architecture

- **Detection / state:** `apps/web/src/stores/desktop.ts` (`useDesktopStore`). `isTauri` is true only when `__TAURI_INTERNALS__`/`__TAURI__` exists on `window`; in the browser every desktop method is a no-op. Gate desktop-only behavior on `isTauri`, not on build flags.
- **Rust commands** (`apps/web/src-tauri/src/lib.rs`, called via `@tauri-apps/api`'s `invoke`):
  - `read_md_tree` — walk a folder into a file tree
  - `read_text_file` / `write_text_file` — load/save a `.md` file
  - `take_pending_file` — pick up a file opened via Finder double-click / "Open with mdlook" (also handles `.md` URL association; CJK paths supported)
  - `copy_html` / `copy_text` — native clipboard, used to bypass WebView clipboard limits when copying to WeChat
- **Web fallbacks:** `apps/web/src/utils/clipboard.ts` and `utils/file.ts` branch between native Tauri calls and browser APIs.

When adding a desktop capability, add the `#[tauri::command]` in `lib.rs`, register it in the `run()` handler, allow it in `apps/web/src-tauri/capabilities/`, and call it through the `desktop` store's `invoke` wrapper.

### Troubleshooting

- **`pnpm install` fails in `apps/web` postinstall with `webidl.util.markAsUncloneable is not a function`** (stack goes through `wxt prepare` → `miniflare` → `undici`): this is a **Node version** problem, not a dependency problem. The repo requires **Node >= 22.22.2** (`.nvmrc` pins `v22.22.2`); `undici@8` calls an internal API that only exists on Node 22+, so it crashes on Node 20. The earlier `pnpm install` warning `Unsupported engine: wanted {"node":">=22.22.2"}` is the real cause. Fix: `nvm use` (or `nvm install 22.22.2`), confirm `node -v` shows v22.22.2, then re-run `pnpm install`. `nvm use` only affects the current terminal — make sure the IDE's integrated terminal is also on Node 22.
- The frontend dev server (`pnpm start` / `pnpm web dev`) serves at **http://localhost:5173/md/** — note the `/md/` base path.
