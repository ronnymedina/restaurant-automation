# Stage 1: deps
# Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json .
RUN npm install

# Stage 2: dev
# Development server with hot reload
FROM deps AS dev
WORKDIR /app
CMD ["npm", "run", "dev"]

# Stage 3: build
# Production build
FROM deps AS build
ARG PUBLIC_API_URL=__PLACEHOLDER_API_URL__
ENV PUBLIC_API_URL=$PUBLIC_API_URL
WORKDIR /app
COPY . .
RUN npm run build

# Stage 4: prod
# Production nginx server
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
