# 單容器部署：builder 打包前端 → runtime 只帶 dist + server + src（引擎共用）。
# 遊戲伺服器零外部依賴 → runtime 不需要 node_modules。
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DB_DRIVER=sqlite \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist \
    CORS_ORIGIN=off
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY src ./src
COPY package.json ./
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
