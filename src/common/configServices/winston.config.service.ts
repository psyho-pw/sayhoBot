import {Inject, Injectable} from '@nestjs/common';
import {WinstonModuleOptionsFactory} from 'nest-winston';
import winston from 'winston';
import {IConfigService} from 'src/config/config.type';
import {ConfigServiceKey} from '../../config/config.service';
import {Env} from '../../constants';

@Injectable()
export class WinstonConfigService implements WinstonModuleOptionsFactory {
    constructor(
        @Inject(ConfigServiceKey)
        private readonly configService: IConfigService,
    ) {}

    createWinstonModuleOptions() {
        const nodeEnv = this.configService.appConfig.ENV;
        const serviceName = this.configService.appConfig.NAME;

        const transports: winston.transport[] = [];

        if (nodeEnv !== Env.production) {
            transports.push(
                new winston.transports.Console({
                    level: 'silly',
                    format: winston.format.combine(
                        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                        winston.format.colorize(),
                        winston.format.printf(
                            ({level, message, context, timestamp, stack, ...meta}) => {
                                const contextStr = context ? `[${context}] ` : '';
                                const stackStr = stack ? `\n${stack}` : '';
                                const metaStr =
                                    meta && Object.keys(meta).length > 0
                                        ? ` ${JSON.stringify(meta)}`
                                        : '';

                                return `${timestamp} ${level}: ${contextStr}${message}${metaStr}${stackStr}`;
                            },
                        ),
                    ),
                }),
            );
        } else {
            transports.push(
                new winston.transports.Console({
                    level: 'info',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json(),
                    ),
                }),
            );
        }

        return {
            defaultMeta: {
                service: serviceName,
            },
            transports,
        };
    }
}
