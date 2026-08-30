FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
USER 10001
EXPOSE 8080
CMD ["src/index.js"]
