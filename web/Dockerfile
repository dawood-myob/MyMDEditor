# syntax=docker/dockerfile:1.7
# MDHub - multi-stage build. Build context is the `web` directory.

# ---------- 1. Client (React + Vite) ----------
FROM node:24-bookworm-slim AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- 2. Server (TypeScript -> dist) ----------
FROM node:24-bookworm-slim AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build
# Keep only production dependencies for the runtime image
RUN npm prune --omit=dev --no-audit --no-fund

# ---------- 3. Runtime ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
	PORT=8080 \
	DATA_DIR=/data \
	CLIENT_DIR=/app/client \
	CHROMIUM_PATH=/usr/bin/chromium

# Chromium is used only for PDF export (headless). Fonts give decent PDF output.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=server-build /build/server/package.json ./package.json
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
COPY --from=client-build /build/client/dist ./client

# Non-root user owning the persistent data volume
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
