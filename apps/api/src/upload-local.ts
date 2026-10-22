import type { Context } from 'hono'
import type { Env } from './types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildDatedObjectKey } from './upload-filename'

type LocalUploadContext = Context<{ Bindings: Env }>

const DEFAULT_UPLOAD_DIR = `/data/uploads`
const DEFAULT_PUBLIC_URL = `/uploads`

function getDir(): string {
  const date = new Date()
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, `0`)
  const day = String(date.getUTCDate()).padStart(2, `0`)
  return `${year}/${month}/${day}`
}

function uploadRoot(env: Env): string {
  return env.UPLOAD_LOCAL_DIR?.trim() || DEFAULT_UPLOAD_DIR
}

function publicUrlPrefix(env: Env, origin: string): string {
  const configured = env.UPLOAD_LOCAL_PUBLIC_URL?.trim() || DEFAULT_PUBLIC_URL
  if (/^https?:\/\//i.test(configured))
    return configured.replace(/\/$/, ``)
  return `${origin}${configured.startsWith(`/`) ? configured : `/${configured}`}`.replace(/\/$/, ``)
}

function contentTypeFromName(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case `.jpg`:
    case `.jpeg`:
      return `image/jpeg`
    case `.png`:
      return `image/png`
    case `.gif`:
      return `image/gif`
    case `.webp`:
      return `image/webp`
    case `.svg`:
      return `image/svg+xml`
    case `.avif`:
      return `image/avif`
    default:
      return `application/octet-stream`
  }
}

export async function uploadToLocal(env: Env, file: File, origin: string): Promise<string> {
  const dir = getDir()
  const filename = buildDatedObjectKey(file.name, file.type)
  const key = `${dir}/${filename}`
  const root = uploadRoot(env)
  const outputDir = path.join(root, dir)
  const outputPath = path.join(root, key)

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(outputPath, Buffer.from(await file.arrayBuffer()))

  return `${publicUrlPrefix(env, origin)}/${key}`
}

export async function localUploadFileHandler(c: LocalUploadContext): Promise<Response> {
  if (c.env.UPLOAD_BACKEND !== `local`)
    return c.notFound()

  const key = decodeURIComponent(c.req.path.replace(/^\/uploads\/?/, ``))
  if (!key || key.includes(`..`) || path.isAbsolute(key))
    return c.notFound()

  const root = path.resolve(uploadRoot(c.env))
  const filePath = path.resolve(root, key)
  if (!filePath.startsWith(`${root}${path.sep}`))
    return c.notFound()

  try {
    const file = await fs.readFile(filePath)
    return new Response(file, {
      headers: {
        'content-type': contentTypeFromName(filePath),
        'cache-control': `public, max-age=31536000, immutable`,
      },
    })
  }
  catch {
    return c.notFound()
  }
}
