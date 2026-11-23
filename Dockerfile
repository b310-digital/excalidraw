FROM --platform=${BUILDPLATFORM} node:24.22.2@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413 AS build

WORKDIR /node/app


FROM build as production_buildstage

COPY package.json yarn.lock ./
COPY excalidraw-app/package.json ./excalidraw-app/
COPY packages/excalidraw/package.json ./packages/excalidraw/
COPY packages/common/package.json ./packages/common/
COPY packages/element/package.json ./packages/element/
COPY packages/math/package.json ./packages/math/
COPY packages/fractional-indexing/package.json ./packages/fractional-indexing/
COPY packages/laser-pointer/package.json ./packages/laser-pointer/

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN --mount=type=cache,target=/root/.cache/yarn \
    npm_config_target_arch=${TARGETARCH} yarn --frozen-lockfile --network-timeout 600000

COPY . .


ARG NODE_ENV=production
ARG VITE_APP_STORAGE_PORT=5011
ARG VITE_APP_ROOM_PORT=5012

RUN npm_config_target_arch=${TARGETARCH} yarn build:app:docker

FROM --platform=${TARGETPLATFORM} nginx/nginx-unprivileged:1.30.7-alpine-slim@sha256:8432c57ac86f178741af2b89948bd9087cb9df1c415bc1ab4d23735c4f0e3e61 as production

COPY --from=production_buildstage /node/app/excalidraw-app/build /usr/share/nginx/html

HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:8080 || exit 1

FROM build as development
