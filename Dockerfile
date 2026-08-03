FROM node:18-alpine3.18 AS base
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache busybox-extras

FROM base AS dev
RUN npm install 
COPY . .
CMD [ "sh", "-c", "npm run migration:run && npm run start:dev" ]