FROM node:22-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY services/arize-phoenix-mcp/package.json services/arize-phoenix-mcp/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY services/arize-phoenix-mcp services/arize-phoenix-mcp
RUN pnpm --filter arize-phoenix-mcp build

FROM deps AS runner
ENV NODE_ENV=production
COPY packages/shared packages/shared
COPY services/arize-phoenix-mcp services/arize-phoenix-mcp
EXPOSE 8080
CMD ["pnpm", "--filter", "arize-phoenix-mcp", "start"]
