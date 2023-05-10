FROM node:20.0.0-alpine as development
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*

ENV NODE_ENV=development

RUN npm i -g pnpm
RUN which pnpm

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./

RUN pnpm install

COPY . .

RUN pnpm run build

FROM node:20.0.0-alpine as production
RUN apk --no-cache add --update python3 make g++ ffmpeg tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone \
    apk del tzdata

RUN npm i -g pnpm

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
RUN pnpm install --prod
COPY dist ./dist

CMD ["node", "dist/src/main"]

