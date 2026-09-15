# Dockerfile for NetWatch — Cloud-Based Network Alert Notification System
FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 needs a C++ toolchain to compile its native binding
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
