import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { tap } from 'rxjs';
import { ConfigServiceKey } from 'src/config/config.service';
import { IConfigService } from 'src/config/config.type';
import { Env } from 'src/constants';
import { LoggerServiceKey, ILoggerService } from '../logger/logger.interface';

interface RequestLog {
  method: string;
  url: string;
  callerId?: string;
  headers?: object;
  query?: object;
  body?: string;
}

interface ResponseLog {
  status: number;
  responseTime: number;
  headers?: object;
  body?: string;
}

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(LoggerServiceKey) private readonly loggerService: ILoggerService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<any> {
    const isProduction = this.configService.appConfig.ENV === Env.production;

    let request: RequestLog;
    let response: ResponseLog;

    if (context.getType() === 'http') {
      const httpContext = context.switchToHttp();
      const req: Request = httpContext.getRequest();

      const { originalUrl } = req;
      if (originalUrl.includes('/health-check')) {
        return next.handle();
      }

      if (originalUrl.includes('/metrics')) {
        return next.handle();
      }

      req.startTime = Date.now();

      let body = JSON.stringify({});

      try {
        body = JSON.stringify(req.body);
      } catch {
        this.loggerService.warn({
          ctx: this.intercept.name,
          info: req.body,
          message: 'failed formatting request body',
        });
      }

      // API Request Logging
      request = isProduction
        ? {
            method: req.method,
            url: req.url,
            headers: req.headers,
            query: req.query,
          }
        : { method: req.method, url: req.url };

      this.loggerService.info({
        ctx: this.intercept.name,
        info: request,
        message: `REQUEST [${request.method}]${request.url}`,
      });
    }

    return next.handle().pipe(
      tap((resBody) => {
        if (context.getType() === 'http') {
          const httpContext = context.switchToHttp();
          const req: Request = httpContext.getRequest();
          const res: Response = httpContext.getResponse();
          const url = req.url;

          const responseTime = Date.now() - req['startTime'];

          let body = JSON.stringify({});
          try {
            body = JSON.stringify(resBody);
          } catch {
            this.loggerService.warn({
              ctx: this.intercept.name,
              info: resBody,
              message: 'failed formatting res body',
            });
          }

          // API Response Logging
          response = isProduction
            ? { status: res.statusCode, responseTime, headers: res.getHeaders(), body }
            : { status: res.statusCode, responseTime };

          if (responseTime >= 10_000) {
            this.loggerService.error({
              ctx: this.intercept.name,
              info: { request, response },
              message: `SLOW REQUEST [${request.method}]${request.url} - ${responseTime}ms`,
            });
          } else {
            this.loggerService.info({
              ctx: this.intercept.name,
              info: { request, response },
              message: `RESPONSE [${request.method}]${request.url}`,
            });
          }
        }
      }),
    );
  }
}
