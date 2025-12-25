import { Inject, Injectable } from '@nestjs/common';
import { Aspect, LazyDecorator, WrapParams, createDecorator } from '@toss/nestjs-aop';
import { ConfigServiceKey } from 'src/config/config.service';
import { IConfigService } from 'src/config/config.type';
import { Env } from 'src/constants';
import { DiscordNotificationService } from '../../discord/discord.notification.service';
import { GeneralException } from '../exceptions/general.exception';
import { ILoggerService, LoggerServiceKey } from '../logger/logger.interface';

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
    private readonly notificationService: DiscordNotificationService,
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
