# ---- Base ----
# Slim image: Node.js + Python + yt-dlp only. No Chromium, no ffmpeg.
FROM node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip curl ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Disable Puppeteer's Chromium download (browser extractor will be unavailable)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# ---- Production ----
FROM base AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p tmp logs

ENV NODE_ENV=production
EXPOSE 3000

USER node
CMD ["node", "src/server.js"]
