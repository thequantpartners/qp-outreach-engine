# Multi-stage Dockerfile para QP Outreach Engine (SaaR Satellite Node & Master Hub)

# ETAPA 1: Compilación de TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifiestos de paquetes
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias de desarrollo y producción para compilar
RUN npm ci

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript a dist/
RUN npm run build

# ETAPA 2: Imagen Ligera de Producción
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100

# Instalar dependencias esenciales de sistema (tar para backups)
RUN apk add --no-cache bash tar tzdata

# Configurar zona horaria de Perú
ENV TZ=America/Lima

# Copiar manifiestos e instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar compilado desde builder
COPY --from=builder /app/dist ./dist

# Copiar assets estáticos del Dashboard Web
COPY public/ ./public/
COPY bin/ ./bin/

# Crear directorios de almacenamiento persistente
RUN mkdir -p storage/assets storage/whatsapp_auth storage/master storage/clients

EXPOSE 3100

# Arranque del microservicio Express + Baileys + Dashboard
CMD ["node", "dist/gateway/server.js"]
