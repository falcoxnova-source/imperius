# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_TOKEN_CONTRACT
ARG VITE_BSC_RPC_URL
ARG VITE_BSC_CHAIN_ID
ARG VITE_BSCSCAN_API_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_TOKEN_CONTRACT=$VITE_TOKEN_CONTRACT
ENV VITE_BSC_RPC_URL=$VITE_BSC_RPC_URL
ENV VITE_BSC_CHAIN_ID=$VITE_BSC_CHAIN_ID
ENV VITE_BSCSCAN_API_KEY=$VITE_BSCSCAN_API_KEY

RUN npm run build

# Stage 2: Production
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# HTTPS es opcional: renombrar default-ssl.conf.template a default-ssl.conf y generar certs
COPY nginx/default-ssl.conf.template /etc/nginx/conf.d/default-ssl.conf.template

RUN mkdir -p /etc/nginx/ssl

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
