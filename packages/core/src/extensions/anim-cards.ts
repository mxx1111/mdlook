/**
 * 动画图解卡片（StepCard / StatCard / StatusCard / CompareCard / BarCard）
 *
 * 把结构化数据渲染成一整张内联 SVG，用 SMIL <animate> 做逐段淡入、线条描画、
 * 数字滚动、条形生长、刻度滑动等循环动画——这是微信公众号里唯一能保留下来的动效手段。
 * 版式参照一篇公众号科技长文的手绘卡片：居中衬线标题、大号衬线序号 + 竖线、
 * 底部一句加粗总结；配色取 Claude V2 主题（米白 / 砖红 / 墨黑）。
 *
 * 约定：
 * - 被动画的元素，静态属性写的都是「最终状态」；只在动画过程中出现的元素（滚动中的
 *   中间数字、波纹、高亮带）静态 opacity 为 0。平台剥掉动画时卡片仍完整可读。
 * - 不输出 <tspan>：复制到公众号时，剪贴板处理会给所有 tspan 强制加 fill:#333。
 * - SVG 文字不会自动换行，这里按字符宽度估算后手动折行。
 */

import { escapeHtml } from '../utils/basicHelpers'

// ────────────────────────────────────────────────────────────────────────────
// 画布、配色、字体
// ────────────────────────────────────────────────────────────────────────────

const W = 750
const PAD = 56
const RIGHT = W - PAD

const C = {
  card: `#f3f0e8`,
  ink: `#171715`,
  text: `#3d3b36`,
  muted: `#8a867d`,
  line: `#dcd6ca`,
  track: `#e7e1d5`,
  bar: `#b9b2a5`,
  accent: `#c6533e`,
  gold: `#b07a1f`,
  noteBg: `#fbfaf6`,
  noteBorder: `#e3ddd1`,
}

const SERIF = `'Songti SC','Noto Serif SC',STSong,'Source Han Serif SC',Georgia,serif`
const SANS = `'PingFang SC','Noto Sans SC','Microsoft YaHei',-apple-system,sans-serif`
// 西文数字用 Didot，混排的汉字逐字回退到宋体
const NUM = `Didot,'Bodoni 72','Bodoni MT',Georgia,'Songti SC','Noto Serif SC',STSong,serif`

// ────────────────────────────────────────────────────────────────────────────
// 文字度量与折行
// ────────────────────────────────────────────────────────────────────────────

/** CJK 汉字、全角标点、全角字母数字：按 1 个字宽计 */
const FULL_WIDTH_RANGES: Array<[number, number]> = [
  [0x2E80, 0x9FFF],
  [0xF900, 0xFAFF],
  [0xFE30, 0xFE4F],
  [0xFF00, 0xFFEF],
]

function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0
  if (FULL_WIDTH_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi))
    return 1
  if (/[A-Z]/.test(ch))
    return 0.66
  if (/[a-z0-9]/.test(ch))
    return 0.56
  if (ch === ` ` || ch === `.` || ch === `,`)
    return 0.28
  return 0.38
}

function measure(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w * size
}

