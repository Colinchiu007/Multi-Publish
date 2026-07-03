# syntax = docker/dockerfile:1.4
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production --ignore-scripts

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 publishapi && \
    adduser --system --uid 1001 publishapi
COPY --from=deps --chown=publishapi:publishapi /app/node_modules ./node_modules
COPY --chown=publishapi:publishapi ./src ./src
COPY --chown=publishapi:publishapi ./bin ./bin
COPY --chown=publishapi:publishapi package.json .
USER publishapi
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV DRY_RUN=false
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/v1/health || exit 1
ENTRYPOINT ["node", "bin/publish-api"]
