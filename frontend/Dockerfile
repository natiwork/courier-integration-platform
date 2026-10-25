# Frontend image: builds the static app with Node, then serves it with nginx, which also forwards /api to the
# backend. Same origin for the browser, so no CORS setup is needed (as with the Vite proxy in development).

FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The unprivileged nginx image runs as a normal user and listens on 8080 instead of 80.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
