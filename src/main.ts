import {AppConfigService} from 'src/config/config.service'
import {NestFactory, Reflector} from '@nestjs/core'
import {WINSTON_MODULE_NEST_PROVIDER} from 'nest-winston'
import {AppModule} from './app.module'
import {ClassSerializerInterceptor, Logger, ValidationPipe, VersioningType} from '@nestjs/common'
import {NestExpressApplication} from '@nestjs/platform-express'
import helmet from 'helmet'
import {initializeTransactionalContext} from 'typeorm-transactional'

async function bootstrap() {
    initializeTransactionalContext()
    const app = await NestFactory.create<NestExpressApplication>(AppModule)

    const configService = app.get(AppConfigService)
    const appConfig = configService.getAppConfig()
    const serverConfig = configService.getServerConfig()

    app.set('trust proxy', true)
    app.use(helmet())
    app.setGlobalPrefix('api')
    app.enableVersioning({type: VersioningType.URI})
    app.enableCors(serverConfig.CORS)
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            transformOptions: {enableImplicitConversion: true},
        }),
    )
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)))
    app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER))
    await app.listen(appConfig.PORT)
}

bootstrap().then(() => Logger.verbose(`[${process.env.NODE_ENV}] Listening on port ${process.env.PORT}`))
