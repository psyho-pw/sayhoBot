import { Global, Module } from '@nestjs/common';
import { WinstonModule, utilities } from 'nest-winston';
import winston from 'winston';
import { Env } from 'src/constants';
import { LoggerServiceKey } from './logger.interface';
import { LoggerService } from './logger.service';
import { ConfigServiceKey } from '../config/config.service';
import { IConfigService } from '../config/config.type';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      inject: [ConfigServiceKey],
      useFactory: (configsService: IConfigService) => {
        const env = configsService.appConfig.ENV;
        const name = configsService.appConfig.NAME;
        const isDeployedEnv = env === Env.production;

        if (isDeployedEnv) {
          return {
            transports: [new winston.transports.Console({ level: 'info' })],
          };
        }

        return {
          transports: [
            new winston.transports.Console({
              level: env === Env.test ? 'verbose' : 'silly',
              format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                utilities.format.nestLike(name, { prettyPrint: true, colors: true }),
              ),
            }),
          ],
        };
      },
    }),
  ],
  providers: [{ provide: LoggerServiceKey, useClass: LoggerService }],
  exports: [LoggerServiceKey],
})
export class LoggerModule {}
