import {Injectable} from '@nestjs/common'
import {utilities, WinstonModuleOptionsFactory} from 'nest-winston'
import winston from 'winston'
import winstonDaily from 'winston-daily-rotate-file'
import {AppConfigService} from 'src/config/config.service'

@Injectable()
export class WinstonConfigService implements WinstonModuleOptionsFactory {
    constructor(private configService: AppConfigService) {}

    createWinstonModuleOptions() {
        const appConfig = this.configService.getAppConfig()
        const nodeEnv = appConfig.ENV
        const serviceName = appConfig.NAME
        return {
            transports: [
                new winston.transports.Console({
                    level: nodeEnv === 'production' ? 'silly' : 'silly',
                    format: winston.format.combine(
                        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                        winston.format.colorize(),
                        utilities.format.nestLike(serviceName || 'test', {
                            prettyPrint: true,
                            colors: true,
                        }),
                    ),
                }),
                new winstonDaily({
                    level: 'debug',
                    datePattern: 'YYYY-MM-DD',
                    dirname: 'logs',
                    filename: `%DATE%.log`,
                    format: winston.format.combine(
                        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                        winston.format.colorize(),
                        utilities.format.nestLike(serviceName || 'test', {
                            prettyPrint: true,
                        }),
                    ),
                    maxFiles: 30, // 30일치 로그 파일 저장
                    zippedArchive: true,
                }),
            ],
        }
    }
}
