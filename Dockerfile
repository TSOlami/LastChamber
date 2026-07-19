FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY public ./public
EXPOSE 4173
USER node
CMD ["node", "server/index.js"]
