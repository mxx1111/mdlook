import rootPackage from '../../../../../package.json'
import tauriConfig from '../../../src-tauri/tauri.conf.json'

export type MdlookRuntime = `desktop` | `extension` | `web`

function detectRuntime(): MdlookRuntime {
  if (typeof window === `undefined`)
    return `web`
  if (`__TAURI_INTERNALS__` in window || `__TAURI__` in window)
    return `desktop`
  if (window.location.protocol === `chrome-extension:` || window.location.protocol === `moz-extension:`)
    return `extension`
  return `web`
}

const runtime = detectRuntime()
const runtimeLabel = runtime === `desktop`
  ? `Mac`
  : runtime === `extension`
    ? `浏览器扩展`
    : `Web`

export const MDLOOK_PRODUCT = {
  name: `mdlook`,
  runtime,
  runtimeLabel,
  version: runtime === `desktop` ? tauriConfig.version : rootPackage.version,
  slogan: `专注写作、排版与发布`,
  description: `为 Markdown 写作者打造的网页与 Mac 一体化编辑器，兼顾写作、预览、公众号排版和本地文件管理。`,
  repositoryUrl: `https://github.com/mxx1111/mdlook`,
  feedbackUrl: `https://github.com/mxx1111/mdlook/issues`,
  releasesUrl: `https://github.com/mxx1111/mdlook/releases`,
  licenseUrl: `https://github.com/mxx1111/mdlook/blob/main/LICENSE`,
} as const

export interface MdlookRelease {
  version: string
  date: string
  title: string
  highlights: string[]
  platforms: MdlookRuntime[]
}

const MDLOOK_ALL_RELEASES: MdlookRelease[] = [
  {
    version: `0.1.9`,
    date: `2026-08-07`,
    title: `Mac Fn 听写兼容性修复`,
    platforms: [`desktop`],
    highlights: [
      `修复 Tauri 窗口层吞掉 Fn/Globe 修饰键事件，导致 macOS 系统听写快捷键无法启动的问题`,
      `Fn/Globe 事件交回 AppKit 原生响应链，继续遵循用户在系统设置中的听写快捷键配置`,
      `Command、Option 等现有快捷键仍沿用原处理逻辑，不影响编辑器和原生菜单操作`,
    ],
  },
  {
    version: `0.1.8`,
    date: `2026-08-07`,
    title: `Mac AI 排版稳定性与发布闭环`,
    platforms: [`desktop`],
    highlights: [
      `AI 自动排版改用流式响应，降低长文章处理时的请求超时概率`,
      `兼容模型思考过程输出，避免正文因结束标记解析错误而被截断`,
      `桌面发布自动递增版本并核验 App、DMG、文件大小与 SHA-256`,
      `下载清单与线上安装包采用同一份校验元数据，发布后执行公网回下载验收`,
    ],
  },
  {
    version: `2.2.0`,
    date: `2026-07-26`,
    title: `账号云草稿与私有文风创作`,
    platforms: [`web`, `extension`],
    highlights: [
      `新增账号独立的本机草稿库、自动保存、云同步和冲突副本保护`,
      `AI Key 改为服务端加密保存，浏览器只显示掩码并通过 mdlook 安全代理调用`,
      `支持导入每个账号独立的私有 Skill，并在润色前预览全文差异`,
      `移除原有公共 AI 代理与第三方网页转换服务，保留供应商直连和 Markdown 直链导入`,
      `正式开放 AI 智能排版与“按我的文风润色”入口`,
    ],
  },
  {
    version: `0.1.7`,
    date: `2026-07-26`,
    title: `Mac 正式发布与多端体验收口`,
    platforms: [`desktop`],
    highlights: [
      `完成账号云草稿、独立配置、加密 AI Key 与私有文风 Skill 联调`,
      `修复预览窄成单列、所见即所得宽度和工具栏提示遮挡问题`,
      `新建文章直接进入可恢复临时草稿，首次保存时再选择本地位置`,
      `通过本地文件切换、源码/所见即所得、编辑/双屏/预览实机回归`,
      `提供 M 系列 Mac 专用下载页与经过校验的 DMG 安装包`,
    ],
  },
  {
    version: `0.1.6`,
    date: `2026-07-26`,
    title: `Mac 云创作与私有文风升级`,
    platforms: [`desktop`],
    highlights: [
      `接入账号云草稿、加密 AI Key 与私有文风 Skill`,
      `新增文风润色差异预览，确认后才替换文章正文`,
      `移除原公共 AI 代理，预设供应商默认使用 mdlook 账户安全代理`,
      `原生菜单完成中文化并清理重复退出入口`,
      `延续本地临时草稿、文件切换与编辑预览稳定性优化`,
    ],
  },
  {
    version: `2.1.0`,
    date: `2026-07-26`,
    title: `mdlook 网页端与扩展品牌收口`,
    platforms: [`web`, `extension`],
    highlights: [
      `帮助、反馈、版本历史与关于页面统一使用 mdlook 自有内容`,
      `网页端与浏览器扩展按各自运行环境展示正确版本信息`,
      `浏览器扩展更新为 mdlook 名称、图标与本地配置说明`,
      `账号入口采用用户名密码注册登录，并支持用户独立配置同步`,
      `优化移动端编辑、预览与菜单交互，方便临时处理文章`,
    ],
  },
  {
    version: `0.1.5`,
    date: `2026-07-26`,
    title: `桌面写作体验与账号能力升级`,
    platforms: [`desktop`],
    highlights: [
      `修复所见即所得模式宽度异常、工具栏提示被遮挡等排版问题`,
      `新建文章先进入可恢复的临时草稿，首次保存时再选择本地位置`,
      `新增用户名密码注册登录、改密和用户独立排版配置同步`,
      `优化手机端编辑、预览、菜单与安全区域适配`,
      `改进桌面端文件切换、状态栏初始化和整体交互稳定性`,
    ],
  },
  {
    version: `0.1.4`,
    date: `2026-07-26`,
    title: `本地文件切换可靠性修复`,
    platforms: [`desktop`],
    highlights: [
      `修复侧边栏切换文件后标题变化但正文仍停留在上一篇的问题`,
      `统一源码编辑器与所见即所得编辑器的内容同步接口`,
      `改进快速连续切换文章时的编辑器刷新顺序`,
    ],
  },
  {
    version: `0.1.3`,
    date: `2026-06-20`,
    title: `Mac 本地写作工作流完善`,
    platforms: [`desktop`],
    highlights: [
      `新增 DeepSeek 智能排版与可保存的排版提示词`,
      `加入离线模板、原生菜单、导出和快捷键支持`,
      `支持本地图片、最近工作区与外部文件变更检测`,
      `完善发布前检查和微信公众号复制流程`,
    ],
  },
]

export const MDLOOK_RELEASES: MdlookRelease[] = MDLOOK_ALL_RELEASES.filter(
  release => release.platforms.includes(runtime),
)
