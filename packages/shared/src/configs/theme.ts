import type { IConfigOption } from '../types'
import type { ThemeName } from './theme-css'

// 导出 CSS 主题（新主题系统）
export { baseCSSContent, themeMap, type ThemeName } from './theme-css'

export const themeOptionsMap = {
  default: {
    label: `经典`,
    value: `default`,
    desc: ``,
  },
  grace: {
    label: `优雅`,
    value: `grace`,
    desc: `@brzhang`,
  },
  simple: {
    label: `简洁`,
    value: `simple`,
    desc: `@okooo5km`,
  },
  claude: {
    label: `Claude`,
    value: `claude`,
    desc: `米白珊瑚橙`,
  },
  claudeV2: {
    label: `Claude V2`,
    value: `claudeV2`,
    desc: `纯白砖红`,
  },
  vercel: {
    label: `Vercel`,
    value: `vercel`,
    desc: `极简黑白`,
  },
  stripe: {
    label: `Stripe`,
    value: `stripe`,
    desc: `靛紫优雅`,
  },
  notion: {
    label: `Notion`,
    value: `notion`,
    desc: `中性文档`,
  },
  wise: {
    label: `Wise`,
    value: `wise`,
    desc: `清新绿`,
  },
  midnight: {
    label: `暗夜`,
    value: `midnight`,
    desc: `深色翡翠绿`,
  },
}

export const themeOptions: IConfigOption<ThemeName>[] = [
  {
    label: `经典`,
    value: `default`,
    desc: ``,
  },
  {
    label: `优雅`,
    value: `grace`,
    desc: `@brzhang`,
  },
  {
    label: `简洁`,
    value: `simple`,
    desc: `@okooo5km`,
  },
  {
    label: `Claude V2`,
    value: `claudeV2`,
    desc: `纯白砖红`,
  },
  {
    label: `Claude`,
    value: `claude`,
    desc: `米白珊瑚橙`,
  },
  {
    label: `Vercel`,
    value: `vercel`,
    desc: `极简黑白`,
  },
  {
    label: `Stripe`,
    value: `stripe`,
    desc: `靛紫优雅`,
  },
  {
    label: `Notion`,
    value: `notion`,
    desc: `中性文档`,
  },
  {
    label: `Wise`,
    value: `wise`,
    desc: `清新绿`,
  },
  {
    label: `暗夜`,
    value: `midnight`,
    desc: `深色翡翠绿`,
  },
]
