import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Inject,
    HttpException,
    HttpStatus,
} from '@nestjs/common'
import {Observable, of} from 'rxjs'
import {catchError} from 'rxjs/operators'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {DiscordNotificationService} from 'src/discord/discord.notification.service'

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
    constructor(
        private discordService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    private curryLogger(tag: string) {
        return (data: any) => this.logger.error(tag, data)
    }

    private logError(context: ExecutionContext) {
        return this.curryLogger(`${context.getClass().name}.${context.getHandler().name}`)
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            catchError(err => {
                const returnObj: Record<string, any> = {}

                if (process.env.NODE_ENV !== 'production') {
                    returnObj.callClass = context.getClass().name
                    returnObj.callMethod = context.getHandler().name
                }

                if (err instanceof HttpException) {
                    if (err.getStatus() === HttpStatus.INTERNAL_SERVER_ERROR)
                        this.logError(context)(err)
                    const payload = err.getResponse()
                    context.switchToHttp().getResponse().status(err.getStatus())

                    return of({
                        ...returnObj,
                        ...(typeof payload === 'string' ? {message: payload} : payload),
                    })
                }

                this.logger.error('Unhandled error occurred')
                this.logError(context)(err)

                if (process.env.NODE_ENV === 'production') {
                    this.discordService
                        .sendMessage(err.message, context.getArgs()[0].route.path, [
                            {
                                name: 'call method',
                                value: `${context.getClass().name}.${context.getHandler().name}`,
                            },
                            {name: 'stack', value: err.stack.substring(0, 1024)},
                        ])
                        .catch(error =>
                            this.logger.error('failed to send discord message', {error}),
                        )
                }

                context
                    .switchToHttp()
                    .getResponse()
                    .status(err.getStatus() || HttpStatus.INTERNAL_SERVER_ERROR)

                return of({...returnObj, stack: err.stack})
            }),
        )
    }
}
