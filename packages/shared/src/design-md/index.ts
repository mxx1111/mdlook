export interface DesignMdColorTokens {
  primary: string
  primaryActive: string
  canvas: string
  surface: string
  surfaceSoft: string
  surfaceDark: string
  ink: string
  body: string
  muted: string
  hairline: string
  onPrimary: string
  onDark: string
}

export interface DesignMdTypographyTokens {
  displayFont: string
  bodyFont: string
  codeFont: string
  displayWeight: string
  bodySize: string
  bodyLineHeight: string
}

export interface DesignMdShapeTokens {
  radius: string
  radiusLarge: string
  spacing: string
}

export interface DesignMdTokens {
  colors: DesignMdColorTokens
  typography: DesignMdTypographyTokens
  shape: DesignMdShapeTokens
}

export interface DesignMdTheme {
  id: string
  name: string
  description: string
  sourceUrl?: string
  markdown: string
  tokens: DesignMdTokens
  articleCss: string
  appCss: string
  createdAt: number
}

const FALLBACK_TOKENS: DesignMdTokens = {
  colors: {
    primary: `#cc785c`,
    primaryActive: `#a9583e`,
    canvas: `#faf9f5`,
    surface: `#efe9de`,
    surfaceSoft: `#f5f0e8`,
    surfaceDark: `#181715`,
    ink: `#141413`,
    body: `#3d3d3a`,
    muted: `#6c6a64`,
    hairline: `#e6dfd8`,
    onPrimary: `#ffffff`,
    onDark: `#faf9f5`,
  },
  typography: {
    displayFont: `Georgia, "Times New Roman", serif`,
    bodyFont: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
    codeFont: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
    displayWeight: `400`,
    bodySize: `16px`,
    bodyLineHeight: `1.65`,
  },
  shape: {
    radius: `8px`,
    radiusLarge: `12px`,
    spacing: `24px`,
  },
}

const COLOR_ALIASES: Record<keyof DesignMdColorTokens, string[]> = {
  primary: [`primary`, `accent`, `brand`, `coral`, `blue`, `green`, `red`],
  primaryActive: [`primary-active`, `primary active`, `accent-active`, `brand-active`],
  canvas: [`canvas`, `background`, `page`, `bg`],
  surface: [`surface-card`, `surface card`, `card`, `surface`],
  surfaceSoft: [`surface-soft`, `surface soft`, `muted-bg`, `soft`],
  surfaceDark: [`surface-dark`, `surface dark`, `dark`, `black`],
  ink: [`ink`, `foreground`, `text`, `heading`, `black`],
  body: [`body`, `body-strong`, `paragraph`, `copy`],
  muted: [`muted`, `secondary`, `subtle`, `caption`],
  hairline: [`hairline`, `border`, `divider`, `line`],
  onPrimary: [`on-primary`, `on primary`, `primary-foreground`, `white`],
  onDark: [`on-dark`, `on dark`, `dark-foreground`],
}

function escapeCss(value: string): string {
  return value.replace(/[<>{}]/g, ``).trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, `-`)
    .replace(/^-+|-+$/g, ``)
    .slice(0, 48) || `design-theme`
}

function normalizeTokenName(value: string): string {
  return value.toLowerCase().replace(/[_\s]+/g, `-`)
}

