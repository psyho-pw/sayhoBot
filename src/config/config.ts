import pkg from '../../package.json'
import {Configs} from './config.type'
import micromatch from 'micromatch'
import * as process from 'process'

export const configs = (): Configs => {
    const currentEnv = process.env.NODE_ENV || 'local'

    const originWhiteList: string[] = JSON.parse(process.env.ORIGIN_WHITELIST || '[]')

    return {
        APP: {
            NAME: pkg.name,
            VERSION: pkg.version,
            DESCRIPTION: pkg.description,
            AUTHORS: pkg.author,
            PORT: process.env.PORT || 8081,
            ENV: currentEnv,
            PROXY: process.env.PROXY ?? '',
        },
        SERVER: {
            SESSION: {
                secret: process.env.SESSION_SECRET || 'orange-secret',
                saveUninitialized: false,
                resave: false,
                rolling: true,
                name: process.env.SESSION_NAME,
                proxy: true,
                cookie: {
                    httpOnly: true,
                    maxAge: parseInt(process.env.SESSION_EXPIRE || '86400000', 10),
                    secure: 'auto',
                    sameSite: 'none',
                },
            },
            CORS: {
                origin: (origin, callback) => {
                    const isKnownOrigin = micromatch.isMatch(origin || '', originWhiteList)

                    if (isKnownOrigin || !origin) {
                        return callback(null, true)
                    }

                    callback(new Error(`${origin} is not allowed by CORS`))
                },
                exposedHeaders: ['session-expires'],
                methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
                credentials: true,
            },
        },
        DB: {
            type: 'mariadb',
            host: process.env.DB_HOST,
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
            synchronize: process.env.NODE_ENV === 'development',
            dropSchema: false,
            logging: process.env.NODE_ENV === 'development',
        },

        DISCORD: {
            COMMAND_PREFIX: process.env.DISCORD_COMMAND_PREFIX || '!',
            CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
            GUILD_ID: process.env.DISCORD_GUILD_ID || '',
            TOKEN: process.env.DISCORD_TOKEN || '',
            WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || '',
            MESSAGE_DELETE_TIMEOUT: 7_000,
        },
        YOUTUBE: {
            YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
            COOKIE: process.env.COOKIE || '',
            IDENTITY_TOKEN: process.env.IDENTITY_TOKEN || '',
        },
        AUTH: {
            GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        },
        AWS: {
            ACCESS_KEY: process.env.AWS_ACCESS_KEY || '',
            SECRET_KEY: process.env.AWS_SECRET_KEY || '',
            REGION: process.env.AWS_REGION || '',
            SIGNATURE: 'v4',
        },
        FRONT: {
            FRONT_URL: process.env.FRONT_URL || '',
        },
    }
}
