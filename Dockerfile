# Build Stage
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
# Copy custom nginx config if needed, otherwise default is used.
# For GCP Cloud Run, we might need to configure the port.
# Adding a simple replacement for PORT to support GCP Cloud Run defaults (8080)
# But Nginx listens on 80 by default. Cloud Run maps port 8080 env to the container.
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
