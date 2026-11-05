FROM node:24.7.0-alpine as development
RUN apk add --update python3 make g++ ffmpeg\
   && rm -rf /var/cache/apk/*
ARG YT_DLP_VERSION=2026.10.26
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

ENV NODE_ENV=development

RUN npm i -g pnpm
RUN which pnpm

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install

COPY . .

RUN pnpm run build

FROM node:24.7.0-alpine as production
RUN apk --no-cache add --update python3 make g++ ffmpeg tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone \
    apk del tzdata

ARG YT_DLP_VERSION=2026.10.26
RUN wget -qO /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

RUN npm i -g pnpm

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod
COPY dist ./dist

CMD ["node", "dist/main"]

