import { Injectable } from '@nestjs/common'
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm'
import { AppConfigService } from 'src/config/config.service'

@Injectable()
export class TypeormConfigService implements TypeOrmOptionsFactory {
    constructor(private readonly configService: AppConfigService) {}

    createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
        const options: TypeOrmModuleOptions = {
            ...this.configService.getDBConfig(),
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
        }

        return options
    }
}
