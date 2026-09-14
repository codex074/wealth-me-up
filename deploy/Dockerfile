FROM node:22-bookworm-slim

WORKDIR /app
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1 \
    NODE_ENV=production

# workerd (wrangler dev) verifies outbound TLS (Google's token endpoint) against
# the system CA store, which the slim image does not ship. Node's bundled CAs do
# not help here.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY scripts ./scripts
RUN npm run install:ci

COPY . .
RUN npm run build

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8787
ENTRYPOINT ["/entrypoint.sh"]
