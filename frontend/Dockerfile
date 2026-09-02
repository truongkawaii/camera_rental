# Build stage
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Copy template configs vào thư mục riêng (KHÔNG để trong conf.d/ —
# nếu không Nginx sẽ load tất cả .conf và lỗi nếu có upstream không tồn tại)
COPY nginx.conf /etc/nginx/templates/nginx.conf
COPY nginx.render.conf /etc/nginx/templates/nginx.render.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
