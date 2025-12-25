import { Inject, Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import {
  ConfigServiceKey
} from 'src/config/config.service';
import { IConfigService } from 'src/config/config.type';

@Injectable()
export class TypeormConfigService implements TypeOrmOptionsFactory {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
  ) {}

  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    const options: TypeOrmModuleOptions = {
      ...this.configService.dbConfig,
      entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
      logging: false,
      extra: {
        connectionLimit: 10,
        waitForConnections: true,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      },
      retryAttempts: 3,
      retryDelay: 3000,
    };

    return options;
  }
}
