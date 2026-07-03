# PublishApiServer ? ???????
# ??: docker build -t publish-api-server -f packages/api-publish-engine/Dockerfile .
# ??: docker run -p 3000:3000 -e API_KEY=xxx publish-api-server

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini ca-certificates
COPY --from=build /app/node_modules ./node_modules
COPY packages/api-publish-engine ./packages/api-publish-engine
COPY config ./config

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/api-publish-engine/bin/publish-api", "--port", "3000"]
