import { ClassSerializerInterceptor, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsGuard } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { AppController } from './app.controller';
import { RequestIdGuard } from './common/guard/request-id.guard';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';
import { RequestLogInterceptor } from './common/interceptors/request-log.interceptor';
import { CommonModule } from './common/modules/common.module';
import { GlobalValidationPipe } from './common/pipe/global-validation.pipe';
import { DiscordModule } from './discord/discord.module';
import { SongModule } from './song/song.module';

@Module({
  imports: [CommonModule, ScheduleModule.forRoot(), DiscordModule, SongModule],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ClsGuard },
    { provide: APP_GUARD, useClass: RequestIdGuard },
    { provide: APP_PIPE, useClass: GlobalValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor },
  ],
})
export class AppModule implements NestModule {
  constructor(private dataSource: DataSource) {
    addTransactionalDataSource(this.dataSource);
  }

  configure(_consumer: MiddlewareConsumer): void {
    // _consumer.apply(LoggerMiddleware).forRoutes('/');
  }
}
