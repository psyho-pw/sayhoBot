import {Injectable} from '@nestjs/common'
import {TypeOrmModuleOptions, TypeOrmOptionsFactory} from '@nestjs/typeorm'
import {AppConfigService} from 'src/config/config.service'

@Injectable()
export class TypeormConfigService implements TypeOrmOptionsFactory {
    constructor(private readonly configService: AppConfigService) {}

    createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
        console.log(this.configService.getDBConfig())
        return {
            ...this.configService.getDBConfig(),
            entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
            keepConnectionAlive: true,
            // dropSchema: true,
        }
    }
}
