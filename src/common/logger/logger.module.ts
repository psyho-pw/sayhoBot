import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LoggerServiceKey } from './logger.interface';
import { WinstonModule, utilities } from 'nest-winston';
import { ConfigServiceKey } from 'src/config/config.service';
import { Env } from 'src/constants';
import winston from 'winston';
import { IConfigService } from 'src/config/config.type';

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
  providers: [
    {
      provide: LoggerServiceKey,
      useClass: LoggerService,
    },
  ],
  exports: [
    LoggerServiceKey
  ],
})
export class LoggerModule {}
