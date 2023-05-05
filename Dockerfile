FROM node:20.0.0-alpine as development
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

ENV NODE_ENV=development

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn install

COPY . .

RUN yarn run build

FROM node:20.0.0-alpine as build
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn run build

RUN rm -rf node_modules && yarn install --only-production

FROM node:20.0.0-alpine as production
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

CMD ["node", "dist/src/main"]

