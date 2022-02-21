FROM node:16.13.2

WORKDIR /usr/src/app

COPY . .
RUN npm install --legacy-peer-deps && npm run build

EXPOSE 3000
CMD [ "npm", "run", "start:prod" ]