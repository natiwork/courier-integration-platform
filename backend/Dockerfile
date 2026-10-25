# Backend image. Two stages: the first compiles TypeScript with all dev tools, the second keeps only what runs
# in production (compiled JavaScript, production dependencies, SQL migrations).

FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24.22.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
# The official image has an unprivileged "node" user: the server never runs as root.
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD ["node", "-e", "fetch('http://localhost:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["./docker-entrypoint.sh"]
