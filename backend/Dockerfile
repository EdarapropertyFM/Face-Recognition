# NestJS API (STMC): residents, enrollments, cameras, alerts.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl

COPY package*.json ./
# Only runtime dependencies; the compiled output is copied from the build stage.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Encrypted biometric assets written by SecureStorageService.
RUN mkdir -p /app/storage
VOLUME ["/app/storage"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api -o /dev/null || exit 1

CMD ["node", "dist/main"]
