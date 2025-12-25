import { ClassSerializerInterceptor, MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeormConfigService } from './common/configServices/typeorm.config.service';
import { WinstonConfigService } from './common/configServices/winston.config.service';
import { WinstonModule } from 'nest-winston';
import { AopModule } from '@toss/nestjs-aop';
import { DiscordModule } from './discord/discord.module';
import { addTransactionalDataSource } from 'typeorm-transactional';
import { DataSource } from 'typeorm';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';
import { AppController } from './app.controller';
import { SongModule } from './song/song.module';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from './common/cls/cls.module';
import { RequestIdGuard } from './common/guard/request-id.guard';
import { RequestLogInterceptor } from './common/interceptors/request-log.interceptor';
import { ClsGuard } from 'nestjs-cls';

@Module({
  imports: [
    ClsModule,
    AppConfigModule,
    TypeOrmModule.forRootAsync({ useClass: TypeormConfigService }),
    WinstonModule.forRootAsync({ useClass: WinstonConfigService }),
    AopModule,
    DiscordModule,
    SongModule,
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ClsGuard },
    { provide: APP_GUARD, useClass: RequestIdGuard },
    {
      provide: APP_PIPE,
      useFactory: () => new ValidationPipe({
        transform: true,
        transformOptions: {enableImplicitConversion: true},
      }),
    },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor },
  ],
})
export class AppModule implements NestModule {
  constructor(private dataSource: DataSource) {
    addTransactionalDataSource(this.dataSource);
  }

  configure(consumer: MiddlewareConsumer): void {
    // consumer.apply(LoggerMiddleware).forRoutes('/');
  }
}
