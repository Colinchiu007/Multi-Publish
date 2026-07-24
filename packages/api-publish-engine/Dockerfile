# syntax = docker/dockerfile:1.4
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/api-publish-engine/package.json ./packages/api-publish-engine/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @multi-publish/api-publish-engine --include-workspace-root=false --ignore-scripts

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 publishapi && \
    adduser --system --uid 1001 publishapi
COPY --from=deps --chown=publishapi:publishapi /app/node_modules ./node_modules
COPY --chown=publishapi:publishapi packages/api-publish-engine/src ./packages/api-publish-engine/src
COPY --chown=publishapi:publishapi packages/api-publish-engine/upload ./packages/api-publish-engine/upload
COPY --chown=publishapi:publishapi packages/api-publish-engine/bin ./packages/api-publish-engine/bin
COPY --chown=publishapi:publishapi packages/api-publish-engine/scripts ./packages/api-publish-engine/scripts
COPY --chown=publishapi:publishapi packages/api-publish-engine/package.json ./packages/api-publish-engine/package.json
COPY --chown=publishapi:publishapi migrations/postgresql ./migrations/postgresql
WORKDIR /app/packages/api-publish-engine
USER publishapi
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV DRY_RUN=false
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/api/v1/ready || exit 1
ENTRYPOINT ["node", "bin/publish-api"]
