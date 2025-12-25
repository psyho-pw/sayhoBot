import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v7 } from 'uuid';
import { ClsServiceKey } from '../modules/cls/cls.module';
import { IClsService } from '../modules/cls/cls.type';
import { ConfigServiceKey } from '../modules/config/config.service';
import { IConfigService } from '../modules/config/config.type';
import { LoggerServiceKey, ILoggerService } from '../modules/logger/logger.interface';

@Injectable()
export class RequestIdGuard implements CanActivate {
  constructor(
    @Inject(ClsServiceKey) private readonly clsService: IClsService,
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(LoggerServiceKey) private readonly loggerService: ILoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      if (context.getType() === 'http') {
        const request = context.switchToHttp().getRequest();
        const requestId: string = request.headers['x-request-id'] || v7();
        const controllerCtx = context.getClass().name;
        const methodCtx = context.getHandler().name;

        this.clsService.requestId = requestId;
        request.requestId = requestId;
        this.clsService.controllerCtx = controllerCtx;
        this.clsService.methodCtx = methodCtx;

        return true;
      }

      throw new ServiceUnavailableException('not supported');
    } catch (err) {
      return true;
    }
  }
}
