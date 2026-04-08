FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/

RUN npm ci --omit=dev -w server

COPY server/ server/
COPY --from=build /app/client/dist client/dist

EXPOSE 3001

CMD ["npm", "start"]
