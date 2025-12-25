import { Global, Module } from '@nestjs/common';
import { ClsModule as ClsModuleInNest } from 'nestjs-cls';
import { ClsService } from './cls.service';

export const ClsServiceKey = Symbol('ClsService');

@Global()
@Module({
  imports: [ClsModuleInNest.forRoot({})],
  providers: [{ provide: ClsServiceKey, useClass: ClsService }],
  exports: [ClsModuleInNest, ClsServiceKey],
})
export class ClsModule {}
