import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigServiceKey, TypedConfigService } from './config.service';
import { configs } from './config';
import { LoggerModule } from '../common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';

@Global()
@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [`.env/.env.${process.env.NODE_ENV}`, 'dotenv/.env.development'],
            load: [configs],
            isGlobal: true,
        }),
        LoggerModule,
        ClsModule,
    ],
    providers: [
        {
            provide: ConfigServiceKey,
            useClass: TypedConfigService,
    },
  ],
  exports: [ConfigServiceKey],
})
export class AppConfigModule {}
