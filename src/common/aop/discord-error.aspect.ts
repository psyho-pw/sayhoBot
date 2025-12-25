import { Aspect, LazyDecorator, WrapParams, createDecorator } from '@toss/nestjs-aop'
import { Inject, Injectable } from '@nestjs/common'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { DiscordNotificationService } from '../../discord/discord.notification.service'
import { GeneralException } from '../exceptions/general.exception'

export const DISCORD_ERROR_HANDLER = Symbol('DISCORD_ERROR_HANDLER')

export interface HandleDiscordErrorOptions {
    bubble?: boolean
}

export const HandleDiscordError = (options?: HandleDiscordErrorOptions) =>
    createDecorator(DISCORD_ERROR_HANDLER, options ?? { bubble: false })

@Aspect(DISCORD_ERROR_HANDLER)
@Injectable()
export class DiscordErrorAspect implements LazyDecorator<any, HandleDiscordErrorOptions> {
    constructor(
        private readonly notificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    wrap({ method, methodName, metadata }: WrapParams<any, HandleDiscordErrorOptions>) {
        return async (...args: any[]) => {
            try {
                return await method(...args)
            } catch (error: any) {
                if (error instanceof GeneralException) {
                    error.CallMethod = methodName
                }

                this.logger.error(error.message, error.stack)
                await this.notificationService.sendErrorReport(error)

                if (metadata?.bubble) {
                    throw error
                }
            }
        }
    }
}
