FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-slim
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN useradd -u 10001 -m appuser
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
USER 10001
EXPOSE 8080
CMD ["node", "src/index.js"]
