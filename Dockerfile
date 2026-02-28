# ─── Stage 1: Build Frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Build Backend ───────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Install all deps (including devDeps for TypeScript compiler)
COPY backend/package*.json ./
RUN npm install

# Copy source and compile
COPY backend/ ./
RUN npm run build

# ─── Stage 3: Install production-only backend deps ────────────────────────────
FROM node:20-alpine AS backend-deps

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

# ─── Stage 4: Production Image ────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install curl for health check
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

WORKDIR /app

# Copy compiled backend
COPY --from=backend-builder --chown=appuser:appuser /app/backend/dist ./backend/dist

# Copy production backend dependencies
COPY --from=backend-deps --chown=appuser:appuser /app/backend/node_modules ./backend/node_modules

# Copy frontend build
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/dist ./frontend/dist

# Create data directories with correct permissions
RUN mkdir -p /app/data/users /app/data/sessions && \
    chown -R appuser:appuser /app/data

# Copy reference values (fallback if not mounted via volume)
COPY --chown=appuser:appuser data/reference_values.json /app/data/reference_values.json

WORKDIR /app/backend

USER appuser

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
