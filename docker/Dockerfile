# Build stage — install all deps and build admin UI
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY admin/package.json admin/package-lock.json admin/
RUN npm ci
RUN cd admin && npm ci

COPY . .
RUN npm run build --prefix admin

# Production stage — only runtime deps
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY brain/ brain/
COPY homeserver/ homeserver/
COPY --from=builder /app/admin/dist admin/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "brain/index.js"]
