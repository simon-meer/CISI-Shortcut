FROM node:6
EXPOSE 3000

WORKDIR /usr/src/app
RUN chmod 777 /usr/src/app

COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

CMD [ "npm", "start" ]