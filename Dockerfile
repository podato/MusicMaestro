FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 MUSIC_DIR=/music

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && mkdir /music && chown node:node /music
COPY server.mjs app.js index.html style.css ./

USER node
EXPOSE 5173
CMD ["node", "server.mjs"]
