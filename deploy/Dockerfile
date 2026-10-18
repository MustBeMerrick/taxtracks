# Stage 1: install exact deps from the lockfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: build Next.js (standalone output). The build never opens the
# database: it is opened lazily on the first request (src/lib/data.ts).
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: minimal runtime image — standalone bundle only
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id; server.js would bind to that and be unreachable
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# tzdata gives Node the named zone below (container clocks default to UTC,
# which would date paychecks and backups a day early in the evening)
RUN apk add --no-cache tzdata
ENV TZ=America/Los_Angeles
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
