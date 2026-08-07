import type { Env } from './types'
import process from 'node:process'
import { serve } from '@hono/node-server'
import app from './index'

const port = Number(process.env.PORT ?? 8787)

const env = {
  APP_URL: process.env.APP_URL ?? `http://localhost:5173,http://127.0.0.1:5173`,
  UPLOAD_ENABLED: process.env.UPLOAD_ENABLED ?? `false`,
  UPLOAD_BACKEND: process.env.UPLOAD_BACKEND,
  UPLOAD_GITHUB_USERNAME: process.env.UPLOAD_GITHUB_USERNAME,
  UPLOAD_GITHUB_REPO_LIST: process.env.UPLOAD_GITHUB_REPO_LIST,
  UPLOAD_GITHUB_BRANCH: process.env.UPLOAD_GITHUB_BRANCH,
  UPLOAD_GITHUB_USE_CDN: process.env.UPLOAD_GITHUB_USE_CDN,
  UPLOAD_GITHUB_TOKENS: process.env.UPLOAD_GITHUB_TOKENS,
  UPLOAD_LOCAL_DIR: process.env.UPLOAD_LOCAL_DIR,
  UPLOAD_LOCAL_PUBLIC_URL: process.env.UPLOAD_LOCAL_PUBLIC_URL,
  WECHAT_MP_IMAGE_ENABLED: process.env.WECHAT_MP_IMAGE_ENABLED,
  WECHAT_MP_APP_ID: process.env.WECHAT_MP_APP_ID,
  WECHAT_MP_APP_SECRET: process.env.WECHAT_MP_APP_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? ``,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? ``,
  JWT_SECRET: process.env.JWT_SECRET ?? `mdlook-docker-theme-service`,
  AFDIAN_USER_ID: process.env.AFDIAN_USER_ID,
  AFDIAN_API_TOKEN: process.env.AFDIAN_API_TOKEN,
  AFDIAN_API_BASE: process.env.AFDIAN_API_BASE,
  AFDIAN_PRO_PLAN_IDS: process.env.AFDIAN_PRO_PLAN_IDS,
  AFDIAN_WEBHOOK_TOKEN: process.env.AFDIAN_WEBHOOK_TOKEN,
  ASSETS: {
    fetch: () => new Response(`not found`, { status: 404 }),
  },
} as unknown as Env

serve({
  port,
  fetch: request => app.fetch(request, env),
})

console.log(`md-api listening on http://0.0.0.0:${port}`)
