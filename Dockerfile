FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Remove build tools after native module compilation
RUN apk del python3 make g++

COPY server.mjs entrypoint.sh ./
COPY public ./public

RUN chmod +x entrypoint.sh

VOLUME /app/data
EXPOSE 3457

ENTRYPOINT ["./entrypoint.sh"]
