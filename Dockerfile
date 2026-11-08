# Mountain Hut – Docker image (D2, sprint 2). Builds the whole app from this repository:
# every feature merged into dev is in the next build, the Dockerfile only changes for new
# runtime needs (a new system package, environment variable or startup file).
#
#   docker compose up --build        (see docker-compose.yml and the README, "Docker")
#
# Stage 1 builds the client; stage 2 installs the server's production dependencies (sqlite3 is a
# native module: built here, on the same Debian base the image runs on); stage 3 is the small runtime.
# Express serving client/dist is the production build of D1: the built client is already in the image.

# ---- 1. client build ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace client --include-workspace-root=false
COPY client/ client/
RUN npm run build --workspace client

# ---- 2. server production dependencies --------------------------------------------------------
# sqlite3 is a native module: when npm finds no prebuilt binary it compiles it, which needs Python,
# make and a C++ compiler. They stay in this stage only: the runtime image gets the compiled
# node_modules, not the compilers.
FROM node:22-bookworm-slim AS server-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev

# ---- 3. runtime ---------------------------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3001 \
    TZ=Europe/Rome \
    DATA_DIR=/data
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./
COPY server/package.json server/
COPY server/src/ server/src/
COPY docker/smoke-test.js docker/smoke-test.js
COPY --from=client-build /app/client/dist client/dist
COPY docker/entrypoint.sh /usr/local/bin/mountain-hut-entrypoint
RUN chmod +x /usr/local/bin/mountain-hut-entrypoint \
 && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/auth/me') \
    .then((r) => process.exit(r.status === 401 || r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["mountain-hut-entrypoint"]
CMD ["node", "server/src/index.js"]
