import { ClsStore } from 'nestjs-cls';

export type ClsStorage = {
  requestId?: string;
  controllerCtx?: string;
  methodCtx?: string;
};

export interface IClsService {
  store: ClsStorage;
  runWith<T>(store: ClsStore, callback: () => T): T;
  requestId?: string;
  controllerCtx?: string;
  methodCtx?: string;
}
