/**
 * CSS 主题导出
 * 将 CSS 文件作为字符串导出供 JavaScript 使用
 */

import baseCSS from './base.css?raw'
import claudeV2CSS from './claude-v2.css?raw'
import claudeCSS from './claude.css?raw'
import defaultCSS from './default.css?raw'
import graceCSS from './grace.css?raw'
import midnightCSS from './midnight.css?raw'
import notionCSS from './notion.css?raw'
import simpleCSS from './simple.css?raw'
import stripeCSS from './stripe.css?raw'
import vercelCSS from './vercel.css?raw'
import wiseCSS from './wise.css?raw'

/**
 * 基础样式 CSS
 */
export const baseCSSContent = baseCSS

/**
 * CSS 主题映射表
 */
export const themeMap = {
  default: defaultCSS,
  grace: graceCSS,
  simple: simpleCSS,
  claude: claudeCSS,
  claudeV2: claudeV2CSS,
  vercel: vercelCSS,
  stripe: stripeCSS,
  notion: notionCSS,
  wise: wiseCSS,
  midnight: midnightCSS,
} as const

export type ThemeName = keyof typeof themeMap
