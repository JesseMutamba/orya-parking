FROM node:24.14.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.mjs ./
COPY public ./public
ENV NODE_ENV=production
ENV ORYA_DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.mjs"]
