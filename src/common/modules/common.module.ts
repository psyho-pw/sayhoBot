import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AopModule } from '@toss/nestjs-aop';
import { WinstonModule } from 'nest-winston';
import { AppConfigModule } from './config/config.module';
import { TypeormConfigService } from '../configServices/typeorm.config.service';
import { WinstonConfigService } from '../configServices/winston.config.service';
import { ClsModule } from './cls/cls.module';
import { LoggerModule } from './logger/logger.module';

const modules = [
  TypeOrmModule.forRootAsync({ useClass: TypeormConfigService }),
  WinstonModule.forRootAsync({ useClass: WinstonConfigService }),
  ClsModule,
  AppConfigModule,
  AopModule,
  LoggerModule,
  ScheduleModule.forRoot(),
];

@Global()
@Module({ imports: modules, exports: modules })
export class CommonModule {}
