import { Inject, Injectable } from '@nestjs/common';
import { Aspect, LazyDecorator, WrapParams, createDecorator } from '@toss/nestjs-aop';
import { Env } from 'src/constants';
import { INotificationService, NotificationPort } from '../../discord/domain/ports/notification.port';
import { GeneralException } from '../exceptions/general.exception';
import { ConfigServiceKey } from '../modules/config/config.service';
import { IConfigService } from '../modules/config/config.type';
import { ILoggerService, LoggerServiceKey } from '../modules/logger/logger.interface';

export const DiscordErrorHandlerKey = Symbol('DiscordErrorHandler');

export interface HandleDiscordErrorOptions {
  bubble?: boolean;
}

export const HandleDiscordError = (options?: HandleDiscordErrorOptions) =>
  createDecorator(DiscordErrorHandlerKey, options ?? { bubble: false });

@Aspect(DiscordErrorHandlerKey)
@Injectable()
export class DiscordErrorAspect implements LazyDecorator<any, HandleDiscordErrorOptions> {
  constructor(
    @Inject(NotificationPort)
    private readonly notificationService: INotificationService,
    @Inject(LoggerServiceKey) private readonly loggerService: ILoggerService,
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
  ) {}

  wrap({ method, methodName, metadata }: WrapParams<any, HandleDiscordErrorOptions>) {
    return async (...args: any[]) => {
      try {
        return await method(...args);
      } catch (error: any) {
        if (error instanceof GeneralException) error.CallMethod = methodName;

        this.loggerService.error({
          ctx: this.wrap.name,
          info: error,
          message: error.message,
        });

        const env = this.configService.appConfig.ENV;
        if (env === Env.production) await this.notificationService.sendErrorReport(error);

        if (metadata?.bubble) {
          throw error;
        }
      }
    };
  }
}