function extractNamedColors(markdown: string): Record<string, string> {
  const colors: Record<string, string> = {}
  const pattern = /([a-z][\w -]{1,40})\s*:\s*["']?(#[0-9a-f]{3,8})["']?/gi
  for (const match of markdown.matchAll(pattern)) {
    colors[normalizeTokenName(match[1])] = match[2]
  }

  const bulletPattern = /\*\*([^*]+)\*\*[^#\n]*(#[0-9a-f]{3,8})/gi
  for (const match of markdown.matchAll(bulletPattern)) {
    colors[normalizeTokenName(match[1])] = match[2]
  }

  return colors
}

function pickColor(colors: Record<string, string>, key: keyof DesignMdColorTokens): string {
  for (const alias of COLOR_ALIASES[key]) {
    const normalized = normalizeTokenName(alias)
    if (colors[normalized])
      return colors[normalized]
  }

  const fuzzy = Object.entries(colors).find(([name]) => {
    return COLOR_ALIASES[key].some(alias => name.includes(normalizeTokenName(alias)))
  })
  return fuzzy?.[1] ?? FALLBACK_TOKENS.colors[key]
}

function extractFirstFont(markdown: string, fallback: string): string {
  const familyMatch = markdown.match(/fontFamily:\s*["']([^"']+)["']/i)
  if (familyMatch?.[1])
    return familyMatch[1]

  const quoted = markdown.match(/[“"]([^“”"\n]{1,160})["”]/)
  const quotedFont = quoted?.[1]
  if (quotedFont && /serif|sans-serif|monospace/i.test(quotedFont))
    return quotedFont

  return fallback
}

function extractRadius(markdown: string, key: string, fallback: string): string {
  const pattern = new RegExp(`${key}[^\\n\\r]*?(\\d+(?:\\.\\d+)?px)`, `i`)
  return markdown.match(pattern)?.[1] ?? fallback
}

function hexToHsl(hex: string): string {
  const clean = hex.replace(`#`, ``)
  const full = clean.length === 3
    ? clean.split(``).map(char => char + char).join(``)
    : clean.slice(0, 6)
  const r = Number.parseInt(full.slice(0, 2), 16) / 255
  const g = Number.parseInt(full.slice(2, 4), 16) / 255
  const b = Number.parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function parseDesignMd(markdown: string): DesignMdTokens {
  const colors = extractNamedColors(markdown)
  return {
    colors: {
      primary: pickColor(colors, `primary`),
      primaryActive: pickColor(colors, `primaryActive`),
      canvas: pickColor(colors, `canvas`),
      surface: pickColor(colors, `surface`),
      surfaceSoft: pickColor(colors, `surfaceSoft`),
      surfaceDark: pickColor(colors, `surfaceDark`),
      ink: pickColor(colors, `ink`),
      body: pickColor(colors, `body`),
      muted: pickColor(colors, `muted`),
      hairline: pickColor(colors, `hairline`),
      onPrimary: pickColor(colors, `onPrimary`),
      onDark: pickColor(colors, `onDark`),
    },
    typography: {
      displayFont: escapeCss(extractFirstFont(markdown, FALLBACK_TOKENS.typography.displayFont)),
      bodyFont: escapeCss(markdown.match(/body[\s\S]{0,240}?fontFamily:\s*["']([^"']+)["']/i)?.[1] ?? FALLBACK_TOKENS.typography.bodyFont),
      codeFont: escapeCss(markdown.match(/code[\s\S]{0,240}?fontFamily:\s*["']([^"']+)["']/i)?.[1] ?? FALLBACK_TOKENS.typography.codeFont),
      displayWeight: markdown.match(/display[\s\S]{0,160}?fontWeight:\s*["']?(\d{3})/i)?.[1] ?? FALLBACK_TOKENS.typography.displayWeight,
      bodySize: markdown.match(/body-md[\s\S]{0,160}?fontSize:\s*["']?(\d+(?:\.\d+)?px)/i)?.[1] ?? FALLBACK_TOKENS.typography.bodySize,
      bodyLineHeight: markdown.match(/body-md[\s\S]{0,160}?lineHeight:\s*["']?(\d+(?:\.\d+)?)/i)?.[1] ?? FALLBACK_TOKENS.typography.bodyLineHeight,
    },
    shape: {
      radius: extractRadius(markdown, `md`, FALLBACK_TOKENS.shape.radius),
      radiusLarge: extractRadius(markdown, `lg`, FALLBACK_TOKENS.shape.radiusLarge),
      spacing: extractRadius(markdown, `lg`, FALLBACK_TOKENS.shape.spacing),
    },
  }
}

export function generateArticleCss(tokens: DesignMdTokens): string {
  const { colors, typography, shape } = tokens
  return `
.container {
  color: ${colors.body};
  background: ${colors.canvas};
  font-family: ${typography.bodyFont};
  font-size: ${typography.bodySize};
  line-height: ${typography.bodyLineHeight};
}

p, li {
  color: ${colors.body};
  line-height: ${typography.bodyLineHeight};
}

h1, h2, h3, h4 {
  color: ${colors.ink};
  font-family: ${typography.displayFont};
  font-weight: ${typography.displayWeight};
  line-height: 1.18;
}

h1 {
  font-size: 2em;
}

h2 {
  margin-top: 2em;
  padding-bottom: 0.35em;
  border-bottom: 1px solid ${colors.hairline};
  font-size: 1.55em;
}

h3 {
  font-size: 1.25em;
}

a {
  color: ${colors.primary};
}

blockquote {
  margin: 1.2em 0;
  padding: 1em 1.2em;
  color: ${colors.body};
  background: ${colors.surfaceSoft};
  border-left: 4px solid ${colors.primary};
  border-radius: ${shape.radius};
}

code {
  color: ${colors.primaryActive};
  background: ${colors.surface};
  border-radius: 4px;
  font-family: ${typography.codeFont};
}

pre {
  padding: 1em;
  color: ${colors.onDark};
  background: ${colors.surfaceDark};
  border-radius: ${shape.radiusLarge};
  overflow-x: auto;
}

pre code {
  color: inherit;
  background: transparent;
}

table {
  border-color: ${colors.hairline};
}

th {
  color: ${colors.ink};
  background: ${colors.surface};
}

td, th {
  border-color: ${colors.hairline};
}

hr {
  border-color: ${colors.hairline};
}

strong {
  color: ${colors.ink};
}
`.trim()
}

export function generateAppCss(tokens: DesignMdTokens): string {
  const { colors, typography, shape } = tokens
  return `
:root {
  --background: ${hexToHsl(colors.canvas)};
  --foreground: ${hexToHsl(colors.ink)};
  --card: ${hexToHsl(colors.surface)};
  --card-foreground: ${hexToHsl(colors.ink)};
  --popover: ${hexToHsl(colors.canvas)};
  --popover-foreground: ${hexToHsl(colors.ink)};
  --primary: ${hexToHsl(colors.primary)};
  --primary-foreground: ${hexToHsl(colors.onPrimary)};
  --secondary: ${hexToHsl(colors.surfaceSoft)};
  --secondary-foreground: ${hexToHsl(colors.ink)};
  --muted: ${hexToHsl(colors.surfaceSoft)};
  --muted-foreground: ${hexToHsl(colors.muted)};
  --accent: ${hexToHsl(colors.surface)};
  --accent-foreground: ${hexToHsl(colors.ink)};
  --border: ${hexToHsl(colors.hairline)};
  --input: ${hexToHsl(colors.hairline)};
  --ring: ${hexToHsl(colors.primary)};
  --radius: ${shape.radius};
}

body {
  background: ${colors.canvas};
  color: ${colors.ink};
  font-family: ${typography.bodyFont};
}
`.trim()
}

export function createDesignMdTheme(input: {
  id?: string
  name: string
  description?: string
  sourceUrl?: string
  markdown: string
}): DesignMdTheme {
  const tokens = parseDesignMd(input.markdown)
  const id = input.id ?? `design:${slugify(input.name)}`
  return {
    id,
    name: input.name,
    description: input.description ?? `Imported DESIGN.md theme`,
    sourceUrl: input.sourceUrl,
    markdown: input.markdown,
    tokens,
    articleCss: generateArticleCss(tokens),
    appCss: generateAppCss(tokens),
    createdAt: Date.now(),
  }
}
