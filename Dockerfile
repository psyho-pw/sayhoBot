FROM ubuntu:latest
LABEL authors="sayho"

FROM node:20.0.0-alpine as development
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn install

COPY . .

RUN yarn run build

FROM node:20.0.0-alpine as production
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

#COPY package.json ./
#COPY yarn.lock ./
#
#RUN yarn install --only=production
#
#COPY . .

COPY --from=development /usr/src/app/dist ./dist

CMD ["node", "dist/src/main"]

