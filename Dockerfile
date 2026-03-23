FROM oven/bun:1 AS base
WORKDIR /app

# 1. Install dependencies (cached layer when lock unchanged)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2. Copy source and config files
COPY src/ src/
COPY build.ts tsconfig.json bunfig.toml ./

# 3. Build frontend assets into dist/
RUN bun run build.ts

# 4. Runtime
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/index.ts"]
