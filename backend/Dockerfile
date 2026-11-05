# syntax=docker/dockerfile:1
# Raak backend image: one esbuild bundle serves both processes (ADR-0019).
# The deploy command selects the role:
#   api:    node dist/index.js
#   worker: node dist/worker.js
#   migrate (one-shot): node node_modules/prisma/build/index.js migrate deploy
# Runtime env vars are injected by the deploy stack (deploy/docker-compose
# .prod.yml / Coolify managed secrets); no .env file is baked into the image.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Installs full dependencies (prisma CLI stays in dependencies for migrate
# deploy) and runs `prisma generate` via postinstall against the copied schema.
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
CMD ["node", "dist/index.js"]
