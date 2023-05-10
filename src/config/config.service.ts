import {DiscordConfig} from './config.type'
import {Injectable} from '@nestjs/common'
import {ConfigService} from '@nestjs/config'
import {
    AppConfig,
    AuthConfig,
    AwsConfig,
    Configs,
    DBConfig,
    ServerConfig,
} from 'src/config/config.type'

@Injectable()
export class AppConfigService {
    constructor(private readonly configService: ConfigService<Configs>) {}

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

    getAwsConfig(): AwsConfig {
        return this.configService.getOrThrow('AWS')
    }
}
