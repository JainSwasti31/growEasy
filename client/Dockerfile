FROM node:18-alpine AS base
WORKDIR /workspace

# Install dependencies and build
FROM base AS build
COPY package*.json ./
COPY client/package*.json ./client/
COPY client/ ./client/
COPY shared/ ./shared/
WORKDIR /workspace/client
RUN npm ci --silent
RUN npm run build

# Production image
FROM node:18-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/client/.next ./.next
COPY --from=build /workspace/client/package.json ./package.json
COPY --from=build /workspace/client/public ./public
EXPOSE 3000
CMD ["npm", "start"]
