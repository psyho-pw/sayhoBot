import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IClsService } from '../cls/cls.type';
import { v7 } from 'uuid';
import { IConfigService } from 'src/config/config.type';
import { LoggerServiceKey, ILoggerService } from '../logger/logger.interface';
import { ConfigServiceKey } from 'src/config/config.service';
import { ClsServiceKey } from '../cls/cls.module';

@Injectable()
export class RequestIdGuard implements CanActivate {
  constructor(
    @Inject(ClsServiceKey) private readonly clsService: IClsService,
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(LoggerServiceKey) private readonly loggerService: ILoggerService,
  ) {
  }

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
