# build stage
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# runtime
FROM node:18-slim
# deps for chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libx11-6 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libxss1 \
    libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 libdbus-1-3 \
    libnspr4 libnss3 libxfixes3 libxrender1 libgbm1 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/package*.json ./ 
COPY --from=builder /app/dist ./dist
RUN npm ci --production

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000
CMD ["node", "dist/main.js"]