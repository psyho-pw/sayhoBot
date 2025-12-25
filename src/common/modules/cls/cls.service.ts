import { Injectable } from '@nestjs/common';
import { ClsService as ClsServiceInNest } from 'nestjs-cls';
import { IClsService, ClsStorage } from './cls.type';

@Injectable()
export class ClsService implements IClsService {
  constructor(private readonly clsService: ClsServiceInNest<ClsStorage>) {}

  public get store() {
    return this.clsService.get();
  }

  public runWith<T>(store: ClsStorage, callback: () => T): T {
    return this.clsService.runWith(store, callback);
  }

  public get requestId(): ClsStorage['requestId'] {
    return this.store?.requestId;
  }

  public set requestId(requestId: string) {
    if (this.store) this.store.requestId = requestId;
  }

  public set controllerCtx(controllerCtx: string) {
    if (this.store) this.store.controllerCtx = controllerCtx;
  }

  public get controllerCtx(): ClsStorage['controllerCtx'] {
    return this.store?.controllerCtx;
  }

  public set methodCtx(methodCtx: string) {
    if (this.store) this.store.methodCtx = methodCtx;
  }

  public get methodCtx(): ClsStorage['methodCtx'] {
    return this.store?.methodCtx;
  }
}
