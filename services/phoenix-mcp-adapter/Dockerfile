# syntax=docker/dockerfile:1

FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY services/phoenix-mcp-adapter/package.json services/phoenix-mcp-adapter/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY services/phoenix-mcp-adapter services/phoenix-mcp-adapter
RUN pnpm --filter @evidence-freezer/shared build
RUN pnpm --filter phoenix-mcp-adapter build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8080
CMD ["pnpm", "--filter", "phoenix-mcp-adapter", "start"]
