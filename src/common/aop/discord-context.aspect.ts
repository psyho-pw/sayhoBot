import { Inject, Injectable } from '@nestjs/common';
import { Aspect, LazyDecorator, WrapParams, createDecorator } from '@toss/nestjs-aop';
import { v7 } from 'uuid';
import { ClsServiceKey } from '../modules/cls/cls.module';
import { ClsStorage, IClsService } from '../modules/cls/cls.type';

export const DiscordContextKey = Symbol('DiscordContext');

export interface DiscordContextOptions {
  eventType?: string;
}

export const WithDiscordContext = (options?: DiscordContextOptions) =>
  createDecorator(DiscordContextKey, options ?? {});

@Aspect(DiscordContextKey)
@Injectable()
export class DiscordContextAspect implements LazyDecorator<any, DiscordContextOptions> {
  constructor(@Inject(ClsServiceKey) private readonly clsService: IClsService) {}

  wrap({ method, methodName, instance }: WrapParams<any, DiscordContextOptions>) {
    return async (...args: any[]) => {
      const store: ClsStorage = {
        requestId: v7(),
        controllerCtx: instance.constructor.name,
        methodCtx: methodName,
      };

      return this.clsService.runWith(store, () => {
        return method(...args);
      });
    };
  }
}
