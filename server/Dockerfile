FROM node:20-alpine AS base
WORKDIR /workspace

# Install dependencies and build server
FROM base AS build
COPY package*.json ./
COPY server/package*.json ./server/
COPY server/tsconfig.json ./server/
COPY server/ .
COPY shared/ ./shared/
WORKDIR /workspace/server
RUN npm ci --silent
RUN npm run build

# Production image
FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=build /workspace/server/dist ./dist
COPY --from=build /workspace/server/package.json ./package.json
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
