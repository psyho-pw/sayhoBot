import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Env } from 'src/constants';
import { INotificationService, NotificationPort } from 'src/discord/domain/ports/notification.port';
import { ConfigServiceKey } from '../modules/config/config.service';
import { IConfigService } from '../modules/config/config.type';
import { ILoggerService, LoggerServiceKey } from '../modules/logger/logger.interface';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  constructor(
    @Inject(NotificationPort)
    private notificationService: INotificationService,
    @Inject(LoggerServiceKey) private readonly logger: ILoggerService,
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
  ) {}

  private curryLogger(tag: string) {
    return (data: any) => this.logger.error({ ctx: this.intercept.name, info: data, message: tag });
  }

  private logError(context: ExecutionContext) {
    return this.curryLogger(`${context.getClass().name}.${context.getHandler().name}`);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        const returnObj: Record<string, any> = {};

        if (process.env.NODE_ENV !== 'production') {
          returnObj.callClass = context.getClass().name;
          returnObj.callMethod = context.getHandler().name;
        }

        if (err instanceof HttpException) {
          if (err.getStatus() === HttpStatus.INTERNAL_SERVER_ERROR) this.logError(context)(err);
          const payload = err.getResponse();
          context.switchToHttp().getResponse().status(err.getStatus());

          return of({
            ...returnObj,
            ...(typeof payload === 'string' ? { message: payload } : payload),
          });
        }

        this.logger.error({
          ctx: this.intercept.name,
          info: err,
          message: 'Unhandled error occurred',
        });
        this.logError(context)(err);

        const env = this.configService.appConfig.ENV;
        if (env === Env.production) {
          this.notificationService
            .sendMessage(err.message, context.getArgs()[0].route.path, [
              {
                name: 'call method',
                value: `${context.getClass().name}.${context.getHandler().name}`,
              },
              { name: 'stack', value: err.stack.substring(0, 1024) },
            ])
            .catch((error: Error) =>
              this.logger.error({
                ctx: this.intercept.name,
                info: error,
                message: 'failed to send discord message',
              }),
            );
        }

        context
          .switchToHttp()
          .getResponse()
          .status(err.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR);

        return of({ ...returnObj, stack: err.stack });
      }),
    );
  }
}
