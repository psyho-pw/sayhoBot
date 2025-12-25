import {VersioningType} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {NestExpressApplication} from '@nestjs/platform-express';
import helmet from 'helmet';
import {initializeTransactionalContext} from 'typeorm-transactional';
import {AppModule} from './app.module';
import {LoggerServiceKey, ILoggerService} from './common/logger/logger.interface';
import {ConfigServiceKey} from './config/config.service';
import {IConfigService} from './config/config.type';

async function bootstrap() {
    initializeTransactionalContext();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get<IConfigService>(ConfigServiceKey);
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
    await app.listen(appConfig.PORT, () => {
        logger.verbose({
            ctx: bootstrap.name,
            info: `[${appConfig.ENV}] Listening on port ${appConfig.PORT}`,
        });
    });
}

bootstrap();
