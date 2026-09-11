# syntax=docker/dockerfile:1

FROM node:24-alpine AS dependencies

WORKDIR /app

RUN npm install --global pnpm@10.34.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN npx prisma generate

FROM dependencies AS build

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN pnpm run build && pnpm run build:backend && pnpm prune --prod

FROM node:24-alpine AS app

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./

USER node

FROM dependencies AS migrator

COPY prisma ./prisma

USER node
ENTRYPOINT ["npx", "prisma", "migrate", "deploy"]
