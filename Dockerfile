FROM node:22-alpine

WORKDIR /app

# Instalar dependencias para compilar módulos si fuera necesario
RUN apk add --no-cache python3 make g++ tar

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY bin/ ./bin/
RUN npm run build

# Crear directorio de persistencia para el volumen
RUN mkdir -p /app/storage

ENV NODE_ENV=production
ENV PORT=3100
ENV STORAGE_DIR=/app/storage

EXPOSE 3100

CMD ["node", "dist/gateway/server.js"]
