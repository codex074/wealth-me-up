FROM node:22-bookworm-slim

WORKDIR /app
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1 \
    NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY scripts ./scripts
RUN npm run install:ci

COPY . .
RUN npm run build

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
