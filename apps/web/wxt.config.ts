import type { ConfigEnv } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'wxt'
import ViteConfig from './vite.config'

function getRootPackageVersion() {
  let dir = __dirname
  while (dir !== path.parse(dir).root) {
    const pkgPath = path.join(dir, `package.json`)
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, `utf-8`))
      if (pkg.version)
        return pkg.version
    }
    dir = path.dirname(dir)
  }
  return `0.0.0`
}

const version = getRootPackageVersion()

export default defineConfig({
  srcDir: `src`,
  modulesDir: `src/modules`,
  manifest: ({ browser }) => ({
    name: `mdlook · 公众号排版`,
    version,
    icons: {
      256: `/favicon.png`,
    },
    permissions: [`storage`, `activeTab`, `sidePanel`, `contextMenus`],
    host_permissions: [
      `https://*.github.com/*`,
      `https://*.githubusercontent.com/*`,
      `https://*.gitee.com/*`,
      `https://*.weixin.qq.com/*`,
      // 微信公众号图片
      `https://*.qpic.cn/*`,
      `https://www.plantuml.com/*`,
    ],
    web_accessible_resources: [
      {
        resources: [`*.png`, `*.svg`, `injected.js`],
        matches: [`<all_urls>`],
      },
    ],
    side_panel: browser === `chrome`
      ? {
          default_path: `sidepanel.html`,
        }
      : undefined,
    sidebar_action: browser === `firefox`
      ? {
          default_panel: `sidepanel.html`,
          default_icon: {
            256: `favicon.png`,
          },
          default_title: `mdlook · 公众号排版`,
        }
      : undefined,
    commands: {
      _execute_sidebar_action: {
        description: `打开 mdlook 公众号排版侧边栏`,
        suggested_key: {
          default: `Ctrl+Shift+Y`,
        },
      },
    },
  }),
  zip: {
    name: `mdlook`,
    artifactTemplate: `{{name}}-{{version}}-{{browser}}.zip`,
    excludeSources: [
      `dist/**`,
      `docker/**`,
      `docs/**`,
      `example/**`,
      `functions/**`,
      `md-cli/**`,
      `scripts/**`,
      `src/extension/**`,
    ],
  },
  analysis: {
    open: true,
  },
  vite: ({ mode }) => {
    const config = ViteConfig({ mode } as ConfigEnv)

    return {
      ...config,
      plugins: config.plugins!.filter((plugin) => {
        if (typeof plugin === `object` && plugin != null && `name` in plugin && plugin?.name === `vite-plugin-Radar`) {
          return false
        }
        return true
      }),
      define: undefined,
      build: undefined,
      base: `/`,
    }
  },
})
