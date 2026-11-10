# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @radian/api --workspace @radian/contracts --include-workspace-root=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @radian/contracts && npm run build -w @radian/api \
 && cp -r apps/api/migrations apps/api/dist/migrations \
 && (cp -r apps/api/seed apps/api/dist/seed 2>/dev/null || true)

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @radian/api --workspace @radian/contracts --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1
CMD ["sh", "-c", "node dist/src/scripts/migrate.js && exec node dist/src/main.js"]
