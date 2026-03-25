# -- build stage --
FROM oven/bun:1 AS build
WORKDIR /srv

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY build.ts tsconfig.json bunfig.toml ./
RUN bun run build

# Re-install without devDependencies for a lean node_modules
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# -- runtime stage --
FROM oven/bun:1-slim
WORKDIR /srv

COPY --from=build /srv/node_modules node_modules
COPY --from=build /srv/dist dist
COPY --from=build /srv/src src
COPY --from=build /srv/package.json .
COPY --from=build /srv/tsconfig.json .
COPY --from=build /srv/bunfig.toml .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "start"]
