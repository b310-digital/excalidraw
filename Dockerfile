FROM --platform=${BUILDPLATFORM} node:24@sha256:8530f76a96d88820d288761f022e318970dda93d01536919fbc16076b7983e63 AS build

WORKDIR /opt/node_app


FROM build as production_buildstage

COPY package.json yarn.lock ./
COPY excalidraw-app/package.json ./excalidraw-app/
COPY packages/excalidraw/package.json ./packages/excalidraw/
COPY packages/common/package.json ./packages/common/
COPY packages/element/package.json ./packages/element/
COPY packages/math/package.json ./packages/math/

# do not ignore optional dependencies:
# Error: Cannot find module @rollup/rollup-linux-x64-gnu
RUN --mount=type=cache,target=/root/.cache/yarn \
    npm_config_target_arch=${TARGETARCH} yarn --frozen-lockfile --network-timeout 600000

COPY . .


ARG NODE_ENV=production
ARG VITE_APP_STORAGE_PORT=5011
ARG VITE_APP_ROOM_PORT=5012

RUN npm_config_target_arch=${TARGETARCH} yarn build:app:docker

FROM --platform=${TARGETPLATFORM} nginxinc/nginx-unprivileged:1.30.2-alpine-slim@sha256:59a7114c40708c891cc71f0338d116d9410d7c2a72d8d2e61ce4148219a20b10 as production

COPY --from=production_buildstage /opt/node_app/excalidraw-app/build /usr/share/nginx/html

HEALTHCHECK CMD wget -q -O /dev/null http://localhost || exit 1

FROM build as development
