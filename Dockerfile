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

FROM node:20.0.0-alpine as production
RUN apk --no-cache add --update python3 make g++ ffmpeg tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone \
    apk del tzdata

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./
RUN yarn install --only-production
COPY dist ./dist

CMD ["node", "dist/src/main"]

