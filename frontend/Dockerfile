# syntax=docker/dockerfile:1
# Raak web image (Next.js standalone output, docs 15). The client bundle is
# built without NEXT_PUBLIC_API_BASE_URL so it calls same-origin /v1 (ADR-0008);
# the edge routes /v1/* on tenant and platform hosts to the API container.
# Server-only runtime vars (API_INTERNAL_BASE_URL, BASE_DOMAIN, PLATFORM_HOST)
# are injected by the deploy stack, not baked into the image.

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
CMD ["node", "server.js"]
