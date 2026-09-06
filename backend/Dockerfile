# FMS backend — production image
FROM node:24-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

# Runs migrations, then starts the server.
# node-pg-migrate needs DATABASE_URL from the environment (provided by compose).
CMD ["sh", "-c", "npx node-pg-migrate up -m db/migrations && node server.js"]
