# ═══════════════════════════════════════════════════════════════
# Stage 1 — Instalar dependencias y compilar
# ═══════════════════════════════════════════════════════════════
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package.json del monorepo y workspaces
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Instalar TODAS las dependencias (incluyendo devDependencies para build)
RUN npm ci

# Copiar el código fuente
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/

# Build del backend (NestJS → dist/)
RUN npm run build -w api

# Build del frontend (Vite → dist/)
RUN npm run build -w web

# ═══════════════════════════════════════════════════════════════
# Stage 2 — Imagen de producción (solo lo necesario)
# ═══════════════════════════════════════════════════════════════
FROM node:22-alpine AS production

WORKDIR /app

# Copiar package.json para instalar solo production deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/

# Instalar solo dependencias de producción
RUN npm ci --workspace=api --omit=dev && npm cache clean --force

# Copiar el backend compilado
COPY --from=builder /app/apps/api/dist apps/api/dist

# Copiar el frontend compilado (servido por Nginx en otro stage, o por NestJS)
COPY --from=builder /app/apps/web/dist apps/web/dist

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

# Ejecutar el backend
CMD ["node", "apps/api/dist/main.js"]
