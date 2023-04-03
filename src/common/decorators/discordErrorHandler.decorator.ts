import {DiscordNotificationService} from '../../discord/services/discord.notification.service'
import {Inject} from '@nestjs/common'

export function DiscordErrorHandler(bubble = false) {
    const injectNotification = Inject(DiscordNotificationService)

    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        injectNotification(target, 'discordNotificationService')
        const originalMethod = descriptor.value

        descriptor.value = async function (...args: any[]) {
            try {
                return await originalMethod.apply(this, args)
            } catch (error) {
                const discordNotificationService: DiscordNotificationService = this.discordNotificationService
                await discordNotificationService.sendErrorReport(error)

                if (bubble) throw error
            }
        }
    }
}
