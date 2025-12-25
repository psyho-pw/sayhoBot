import {ConfigServiceKey, TypedConfigService} from './config/config.service';
import {NestFactory, Reflector} from '@nestjs/core';
import {WINSTON_MODULE_NEST_PROVIDER} from 'nest-winston';
import {AppModule} from './app.module';
import {ClassSerializerInterceptor, ValidationPipe, VersioningType} from '@nestjs/common';
import {NestExpressApplication} from '@nestjs/platform-express';
import helmet from 'helmet';
import {initializeTransactionalContext} from 'typeorm-transactional';
import * as process from 'node:process';
import {LoggerServiceKey, ILoggerService} from './common/logger/logger.interface';

async function bootstrap() {
    initializeTransactionalContext();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get<TypedConfigService>(ConfigServiceKey);
    const logger = await app.resolve<ILoggerService>(LoggerServiceKey);
    logger.setContext('bootstrap');

    const appConfig = configService.appConfig;
    const serverConfig = configService.serverConfig;

    logger.debug({
        ctx: bootstrap.name,
        info: {appConfig, serverConfig},
    });

    app.set('trust proxy', true);
    app.use(helmet());
    app.setGlobalPrefix('api');
    app.enableVersioning({type: VersioningType.URI});
    app.enableCors(serverConfig.CORS);
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            transformOptions: {enableImplicitConversion: true},
        }),
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
    await app.listen(appConfig.PORT, () => {
        logger.verbose({
            ctx: bootstrap.name,
            info: `[${process.env.NODE_ENV}] Listening on port ${process.env.PORT}`,
        });
    });
}

bootstrap();
