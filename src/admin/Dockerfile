# SnapAccount Admin Panel — Multi-stage Dockerfile
# React 19 built with Node, served by nginx

# ─────────────────────────────────────────────
# Stage 1: dependency install (cache friendly)
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package manifests only first for layer caching
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  else npm ci --prefer-offline; \
  fi

# ─────────────────────────────────────────────
# Stage 2: build
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args become env vars at build time (not embedded secrets — only public config)
ARG VITE_API_BASE_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}

RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: serve (nginx)
# ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Security: remove default nginx user and add non-root
RUN addgroup -g 10001 -S appgroup \
 && adduser  -u 10001 -S appuser -G appgroup

# Copy nginx config
COPY --chown=appuser:appgroup nginx.conf /etc/nginx/nginx.conf

# Copy built assets
COPY --from=builder --chown=appuser:appgroup /app/dist /usr/share/nginx/html

# nginx needs to write temp files to these dirs
RUN mkdir -p /var/cache/nginx /var/run /var/log/nginx \
 && chown -R appuser:appgroup /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html

USER appuser

# Cloud Run listens on PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
