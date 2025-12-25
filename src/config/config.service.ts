import {DiscordConfig, YoutubeConfig} from './config.type'
import {Injectable, Logger, OnModuleInit} from '@nestjs/common'
import {ConfigService} from '@nestjs/config'
import {
    AppConfig,
    AuthConfig,
    AwsConfig,
    Configs,
    DBConfig,
    ServerConfig,
} from 'src/config/config.type'
import {
    validateConfig,
    DiscordConfigSchema,
    YoutubeConfigSchema,
    DBConfigSchema,
} from './config.schema'

@Injectable()
export class AppConfigService implements OnModuleInit {
    private readonly logger = new Logger(AppConfigService.name)

    constructor(private readonly configService: ConfigService<Configs>) {}

    onModuleInit() {
        this.validateRequiredConfigs()
    }

    private validateRequiredConfigs(): void {
        try {
            const discord = this.configService.get('DISCORD')
            const youtube = this.configService.get('YOUTUBE')
            const db = this.configService.get('DB')

            validateConfig(DiscordConfigSchema, discord)
            validateConfig(YoutubeConfigSchema, youtube)
            validateConfig(DBConfigSchema, db)

            this.logger.log('Configuration validation passed')
        } catch (error) {
            this.logger.error(`Configuration validation failed: ${error.message}`)
            throw error
        }
    }

    get(propertyPath: keyof Configs) {
        return this.configService.get(propertyPath)
    }

    getAppConfig(): AppConfig {
        return this.configService.getOrThrow('APP')
    }

    getAuthConfig(): AuthConfig {
        return this.configService.getOrThrow('AUTH')
    }

    getDBConfig(): DBConfig {
        return this.configService.getOrThrow('DB')
    }

    getDiscordConfig(): DiscordConfig {
        return this.configService.getOrThrow('DISCORD')
    }

    getServerConfig(): ServerConfig {
        return this.configService.getOrThrow('SERVER')
    }

    getYoutubeConfig(): YoutubeConfig {
        return this.configService.getOrThrow('YOUTUBE')
    }

    getAwsConfig(): AwsConfig {
        return this.configService.getOrThrow('AWS')
    }
}
