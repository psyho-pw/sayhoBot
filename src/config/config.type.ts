import {CorsOptions} from '@nestjs/common/interfaces/external/cors-options.interface';
import {TypeOrmModuleOptions} from '@nestjs/typeorm';
import {Request as ExpressRequest} from 'express';
import {SessionOptions} from 'express-session';

export interface IConfigService {
    get<T extends keyof Configs>(propertyPath: T): Configs[T];
    get appConfig(): AppConfig;
    get authConfig(): AuthConfig;
    get dbConfig(): DBConfig;
    get discordConfig(): DiscordConfig;
    get serverConfig(): ServerConfig;
    get youtubeConfig(): YoutubeConfig;
    get awsConfig(): AwsConfig;
}
export interface AppConfig {
    NAME: string;
    VERSION: string;
    DESCRIPTION: string;
    AUTHORS: string;
    PORT: string | number;
    ENV: string;
    PROXY: string;
}

export interface ServerConfig {
    SESSION: SessionOptions;
    CORS: CorsOptions;
}

export type DBConfig = TypeOrmModuleOptions;

export interface DiscordConfig {
    COMMAND_PREFIX: string;
    CLIENT_ID: string;
    GUILD_ID: string;
    TOKEN: string;

    WEBHOOK_URL: string;
    MESSAGE_DELETE_TIMEOUT: number;
}

export interface AuthConfig {
    GOOGLE_CLIENT_ID?: string;
}

export interface AwsConfig {
    ACCESS_KEY: string;
    SECRET_KEY: string;
    REGION: string;
    SIGNATURE: 'v2' | 'v4';
}
export interface Front {
    FRONT_URL: string;
}

export interface YoutubeConfig {
    YOUTUBE_API_KEY: string;
    COOKIE: string;
    IDENTITY_TOKEN: string;
}

export interface Configs {
    APP: AppConfig;
    SERVER: ServerConfig;
    DB: DBConfig;
    DISCORD: DiscordConfig;
    AUTH: AuthConfig;
    AWS: AwsConfig;
    YOUTUBE: YoutubeConfig;
    FRONT: Front;
}
export interface EmailConfig {
    title: string;
    address: Array<string>;
    templateFilename: string;
    templateData: RandomObject;
}

export interface RandomObject {
    [key: string | number]: any;
}

export interface User {
    email: string;
    password: string;
    familyName: string;
    givenName: string;
    activatedAt: Date | null;
}

export interface VerifiedUser {
    session: string;
    user?: Omit<User, 'password'>;
}

declare module 'express-session' {
    interface SessionData {
        credentials: VerifiedUser;
    }
}
export type Request = ExpressRequest;
