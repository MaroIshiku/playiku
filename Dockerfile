ARG APP_VERSION=0.9.0
ARG BUILD_DATE=development
ARG GIT_SHA=development

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
RUN mkdir /data-seed

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:adcd20c7b4c988b73cbfbddb26d2eee574571e6d7c9ffea29b3821e0690efb77 AS runtime
ARG APP_VERSION
ARG BUILD_DATE
ARG GIT_SHA
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATABASE_PATH=/data/app.sqlite COOKIE_SECURE=true APP_VERSION=${APP_VERSION} BUILD_DATE=${BUILD_DATE} GIT_SHA=${GIT_SHA}
WORKDIR /app
COPY --from=build --chown=65532:65532 /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=65532:65532 /app/package.json /app/package-lock.json ./
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/src ./src
COPY --from=build --chown=65532:65532 /app/dist ./dist
COPY --from=build --chown=65532:65532 /app/LICENSE /app/THIRD_PARTY_LICENSES.md /app/NOTICE ./
COPY --from=build --chown=65532:65532 /data-seed /data
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:8080/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["--import", "tsx", "src/server/index.ts"]
