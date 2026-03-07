FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package.json server.mjs entrypoint.sh ./
COPY public ./public

RUN chmod +x entrypoint.sh

VOLUME /app/data
EXPOSE 3457

ENTRYPOINT ["./entrypoint.sh"]
