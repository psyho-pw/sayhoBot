import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppConfig,
  AuthConfig,
  AwsConfig,
  Configs,
  DBConfig,
  DiscordConfig,
  IConfigService,
  ServerConfig,
  YoutubeConfig,
} from './config.type';

export const ConfigServiceKey = Symbol('ConfigService');

@Injectable()
export class TypedConfigService implements IConfigService {
  constructor(private readonly configService: ConfigService<Configs>) {}

  get<T extends keyof Configs>(propertyPath: T): Configs[T] {
    const property = this.configService.get(propertyPath);
    if (property === undefined) {
      throw new Error(`Configuration property "${String(propertyPath)}" does not exist`);
    }
    return property;
  }

  get appConfig(): AppConfig {
    return this.get('APP');
  }

  get authConfig(): AuthConfig {
    return this.get('AUTH');
  }

  get dbConfig(): DBConfig {
    return this.get('DB');
  }

  get discordConfig(): DiscordConfig {
    return this.get('DISCORD');
  }

  get serverConfig(): ServerConfig {
    return this.get('SERVER');
  }

  get youtubeConfig(): YoutubeConfig {
    return this.get('YOUTUBE');
  }

  get awsConfig(): AwsConfig {
    return this.get('AWS');
  }
}
