FROM node:22-alpine AS builder
WORKDIR /build
COPY viewer/package*.json viewer/
RUN npm --prefix viewer ci
COPY viewer/ viewer/
RUN npm --prefix viewer run build

FROM docker.io/library/caddy:alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /build/viewer/dist /srv
EXPOSE 9800
