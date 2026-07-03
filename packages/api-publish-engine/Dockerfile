# PublishApiServer — Docker 镜像
# 构建: docker build -t publish-api-server .
# 运行: docker run -p 3000:3000 -e API_KEY=sk-xxx publish-api-server

FROM node:22-alpine
LABEL maintainer="Multi-Publish" description="PublishApiServer — 多平台一键发布 HTTP API"

WORKDIR /app

# 依赖缓存层
COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts 2>/dev/null || true

# 源码
COPY src/ src/
COPY bin/ bin/
COPY upload/ upload/

EXPOSE 3000

ENV PORT=3000
ENV DRY_RUN=false

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/v1/health',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)})"

CMD ["node", "bin/publish-api"]