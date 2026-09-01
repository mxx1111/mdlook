import type { AIChatPayload, AIRequestMode } from '@/services/ai/types'
import {
  resolveAIChatRequest,
  SafeAIError,
  useAIFetch,
} from '@/composables/useAIFetch'

export type AutoFormatMode = `basic` | `ai`

export interface AIFormatOptions {
  apiKey: string
  endpoint: string
  maxToken: number
  model: string
  prompt: string
  requestMode: AIRequestMode
  serviceType: string
  signal?: AbortSignal
  style: AIFormatStyle
  temperature: number
}

export type AIFormatStyle = `wechat-clean` | `tech` | `product` | `spoken-formal` | `structure-only`

export const AI_FORMAT_STYLE_LABELS: Record<AIFormatStyle, string> = {
  'wechat-clean': `公众号清爽`,
  'tech': `技术文章`,
  'product': `产品介绍`,
  'spoken-formal': `口语转正式`,
  'structure-only': `保留原文，只优化结构`,
}

export const DEFAULT_AI_FORMAT_PROMPT = [
  `不要使用一级标题（# ）：一级标题会让标题和正文两边出现缩进，在手机上很难看。文章正文的小标题统一使用三级标题（### ），需要更深层级时再依次往下用四级标题。`,
  `每个小标题前用阿拉伯数字编号并依次递增，例如「### 1. 小标题」「### 2. 小标题」，避免使用中文数字或符号编号。`,
  `在不改变原意的前提下，优化标题层级、段落节奏、列表结构、引用和空行，让文章更适合微信公众号在手机上阅读。`,
  `可以用 Markdown 加粗（**）标识重点字词或关键句，但必须克制：优先标记核心结论、关键数字、重要概念和行动提示。`,
  `加粗不宜过多也不宜过少：短文约 2-4 处，中等文章约 4-8 处，长文约 8-12 处；同一段通常不超过 1 处，避免整段加粗。`,
  `不要编造事实，不要删除用户的核心信息，不要把文章改成营销稿或夸张口吻。`,
].join(`\n`)

const CJK = `\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF`
const asciiWord = `\\w@#&=+\\-/`

