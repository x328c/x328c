FROM node:20-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_TENCENT_MAP_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -q -O - http://127.0.0.1/ >/dev/null || exit 1
