# Stage 1: Build React Vite app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve compiled React bundle via Nginx (unprivileged: non-root, port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk update && apk upgrade --no-cache
USER nginx
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
