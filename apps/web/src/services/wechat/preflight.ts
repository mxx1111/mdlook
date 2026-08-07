export type PreflightLevel = 'error' | 'warning' | 'info'

export interface PreflightIssue {
  level: PreflightLevel
  title: string
  detail: string
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
]

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (PRIVATE_HOST_PATTERNS.some(pattern => pattern.test(host)))
    return true
  if (!/^172\.\d{1,2}\./.test(host))
    return false
  const second = Number(host.split(`.`)[1])
  return second >= 16 && second <= 31
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === `http:` || url.protocol === `https:`) && !isPrivateHost(url.hostname)
  }
  catch {
    return false
  }
}

function inspectImages(raw: string, root: HTMLElement, issues: PreflightIssue[]) {
  const markdownImages = [...raw.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
  markdownImages.forEach((match) => {
    const src = match[1]?.trim().replace(/^['"]|['"]$/g, ``)
    if (!src)
      return
    if (src.startsWith(`data:`)) {
      issues.push({
        level: src.length > 1.4 * 1024 * 1024 ? `error` : `warning`,
        title: `内嵌图片`,
        detail: src.length > 1.4 * 1024 * 1024 ? `有图片为大体积 data URL，公众号可能无法接收。` : `有图片为 data URL，建议转为公网图片或本地 assets 后再复制。`,
      })
      return
    }
    if (!isPublicHttpUrl(src) && !src.startsWith(`/`)) {
      issues.push({
        level: `warning`,
        title: `非公网图片`,
        detail: `图片 ${src} 不是公网 HTTP(S) 地址，复制到公众号后可能无法显示。`,
      })
    }
  })

  root.querySelectorAll<HTMLImageElement>(`img[src]`).forEach((img) => {
    const src = img.getAttribute(`src`)?.trim()
    if (!src)
      return
    if (src.startsWith(`blob:`) || src.startsWith(`file:`)) {
      issues.push({
        level: `warning`,
        title: `本地图片`,
        detail: `存在本地或临时图片地址，公众号后台可能无法读取。`,
      })
    }
    else if (src.startsWith(`http`) && !isPublicHttpUrl(src)) {
      issues.push({
        level: `warning`,
        title: `内网图片`,
        detail: `图片 ${src} 指向内网或本机地址。`,
      })
    }
  })
}

function inspectLinks(raw: string, root: HTMLElement, issues: PreflightIssue[]) {
  const emptyMarkdownLinks = [...raw.matchAll(/\[[^\]]+\]\(\s*\)/g)]
  if (emptyMarkdownLinks.length) {
    issues.push({
      level: `warning`,
      title: `空链接`,
      detail: `发现 ${emptyMarkdownLinks.length} 个 Markdown 空链接。`,
    })
  }

  const anchorLinks = root.querySelectorAll<HTMLAnchorElement>(`a[href^="#"]`)
  if (anchorLinks.length) {
    issues.push({
      level: `info`,
      title: `页内锚点`,
      detail: `发现 ${anchorLinks.length} 个页内锚点，公众号可能不会保留跳转行为。`,
    })
  }

  const emptyLinks = root.querySelectorAll<HTMLAnchorElement>(`a:not([href]), a[href=""]`)
  if (emptyLinks.length) {
    issues.push({
      level: `warning`,
      title: `空链接`,
      detail: `渲染结果中发现 ${emptyLinks.length} 个空链接。`,
    })
  }
}

function inspectTables(root: HTMLElement, issues: PreflightIssue[]) {
  root.querySelectorAll<HTMLTableElement>(`table`).forEach((table, index) => {
    const maxCells = Math.max(0, ...[...table.rows].map(row => row.cells.length))
    if (maxCells > 5) {
      issues.push({
        level: `warning`,
        title: `表格较宽`,
        detail: `第 ${index + 1} 个表格有 ${maxCells} 列，移动端公众号阅读可能横向溢出。`,
      })
    }
  })
}

function inspectHeadings(root: HTMLElement, issues: PreflightIssue[]) {
  const headings = [...root.querySelectorAll<HTMLElement>(`h1,h2,h3,h4,h5,h6`)]
  const levels = headings.map(item => Number(item.tagName.slice(1)))
  if (levels.filter(level => level === 1).length > 1) {
    issues.push({
      level: `info`,
      title: `多个一级标题`,
      detail: `发现多个 H1，公众号文章通常建议只保留一个主标题。`,
    })
  }

  for (let index = 1; index < levels.length; index++) {
    if (levels[index] - levels[index - 1] > 1) {
      issues.push({
        level: `info`,
        title: `标题层级跳跃`,
        detail: `存在从 H${levels[index - 1]} 跳到 H${levels[index]} 的标题层级。`,
      })
      return
    }
  }
}

export function runWechatPreflight(raw: string, outputHtml: string): PreflightIssue[] {
  const root = document.createElement(`div`)
  root.innerHTML = outputHtml

  const issues: PreflightIssue[] = []
  inspectImages(raw, root, issues)
  inspectLinks(raw, root, issues)
  inspectTables(root, issues)
  inspectHeadings(root, issues)

  return issues
}
