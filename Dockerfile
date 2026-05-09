FROM node:22-alpine AS builder


ARG VITE_API_BASE_URL
ARG VITE_FILE_ROOT

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_FILE_ROOT=$VITE_FILE_ROOT

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
