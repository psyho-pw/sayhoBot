import { DiscordNotificationService } from 'src/discord/discord.notification.service'
import { Inject, Logger } from '@nestjs/common'
import { GeneralException } from '../exceptions/general.exception'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'

export function HandleDiscordError(bubble = false) {
    const injectNotification = Inject(DiscordNotificationService)
    const injectLogger = Inject(WINSTON_MODULE_PROVIDER)

    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        injectNotification(target, 'discordNotificationService')
        injectLogger(target, 'logger')
        const originalMethod = descriptor.value

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args)
            } catch (error) {
                if (error instanceof GeneralException) error.CallMethod = propertyKey

                const discordNotificationService: DiscordNotificationService =
                    this.discordNotificationService
                const logger: Logger = this.logger

                logger.error(error.message, error.stack)
                await discordNotificationService.sendErrorReport(error)

                if (bubble) throw error
            }
        }
    }
}