/** 贪心折行：中文逐字可断，英文单词 / 数字整体不拆 */
function wrap(s: string, size: number, maxW: number): string[] {
  const tokens = s.match(/[\w.\-/%+:@#&]+|\s+|\S/gu) ?? []
  const lines: string[] = []
  let line = ``
  for (const tok of tokens) {
    const next = line + tok
    if (line && measure(next, size) > maxW) {
      lines.push(line.trimEnd())
      line = tok.trimStart()
    }
    else {
      line = next
    }
  }
  if (line.trim())
    lines.push(line.trimEnd())
  return lines.length ? lines : [``]
}

// ────────────────────────────────────────────────────────────────────────────
// 动画引擎：所有元素共用一条时间轴，循环末尾一起淡出再重播
// ────────────────────────────────────────────────────────────────────────────

const EASE = `0.42 0 0.58 1`
const LOOP_END = 0.95

/** 片段在拿到总时长 T 之后才能生成 keyTimes，因此延迟到最后序列化 */
type Frag = (T: number) => string

type Target = { attr: string } | { transform: `translate` | `scale` | `rotate` }

/** 关键帧：[秒, 值] */
type KF = [number, string | number]

function r1(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function f3(n: number): string {
  return Math.min(Math.max(n, 0), 1).toFixed(3)
}

function dur(T: number): string {
  return `${T.toFixed(2)}s`
}

/**
 * 通用关键帧动画。首帧之前保持首帧值，末帧之后保持末帧值；
 * 给出 end 时，在循环末尾（LOOP_END → 1）过渡到 end，用于整卡淡出 / 收回。
 */
function kf(T: number, target: Target, frames: KF[], end?: string | number): string {
  const times = [0]
  const values: Array<string | number> = [frames[0][1]]
  let prev = 0
  for (const [sec, v] of frames) {
    const t = Math.min(Math.max(sec / T, prev), LOOP_END - 0.005)
    times.push(t)
    values.push(v)
    prev = t
  }
  const last = values[values.length - 1]
  if (end !== undefined) {
    times.push(LOOP_END, 1)
    values.push(last, end)
  }
  else {
    times.push(1)
    values.push(last)
  }
  const head = `attr` in target
    ? `<animate attributeName="${target.attr}"`
    : `<animateTransform attributeName="transform" type="${target.transform}"`
  const splines = Array.from({ length: times.length - 1 }).fill(EASE).join(`;`)
  return `${head} values="${values.join(`;`)}" keyTimes="${times.map(f3).join(`;`)}" calcMode="spline" keySplines="${splines}" dur="${dur(T)}" repeatCount="indefinite"/>`
}

/** 淡入，循环末尾淡出 */
function fadeIn(T: number, start: number, d = 0.6): string {
  return kf(T, { attr: `opacity` }, [[start, 0], [start + d, 1]], 0)
}

/** 位移入场 */
function slideIn(T: number, start: number, dx: number, dy: number, d = 0.7): string {
  return kf(T, { transform: `translate` }, [[start, `${dx} ${dy}`], [start + d, `0 0`]])
}

/** 整组淡入 + 位移入场 */
function reveal(start: number, body: Frag | string, dx = 0, dy = 22, d = 0.7): Frag {
  return T => `<g>${fadeIn(T, start, d)}${slideIn(T, start, dx, dy, d)}${typeof body === `string` ? body : body(T)}</g>`
}

/** 以 (cx, cy) 为中心带回弹地放大出现 */
function popIn(cx: number, cy: number, start: number, body: Frag | string): Frag {
  return T => `<g transform="translate(${r1(cx)} ${r1(cy)})"><g>${fadeIn(T, start, 0.2)}`
    + `${kf(T, { transform: `scale` }, [[start, 0], [start + 0.35, 1.2], [start + 0.6, 1]])}`
    + `${typeof body === `string` ? body : body(T)}</g></g>`
}

/** 只在 [start, start + d) 期间显示的离散片段（静态隐藏） */
function flash(T: number, start: number, d: number, body: string): string {
  return `<g opacity="0"><animate attributeName="opacity" values="0;1;0" keyTimes="0;${f3(start / T)};${f3((start + d) / T)}" calcMode="discrete" dur="${dur(T)}" repeatCount="indefinite"/>${body}</g>`
}

/** 从 start 起一直显示的离散片段（静态可见） */
function showFrom(T: number, start: number, body: string): string {
  return `<g><animate attributeName="opacity" values="0;1" keyTimes="0;${f3(start / T)}" calcMode="discrete" dur="${dur(T)}" repeatCount="indefinite"/>${body}</g>`
}

// ────────────────────────────────────────────────────────────────────────────
// SVG 片段
// ────────────────────────────────────────────────────────────────────────────

interface TextOpts {
  size: number
  fill?: string
  weight?: number | string
  family?: string
  anchor?: `start` | `middle` | `end`
}

function text(x: number, y: number, s: string, o: TextOpts, anim = ``): string {
  const anchor = o.anchor && o.anchor !== `start` ? ` text-anchor="${o.anchor}"` : ``
  const weight = o.weight ? ` font-weight="${o.weight}"` : ``
  return `<text x="${r1(x)}" y="${r1(y)}"${anchor} font-family="${o.family ?? SANS}" font-size="${o.size}"${weight} fill="${o.fill ?? C.text}">${anim}${escapeHtml(s)}</text>`
}

function line(x1: number, y1: number, x2: number, y2: number, stroke = C.line, width = 1.5, anim = ``): string {
  return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${width}">${anim}</line>`
}

/** 横线从左往右画出 */
function hRule(y: number, start: number, x1 = PAD, x2 = RIGHT): Frag {
  return T => line(x1, y, x2, y, C.line, 1.5, kf(T, { attr: `x2` }, [[start, r1(x1)], [start + 0.8, r1(x2)]], r1(x1)))
}

/** 竖线从上往下画出 */
function vRule(x: number, y1: number, y2: number, start: number): Frag {
  return T => line(x, y1, x, y2, C.line, 1.5, kf(T, { attr: `y2` }, [[start, r1(y1)], [start + 0.9, r1(y2)]], r1(y1)))
}

/** 一笔描出的路径（stroke-dashoffset 从 len 走到 0） */
function drawPath(d: string, color: string, width: number, len: number, start: number): Frag {
  return T => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len}">`
    + `${kf(T, { attr: `stroke-dashoffset` }, [[start, len], [start + 0.45, 0]])}</path>`
}

/** 向外扩散的波纹（静态隐藏，独立循环） */
function ripple(cx: number, cy: number, r: number, color: string, delay: number, spread = 16): string {
  return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="none" stroke="${color}" stroke-width="2" opacity="0">`
    + `<animate attributeName="r" values="${r};${r + spread}" dur="2.4s" begin="${delay.toFixed(1)}s" repeatCount="indefinite"/>`
    + `<animate attributeName="opacity" values="0.6;0" dur="2.4s" begin="${delay.toFixed(1)}s" repeatCount="indefinite"/>`
    + `</circle>`
}

// ────────────────────────────────────────────────────────────────────────────
// 数字滚动：在几个离散时刻依次显示中间值，最后定格在原值
// ────────────────────────────────────────────────────────────────────────────

interface ParsedNum { prefix: string, num: number, suffix: string, decimals: number, comma: boolean }

function parseNum(s: string): ParsedNum | null {
  const m = s.match(/^([^\d-]*)(-?\d+(?:,\d{3})*(?:\.\d+)?)([^\d,]*)$/)
  if (!m)
    return null
  const num = Number(m[2].replace(/,/g, ``))
  if (!Number.isFinite(num) || num === 0)
    return null
  return { prefix: m[1], num, suffix: m[3], decimals: (m[2].split(`.`)[1] ?? ``).length, comma: m[2].includes(`,`) }
}

function formatNum(p: ParsedNum, n: number): string {
  const s = p.comma
    ? n.toLocaleString(`en-US`, { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : n.toFixed(p.decimals)
  return `${p.prefix}${s}${p.suffix}`
}

const COUNT_STEPS = [0.1, 0.28, 0.48, 0.66, 0.8, 0.91, 0.97]

function countUp(x: number, y: number, value: string, o: TextOpts, start: number, d = 1.1): Frag {
  const p = parseNum(value)
  if (!p)
    return () => text(x, y, value, o)
  return (T) => {
    const step = d / (COUNT_STEPS.length + 1)
    const rolling = COUNT_STEPS
      .map((f, k) => flash(T, start + k * step, step, text(x, y, formatNum(p, p.num * f), o)))
      .join(``)
    return rolling + showFrom(T, start + COUNT_STEPS.length * step, text(x, y, value, o))
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 图标（以原点为中心绘制，start 为描画开始时刻）
// ────────────────────────────────────────────────────────────────────────────

type Icon = (color: string, start: number) => Frag

function ring(color: string): string {
  return `<circle cx="0" cy="0" r="14" fill="none" stroke="${color}" stroke-width="2.5"/>`
}

const iconCheck: Icon = (c, s) => T => ring(c) + drawPath(`M-6.5 0 L-2 4.5 L6.5 -4.5`, c, 2.5, 20, s)(T)

const iconCheckFilled: Icon = (c, s) => T => `<circle cx="0" cy="0" r="15" fill="${c}"/>${drawPath(`M-7 0 L-2 5 L7 -5`, `#fff`, 3, 22, s)(T)}`

const iconHalf: Icon = (c, s) => T => `${ring(c)}<path d="M0 -14 A14 14 0 0 0 0 14 Z" fill="${c}">${fadeIn(T, s, 0.4)}</path>`

const iconCross: Icon = (c, s) => T => ring(c) + drawPath(`M-5 -5 L5 5 M5 -5 L-5 5`, c, 2.5, 15, s)(T)

const iconDot: Icon = (c, s) => T => `${ring(c)}<circle cx="0" cy="0" r="5" fill="${c}">${kf(T, { attr: `r` }, [[s, 0], [s + 0.3, 7], [s + 0.5, 5]])}</circle>`

// ────────────────────────────────────────────────────────────────────────────
// 卡片骨架
// ────────────────────────────────────────────────────────────────────────────

class Card {
  frags: Frag[] = []
  y = 0
  /** 下一个入场动画的开始时间（秒）；标题与分隔线先画 */
  t = 0.8
  lastStart = 0

  push(frag: Frag | string) {
    this.frags.push(typeof frag === `string` ? () => frag : frag)
  }

  /** 插到指定位置（用于需要垫在内容下面、但尺寸要等内容排完才知道的元素） */
  insert(index: number, frag: Frag) {
    this.frags.splice(index, 0, frag)
  }

  /** 预约一个入场时刻并推进时间轴 */
  next(step = 0.9): number {
    const start = this.t
    this.touch(start)
    this.t += step
    return start
  }

  /** 登记一个更晚的动画时刻，让循环时长覆盖它 */
  touch(sec: number) {
    this.lastStart = Math.max(this.lastStart, sec)
  }

  header(title: string) {
    const lines = wrap(title, 50, W - PAD * 2)
    let y = 64
    for (const l of lines) {
      y += 54
      this.push(text(W / 2, y, l, { size: 50, weight: 700, family: SERIF, fill: C.ink, anchor: `middle` }))
    }
    // 标题下的砖红短线：从中间向两边展开
    const uy = y + 22
    this.push(T => `<rect x="${r1(W / 2 - 32)}" y="${uy}" width="64" height="4" rx="2" fill="${C.accent}">`
      + `${kf(T, { attr: `width` }, [[0.3, 0], [0.9, 64]], 0)}`
      + `${kf(T, { attr: `x` }, [[0.3, r1(W / 2)], [0.9, r1(W / 2 - 32)]], r1(W / 2))}</rect>`)
    this.y = uy + 34
    // 分隔线同样从中间展开
    const hy = this.y
    this.push(T => line(PAD, hy, RIGHT, hy, C.line, 1.5, kf(T, { attr: `x1` }, [[0.15, r1(W / 2)], [1, PAD]], r1(W / 2))
    + kf(T, { attr: `x2` }, [[0.15, r1(W / 2)], [1, RIGHT]], r1(W / 2))))
  }

  footer(summary: string) {
    if (!summary)
      return
    const top = this.y
    const lines = wrap(summary, 28, W - PAD * 2)
    const start = this.next(0.6)
    this.push(hRule(top, start - 0.3))
    // 荧光笔：逐行从左往右划过
    lines.forEach((l, k) => {
      const w = measure(l, 28) + 8
      const by = top + 62 + k * 44 - 12
      const s = start + 0.4 + k * 0.35
      this.touch(s)
      this.push(T => `<rect x="${PAD - 4}" y="${r1(by)}" width="${r1(w)}" height="14" fill="${C.accent}" fill-opacity="0.18">`
        + `${kf(T, { attr: `width` }, [[s, 0], [s + 0.6, r1(w)]], 0)}</rect>`)
    })
    const body = lines.map((l, i) => text(PAD, top + 62 + i * 44, l, { size: 28, weight: 700, fill: C.ink })).join(``)
    this.push(reveal(start, body, 0, 12))
    this.y = top + 62 + (lines.length - 1) * 44 + 40
  }

  /** 红色左边线的提示框：框先出现，红线往下长，文字逐行浮现；返回占用高度 */
  note(x: number, top: number, width: number, s: string, start: number): number {
    const lines = wrap(s, 22, width - 44)
    const h = lines.length * 34 + 26
    this.touch(start + 0.35 + lines.length * 0.15)
    this.push(reveal(start, T => `<rect x="${r1(x)}" y="${r1(top)}" width="${r1(width)}" height="${h}" rx="8" fill="${C.noteBg}" stroke="${C.noteBorder}" stroke-width="1.5"/>`
      + `<rect x="${r1(x)}" y="${r1(top + 10)}" width="4" height="${h - 20}" fill="${C.accent}">${kf(T, { attr: `height` }, [[start + 0.15, 0], [start + 0.65, h - 20]])}</rect>${
        lines.map((l, i) => `<g>${fadeIn(T, start + 0.35 + i * 0.15, 0.4)}${text(x + 24, top + 38 + i * 34, l, { size: 22, fill: C.text })}</g>`).join(``)}`, 0, 10))
    return h
  }

  toSVG(): string {
    const H = Math.ceil(this.y + 16)
    const T = Math.max(8, this.lastStart + 4.5)
    return `<section style="margin:1.6em 0;max-width:100%;overflow:hidden;border-radius:12px;">`
      + `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto">`
      + `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="${C.card}"/>${
        this.frags.map(f => f(T)).join(``)
      }</svg></section>`
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 属性解析
// ────────────────────────────────────────────────────────────────────────────

function parseJSON<T>(raw: string | undefined, fallback: T): T {
  if (!raw)
    return fallback
  try {
    const v = JSON.parse(raw)
    return (v ?? fallback) as T
  }
  catch {
    return fallback
  }
}

function str(v: unknown): string {
  return v === undefined || v === null ? `` : String(v).trim()
}

function emptyCard(name: string): string {
  return `<section style="margin:1em 0;padding:12px 16px;border:1px dashed ${C.accent};color:${C.accent};font-size:14px;">${name}：items 为空或不是合法 JSON</section>`
}

// ────────────────────────────────────────────────────────────────────────────
// StepCard：时间线 / 步骤 / 分类要点
// ────────────────────────────────────────────────────────────────────────────

interface StepItem { tag?: string, title?: string, desc?: string, value?: string, unit?: string, note?: string, level?: number }

export function renderStepCard(props: Record<string, string>): string {
  const items = parseJSON<StepItem[]>(props.items, []).filter(i => i && typeof i === `object`)
  if (!items.length)
    return emptyCard(`StepCard`)

  const card = new Card()
  card.header(str(props.title) || `要点`)

  const RULE_X = 168
  const X = 196

  items.forEach((item, i) => {
    const top = card.y
    const level = Math.min(Math.max(Number(item.level) || 0, 0), 3)
    const contentW = RIGHT - X - (level ? 96 : 0)
    const start = card.next(1.25)
    let y = top + 30

    let headBody = ``
    const head = [str(item.tag), str(item.title)].filter(Boolean).join(` · `)
    for (const l of wrap(head, 29, contentW)) {
      y += 38
      headBody += text(X, y, l, { size: 29, weight: 600, fill: C.ink })
    }
    let descBody = ``
    for (const l of wrap(str(item.desc), 25, contentW)) {
      if (!l)
        continue
      y += 40
      descBody += text(X, y, l, { size: 25, fill: C.text })
    }
    const value = str(item.value)
    const valueY = y + 74
    if (value)
      y = valueY

    let bottom = Math.max(y + 34, top + 172)

    // 大序号：从左滑入，轮到这一行时短暂变红（聚光灯往下扫）
    const numFill: KF[] = [[start, C.ink], [start + 0.3, C.accent], [start + 1.3, C.accent], [start + 1.8, C.ink]]
    card.push(T => `<g>${fadeIn(T, start, 0.5)}${slideIn(T, start, -18, 0, 0.6)}`
      + `${text(64, top + 128, String(i + 1), { size: 116, weight: 700, family: NUM, fill: C.ink }, kf(T, { attr: `fill` }, numFill))}</g>`)
    // 标题、说明分两拍进场
    card.push(reveal(start + 0.15, headBody, 0, 16, 0.6))
    if (descBody)
      card.push(reveal(start + 0.3, descBody, 0, 16, 0.6))
    if (value) {
      const valueSize = 62
      const unit = item.unit
        ? text(X + measure(value, valueSize) + 12, valueY, str(item.unit), { size: 24, fill: C.muted })
        : ``
      card.push(reveal(start + 0.4, T => countUp(X, valueY, value, { size: valueSize, weight: 700, family: NUM, fill: C.accent }, start + 0.5)(T) + unit, 0, 10))
    }

    // 严重程度：旋转的虚线圈 + 呼吸红圈 + 向外扩散的波纹
    if (level) {
      const cx = RIGHT - 40
      const cy = top + 62
      const r = 10 + level * 5
      card.push(reveal(start + 0.2, `<circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="3 5">`
      + `<animateTransform attributeName="transform" type="rotate" values="0 ${cx} ${cy};360 ${cx} ${cy}" dur="16s" repeatCount="indefinite"/></circle>`
      + `${ripple(cx, cy, r, C.accent, i * 0.4, 14)}`
      + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.accent}" stroke-width="3.5">`
      + `<animate attributeName="r" values="${r};${r + 5};${r}" dur="2.4s" begin="${(i * 0.4).toFixed(1)}s" calcMode="spline" keySplines="${EASE};${EASE}" repeatCount="indefinite"/>`
      + `</circle>`, 0, 0))
    }

    const note = str(item.note)
    if (note) {
      const h = card.note(X, bottom - 14, RIGHT - X, note, start + 0.6)
      bottom += h + 12
    }

    // 竖线随进场画出；红点沿竖线往下走
    const y1 = top + 24
    const y2 = bottom - 24
    card.push(vRule(RULE_X, y1, y2, start))
    card.push(reveal(start + 0.6, `<circle cx="${RULE_X}" cy="${r1(y2)}" r="4.5" fill="${C.accent}">`
    + `<animate attributeName="cy" values="${r1(y1)};${r1(y2)}" dur="2.6s" begin="${(i * 0.5).toFixed(1)}s" repeatCount="indefinite"/>`
    + `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="2.6s" begin="${(i * 0.5).toFixed(1)}s" repeatCount="indefinite"/>`
    + `</circle>`, 0, 0))

    card.y = bottom
    if (i < items.length - 1)
      card.push(hRule(card.y, start + 0.8))
  })

  card.footer(str(props.summary))
  return card.toSVG()
}

// ────────────────────────────────────────────────────────────────────────────
// StatCard：关键数字（可选刻度滑块）
// ────────────────────────────────────────────────────────────────────────────

interface StatItem { value?: string | number, unit?: string, label?: string, min?: number, max?: number }

export function renderStatCard(props: Record<string, string>): string {
  const items = parseJSON<StatItem[]>(props.items, []).filter(i => i && typeof i === `object`)
  if (!items.length)
    return emptyCard(`StatCard`)

  const card = new Card()
  card.header(str(props.title) || `关键数字`)

  const cols = items.length === 1 ? 1 : 2
  const GAP = 36
  const cellW = (W - PAD * 2 - GAP * (cols - 1)) / cols

  for (let r = 0; r < items.length; r += cols) {
    const top = card.y
    let rowBottom = top
    let rowStart = 0
    for (let c = 0; c < cols && r + c < items.length; c++) {
      const item = items[r + c]
      const x = PAD + c * (cellW + GAP)
      const start = card.next(0.85)
      if (c === 0)
        rowStart = start
      const value = str(item.value)
      const valueSize = Math.min(cols === 1 ? 96 : 76, Math.floor((cellW - 70) / Math.max(measure(value, 1) * 1.1, 0.1)))
      let y = top + 34 + valueSize
      const valueY = y
      const number = countUp(x, valueY, value, { size: valueSize, weight: 700, family: NUM, fill: C.accent }, start + 0.15)
      let body = item.unit
        ? text(x + measure(value, valueSize) * 1.08 + 10, y, str(item.unit), { size: 24, fill: C.muted })
        : ``

      const max = Number(item.max)
      const num = Number.parseFloat(value.replace(/,/g, ``))
      const hasScale = Number.isFinite(max) && Number.isFinite(num) && max > (Number(item.min) || 0)
      let extra: Frag

      if (hasScale) {
        // 刻度：进度线和三角标记一起滑过头，再回弹到位
        const min = Number(item.min) || 0
        const ratio = Math.min(Math.max((num - min) / (max - min), 0), 1)
        const sy = y + 34
        const sw = cellW - 8
        const mx = x + sw * ratio
        const over = Math.min(mx + 14, x + sw)
        body += line(x, sy, x + sw, sy, C.muted, 1.5)
        for (let k = 0; k <= 8; k++)
          body += line(x + (sw * k) / 8, sy - 5, x + (sw * k) / 8, sy, C.muted, 1.2)
        body += text(x, sy + 26, String(min), { size: 18, fill: C.muted })
        body += text(x + sw, sy + 26, String(max), { size: 18, fill: C.muted, anchor: `end` })
        const s = start + 0.3
        card.touch(s + 1.6)
        extra = T => `${line(x, sy, mx, sy, C.accent, 3, kf(T, { attr: `x2` }, [[s, r1(x)], [s + 1.2, r1(over)], [s + 1.5, r1(mx)]]))
        }<g transform="translate(${r1(mx)} ${r1(sy)})"><g>`
        + `${kf(T, { transform: `translate` }, [[s, `${r1(x - mx)} 0`], [s + 1.2, `${r1(over - mx)} 0`], [s + 1.5, `0 0`]])}`
        + `<path d="M-8 -20 L8 -20 L0 -6 Z" fill="${C.accent}"/>${line(0, -6, 0, 0, C.accent, 2)}</g></g>`
        y = sy + 26
      }
      else {
        // 红色短下划线：长过头再回弹
        const bw = Math.min(90, cellW * 0.4)
        const by = y + 16
        const s = start + 0.3
        extra = T => `<rect x="${r1(x)}" y="${r1(by)}" width="${r1(bw)}" height="4" fill="${C.accent}">`
          + `${kf(T, { attr: `width` }, [[s, 0], [s + 0.7, r1(bw * 1.25)], [s + 1, r1(bw)]])}</rect>`
        y = by + 4
      }

      for (const l of wrap(str(item.label), 23, cellW)) {
        if (!l)
          continue
        y += 36
        body += text(x, y, l, { size: 23, fill: C.text })
      }

      const fixedBody = body
      card.push(reveal(start, T => number(T) + fixedBody + extra(T)))
      rowBottom = Math.max(rowBottom, y + 30)
    }
    card.y = rowBottom
    if (r + cols < items.length)
      card.push(hRule(card.y, rowStart + 0.6))
  }

  card.footer(str(props.summary))
  return card.toSVG()
}

// ────────────────────────────────────────────────────────────────────────────
// StatusCard：状态清单（✓ 已完成 / ◐ 部分 / ✗ 没有）
// ────────────────────────────────────────────────────────────────────────────

interface StatusItem { name?: string, sub?: string, status?: string, value?: string, text?: string, note?: string }

const STATUS_STYLE: Record<string, { color: string, icon: Icon }> = {
  done: { color: C.ink, icon: iconCheck },
  partial: { color: C.gold, icon: iconHalf },
  none: { color: C.accent, icon: iconCross },
  info: { color: C.muted, icon: iconDot },
}

export function renderStatusCard(props: Record<string, string>): string {
  const items = parseJSON<StatusItem[]>(props.items, []).filter(i => i && typeof i === `object`)
  if (!items.length)
    return emptyCard(`StatusCard`)

  const card = new Card()
  card.header(str(props.title) || `进展一览`)

  const NAME_W = 190
  const RULE_X = PAD + NAME_W + 14
  const X = RULE_X + 26
  const ICON_X = X + 16
  const TX = X + 46
  const contentW = RIGHT - TX

  const headers = parseJSON<string[]>(props.headers, [])
  if (headers.length) {
    const hy = card.y + 46
    let head = text(PAD, hy, str(headers[0]), { size: 21, fill: C.muted })
    if (headers[1])
      head += text(X, hy, str(headers[1]), { size: 21, fill: C.muted })
    card.push(reveal(0.5, head, 0, 8, 0.5))
    card.y = hy + 22
    card.push(hRule(card.y, 0.6))
  }

  items.forEach((item, i) => {
    const top = card.y
    const start = card.next(0.85)
    const bandIndex = card.frags.length
    const st = STATUS_STYLE[str(item.status)] ?? STATUS_STYLE.info
    const name = str(item.name)
    const nameSize = Math.max(26, Math.min(44, Math.floor(NAME_W / Math.max(measure(name, 1), 0.1))))
    let nameBody = text(PAD, top + 60, name, { size: nameSize, weight: 700, family: NUM, fill: C.ink })
    if (item.sub)
      nameBody += text(PAD, top + 92, str(item.sub), { size: 19, fill: C.muted })

    // 有 value 时：数字 + 说明文字；没有 value 时：说明文字本身用状态色加粗
    let y = top + 60
    let x = TX
    let rightBody = ``
    const value = str(item.value)
    if (value) {
      rightBody += text(x, y, value, { size: 32, weight: 700, family: NUM, fill: st.color })
      x += measure(value, 32) * 1.05 + 12
    }
    const label = str(item.text)
    const labelStyle: TextOpts = value
      ? { size: 24, fill: C.text }
      : { size: 24, weight: 700, fill: st.color }
    if (label && measure(label, 24) <= RIGHT - x) {
      rightBody += text(x, y, label, labelStyle)
    }
    else if (label) {
      wrap(label, 24, contentW).forEach((l, k) => {
        if (value || k > 0)
          y += 36
        rightBody += text(TX, y, l, labelStyle)
      })
    }

    card.push(reveal(start, nameBody, -20, 0, 0.6))
    card.push(reveal(start + 0.2, rightBody, 0, 14, 0.6))
    card.push(popIn(ICON_X, top + 51, start + 0.3, st.icon(st.color, start + 0.6)))

    let bottom = Math.max(y + 34, top + (item.sub ? 116 : 96))
    const note = str(item.note)
    if (note) {
      const h = card.note(X, bottom - 8, RIGHT - X, note, start + 0.6)
      bottom += h + 16
    }

    // 轮到这一行时，淡红高亮带扫过（垫在内容下面，静态隐藏）
    const bandTop = top + 6
    const bandH = bottom - top - 12
    card.insert(bandIndex, T => `<rect x="${PAD - 18}" y="${r1(bandTop)}" width="${W - PAD * 2 + 36}" height="${r1(bandH)}" rx="10" fill="${C.accent}" fill-opacity="0.07" opacity="0">`
      + `${kf(T, { attr: `opacity` }, [[start, 0], [start + 0.3, 1], [start + 1.1, 1], [start + 1.7, 0]])}</rect>`)

    card.push(vRule(RULE_X, top + 18, bottom - 18, start))
    card.y = bottom
    if (i < items.length - 1)
      card.push(hRule(card.y, start + 0.6))
  })

  card.footer(str(props.summary))
  return card.toSVG()
}

// ────────────────────────────────────────────────────────────────────────────
// CompareCard：左右对比
// ────────────────────────────────────────────────────────────────────────────

interface CompareSide { title?: string, verdict?: string, items?: string[], tone?: string }

const TONE_ICON: Record<string, Icon> = {
  good: iconCheckFilled,
  bad: iconCross,
  neutral: iconDot,
}

export function renderCompareCard(props: Record<string, string>): string {
  const left = parseJSON<CompareSide>(props.left, {})
  const right = parseJSON<CompareSide>(props.right, {})
  if (!left.title && !right.title)
    return emptyCard(`CompareCard`)

  const card = new Card()
  card.header(str(props.title) || `对比`)

  const GAP = 40
  const colW = (W - PAD * 2 - GAP) / 2
  const top = card.y
  let bottom = top

  const sides: Array<[CompareSide, number, string, number]> = [
    [left, PAD, left.tone || `neutral`, -36],
    [right, PAD + colW + GAP, right.tone || `good`, 36],
  ]

  for (const [side, x, tone, dx] of sides) {
    const color = tone === `good` ? C.accent : tone === `bad` ? C.ink : C.muted
    const start = card.next(1.2)
    let y = top + 58

    // 结论做成印章：带回弹地盖上
    const verdict = str(side.verdict)
    const pillW = verdict ? measure(verdict, 22) + 28 : 0
    const titleW = colW - 44 - (verdict ? pillW + 12 : 0)
    const titleLines = wrap(str(side.title), 27, titleW)
    const titleBody = titleLines.map((l, k) => text(x + 44, y + k * 38, l, { size: 27, weight: 700, fill: C.ink })).join(``)
    card.push(reveal(start, titleBody, dx, 0))
    card.push(popIn(x + 16, top + 49, start + 0.3, (TONE_ICON[tone] ?? iconDot)(color, start + 0.6)))
    if (verdict) {
      const vs = start + 0.5 + (side.items?.length ?? 0) * 0.3
      card.touch(vs)
      card.push(popIn(x + colW - pillW / 2, top + 49, vs, `<rect x="${r1(-pillW / 2)}" y="-19" width="${r1(pillW)}" height="38" rx="19" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="2"/>${
        text(0, 8, verdict, { size: 22, weight: 700, fill: color, anchor: `middle` })}`))
    }
    y += (titleLines.length - 1) * 38 + 18

    // 要点一条条滑入
    const points = Array.isArray(side.items) ? side.items : []
    points.forEach((it, k) => {
      const lines = wrap(str(it), 22, colW - 18)
      y += 38
      const s = start + 0.4 + k * 0.3
      card.touch(s)
      const itemBody = `<circle cx="${r1(x + 4)}" cy="${r1(y - 8)}" r="3" fill="${color}"/>${
        lines.map((l, j) => text(x + 18, y + j * 34, l, { size: 22, fill: C.text })).join(``)}`
      card.push(reveal(s, itemBody, dx / 2, 0, 0.5))
      y += (lines.length - 1) * 34
    })

    bottom = Math.max(bottom, y + 40)
  }

  // 中线从上往下生长，中间弹出 VS 徽章
  const midX = PAD + colW + GAP / 2
  card.push(vRule(midX, top + 24, bottom - 20, 0.5))
  card.push(popIn(midX, (top + bottom) / 2, 1.2, `<circle cx="0" cy="0" r="18" fill="${C.card}" stroke="${C.line}" stroke-width="1.5"/>${
    text(0, 6, `VS`, { size: 15, weight: 700, family: NUM, fill: C.muted, anchor: `middle` })}`))

  card.y = bottom
  card.footer(str(props.summary))
  return card.toSVG()
}

// ────────────────────────────────────────────────────────────────────────────
// BarCard：数据条形对比
// ────────────────────────────────────────────────────────────────────────────

interface BarItem { label?: string, value?: number | string, text?: string }

export function renderBarCard(props: Record<string, string>): string {
  const items = parseJSON<BarItem[]>(props.items, [])
    .filter(i => i && typeof i === `object`)
    .map(i => ({ ...i, num: Number.parseFloat(String(i.value ?? ``).replace(/,/g, ``)) }))
    .filter(i => Number.isFinite(i.num))
  if (!items.length)
    return emptyCard(`BarCard`)

  const card = new Card()
  card.header(str(props.title) || `数据对比`)

  const unit = str(props.unit)
  const maxNum = Math.max(...items.map(i => Math.abs(i.num)), 1e-9)
  const trackW = RIGHT - PAD

  items.forEach((item, i) => {
    const top = card.y
    const start = card.next(0.7)
    const isMax = Math.abs(item.num) === maxNum
    const color = isMax ? C.accent : C.bar
    const label = `${str(item.text) || str(item.value)}${unit}`
    const labelW = RIGHT - PAD - measure(label, 30) - 24
    let y = top + 30
    let labelBody = ``
    for (const l of wrap(str(item.label), 24, labelW)) {
      y += 36
      labelBody += text(PAD, y, l, { size: 24, fill: C.ink, weight: isMax ? 700 : 400 })
    }
    const valueY = top + 66
    const by = y + 18
    const bw = Math.max(trackW * (Math.abs(item.num) / maxNum), 6)
    const over = Math.min(bw * 1.06, trackW)
    const s = start + 0.2
    card.touch(s + 1.4)

    // 条形长过头再回落；数值跟着滚动；最长那根的末端扩散波纹
    card.push(reveal(start, T => `${labelBody}<rect x="${PAD}" y="${r1(by)}" width="${r1(trackW)}" height="14" rx="7" fill="${C.track}"/>`
      + `<rect x="${PAD}" y="${r1(by)}" width="${r1(bw)}" height="14" rx="7" fill="${color}">`
      + `${kf(T, { attr: `width` }, [[s, 0], [s + 1, r1(over)], [s + 1.3, r1(bw)]])}</rect>`
      + `${countUp(RIGHT, valueY, label, { size: 30, weight: 700, family: NUM, fill: isMax ? C.accent : C.ink, anchor: `end` }, s, 1)(T)}${
        isMax
          ? `<g>${fadeIn(T, s + 1.2, 0.3)}<circle cx="${r1(PAD + bw - 7)}" cy="${r1(by + 7)}" r="7" fill="${C.accent}"/>${ripple(PAD + bw - 7, by + 7, 7, C.accent, i * 0.3, 14)}</g>`
          : ``}`, 0, 12))
    card.y = by + 14 + 24
  })
  card.y += 10

  card.footer(str(props.summary))
  return card.toSVG()
}
