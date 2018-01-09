FROM node:6
EXPOSE 3000

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .
RUN chmod -r 777 /usr/src/app

CMD [ "npm", "start" ]