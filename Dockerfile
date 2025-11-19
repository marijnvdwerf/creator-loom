# Base stage - Set up workspace with dependencies
FROM oven/bun:1.3.2 AS base
WORKDIR /usr/src/app
COPY tsconfig.json ./
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build stage - Compile application with Nitro
FROM base AS build
COPY . .
RUN bun run build

# Final production stage - Minimal Alpine image
FROM oven/bun:1.3.2-alpine AS final
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/.output ./.output
EXPOSE 3000
ENTRYPOINT [ "bun", ".output/server/index.mjs" ]
