FROM datadog/serverless-init:1 AS datadog

FROM node:22-slim AS runner

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

COPY --from=datadog /datadog-init /app/datadog-init

ENV NODE_ENV=production \
    PORT=8080

EXPOSE 8080

ENTRYPOINT ["/app/datadog-init"]
CMD ["node", "server.js"]
