FROM node:lts-alpine

WORKDIR /app
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 6543

CMD ["node", "app.js"]
