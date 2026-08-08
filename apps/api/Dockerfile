FROM node:22.22.0-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @md/api...

COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @md/api build:node

FROM node:22.22.0-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY --from=builder /app/apps/api/dist/node-server.mjs ./node-server.mjs

EXPOSE 8787
CMD ["node", "node-server.mjs"]