function isFence(line: string) {
  return /^\s*(?:```|~~~)/.test(line)
}

function formatInlineText(line: string) {
  return line
    .replace(/[ \t]+$/g, ``)
    .replace(new RegExp(`([${CJK}])([${asciiWord}])`, `g`), `$1 $2`)
    .replace(new RegExp(`([${asciiWord}])([${CJK}])`, `g`), `$1 $2`)
    .replace(/ {2,}/g, ` `)
}

function normalizeMarkdownLine(line: string, inFence: boolean) {
  if (inFence)
    return line.replace(/[ \t]+$/g, ``)

  let next = line.replace(/\t/g, `  `).replace(/[ \t]+$/g, ``)

  next = next.replace(/^(#{1,6})([^\s#])/u, `$1 $2`)
  next = next.replace(/^(\s*[-+*])\s{2,}(\S)/u, `$1 $2`)
  next = next.replace(/^(\s*\d+\.)\s{2,}(\S)/u, `$1 $2`)
  next = next.replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/u, `---`)

  if (/^\s*\|.*\|\s*$/.test(next))
    return next

  return formatInlineText(next)
}

function needsBlankAround(line: string) {
  const trimmed = line.trim()
  if (!trimmed)
    return false

  return /^#{1,6}\s/.test(trimmed)
    || /^>\s?/.test(trimmed)
    || /^!\[[^\]]*\]\([^)]+\)/.test(trimmed)
    || /^---$/.test(trimmed)
    || /^\|.*\|$/.test(trimmed)
}

function appendBlank(lines: string[]) {
  if (lines.length && lines[lines.length - 1] !== ``)
    lines.push(``)
}

export function formatMarkdownBasic(content: string) {
  const normalized = content.replace(/\r\n?/g, `\n`).trim()
  if (!normalized)
    return ``

  const lines = normalized.split(`\n`)
  const result: string[] = []
  let inFence = false
  let previousWasBlank = false

  for (const raw of lines) {
    const fenceBefore = inFence
    if (isFence(raw))
      inFence = !inFence

    const line = normalizeMarkdownLine(raw, fenceBefore)
    const isBlank = line.trim() === ``

    if (isBlank) {
      if (!previousWasBlank && result.length)
        result.push(``)
      previousWasBlank = true
      continue
    }

    if (!fenceBefore && needsBlankAround(line))
      appendBlank(result)

    result.push(line)
    previousWasBlank = false

    if (!inFence && needsBlankAround(line))
      appendBlank(result)
  }

  return result.join(`\n`).replace(/\n{3,}/g, `\n\n`).trimEnd()
}

function stripMarkdownFence(content: string) {
  const trimmed = content.trim()
  const lines = trimmed.split(`\n`)
  const first = lines[0]?.trim().toLowerCase()
  const last = lines[lines.length - 1]?.trim()
  const hasMarkdownFence = first === `\`\`\`` || first === `\`\`\`markdown` || first === `\`\`\`md`
  if (hasMarkdownFence && last === `\`\`\``)
    return lines.slice(1, -1).join(`\n`).trim()
  return trimmed
}

function getFormatInstruction(style: AIFormatStyle) {
  switch (style) {
    case `tech`:
      return `偏技术文章：保留术语、代码、链接和表格，优化标题层级、步骤列表、解释顺序和阅读节奏。`
    case `product`:
      return `偏产品介绍：突出卖点、场景、功能分组和行动路径，但不要虚构产品能力。`
    case `spoken-formal`:
      return `把明显口语化表达整理得更正式清晰，但保持原意，不扩写事实。`
    case `structure-only`:
      return `严格保留原文措辞，只调整 Markdown 结构、标题、段落、列表、引用和空行。`
    default:
      return `偏微信公众号清爽排版：段落短一点，小标题清楚，强调克制，适合移动端阅读。`
  }
}

export async function formatMarkdownWithAI(content: string, options: AIFormatOptions) {
  if (!content.trim())
    return ``
  if (!options.endpoint || !options.model)
    throw new SafeAIError(`请先完成 AI 服务和模型配置。`)
  if (
    options.requestMode === `direct`
    && !options.apiKey.trim()
  ) {
    throw new SafeAIError(`本机直连需要填写当前会话使用的 API Key。`)
  }

  const payload: AIChatPayload = {
    model: options.model,
    temperature: Math.min(options.temperature, 0.5),
    max_tokens: Math.max(options.maxToken, 2048),
    stream: true,
    messages: [
      {
        role: `system`,
        content: [
          `你是 mdlook 的 Markdown 自动排版助手。`,
          `只返回排版后的 Markdown 正文，不要解释，不要包裹代码围栏。`,
          `不要编造事实，不要删除用户核心信息，不要把文章改成营销稿。`,
          `必须保留代码块、链接、图片、表格、脚注、公式和 Mermaid/PlantUML 等特殊块。`,
        ].join(`\n`),
      },
      {
        role: `user`,
        content: [
          `排版风格：${AI_FORMAT_STYLE_LABELS[options.style]}`,
          getFormatInstruction(options.style),
          ``,
          `用户自定义排版要求：`,
          options.prompt.trim() || DEFAULT_AI_FORMAT_PROMPT,
          ``,
          `请排版下面这篇 Markdown：`,
          ``,
          content,
        ].join(`\n`),
      },
    ],
  }

  return requestMarkdownResult(options, payload)
}

export async function polishMarkdownWithPrivateStyle(
  content: string,
  options: Omit<AIFormatOptions, `prompt` | `style`>,
  skillSlug: string,
) {
  if (!content.trim())
    return ``
  if (options.requestMode !== `proxy`)
    throw new SafeAIError(`私有文风 Skill 只能通过登录后的安全代理使用。`)

  const payload: AIChatPayload = {
    model: options.model,
    temperature: Math.min(options.temperature, 0.45),
    max_tokens: Math.max(options.maxToken, 4096),
    stream: true,
    messages: [
      {
        role: `system`,
        content: [
          `你是 mdlook 的私有文风润色助手。`,
          `严格依据服务端提供的用户私有 Skill 处理文章。`,
          `只返回润色后的完整 Markdown，不要解释，不要使用代码围栏。`,
          `不得编造事实、改变观点、删除关键信息或破坏链接、图片、代码、表格和公式。`,
        ].join(`\n`),
      },
      {
        role: `user`,
        content: [
          `请按照我的私有文风润色下面的 Markdown。`,
          `保留原有事实、论点、标题结构和特殊块，只优化措辞、节奏与表达一致性。`,
          ``,
          content,
        ].join(`\n`),
      },
    ],
  }

  return requestMarkdownResult(
    options,
    payload,
    [skillSlug],
    [
      `按用户私有文风润色当前 Markdown；保持事实、观点、结构和特殊块不变。`,
      `文章主题摘录：`,
      content.replace(/\s+/g, ` `).slice(0, 1600),
    ].join(`\n`),
  )
}

async function requestMarkdownResult(
  options: Pick<
    AIFormatOptions,
    `apiKey` | `endpoint` | `requestMode` | `serviceType` | `signal`
  >,
  payload: AIChatPayload,
  skillSlugs?: string[],
  task?: string,
) {
  const request = resolveAIChatRequest({
    apiKey: options.apiKey,
    endpoint: options.endpoint,
    payload,
    requestMode: options.requestMode,
    serviceType: options.serviceType,
    skillSlugs,
    task,
  })
  // 走 SSE 而不是一次性 JSON：整篇排版的生成耗时经常超过网关和 Spring 异步
  // 请求的超时上限，流式下首字节几秒就到，后续分片持续到达即可。
  const { fetchSSE } = useAIFetch()
  let result = ``
  let reasoningLength = 0
  await fetchSSE(
    request.url,
    request.headers,
    request.payload as unknown as Record<string, unknown>,
    {
      onDelta: (content) => { result += content },
      // 思考过程既不该进正文也不必留存，只记长度用于区分“真空响应”和“预算被推理吃光”。
      onReasoningDelta: (reasoning) => { reasoningLength += reasoning.length },
    },
    request.mode,
    options.signal,
  )

  // fetchSSE 会静默吞掉取消，这里补一次判断，让调用方按取消而不是空响应处理。
  if (options.signal?.aborted)
    throw new DOMException(`Aborted`, `AbortError`)

  if (!result.trim()) {
    // 开着思考模式的模型（如 DeepSeek V4 默认 effort=high）会先把 max_tokens
    // 花在 reasoning_content 上，正文一个分片都发不出来。这种情况要指向真正的
    // 处方，而不是笼统地说没有内容。
    if (reasoningLength > 0) {
      throw new SafeAIError(
        `AI 只返回了思考过程，正文在 max_tokens 用尽前没能开始输出。请关闭模型思考模式或调高最大 Token 后重试。`,
      )
    }
    throw new SafeAIError(`AI 没有返回有效内容。`)
  }

  return stripMarkdownFence(result)
}
