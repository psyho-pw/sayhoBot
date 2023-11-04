import {GeneralException} from '../general.exception'
import {DiscordNotificationService} from 'src/discord/discord.notification.service'

export class DiscordNotificationException extends GeneralException {
    constructor(message: string, callMethod?: string) {
        super(DiscordNotificationService.name, callMethod ?? '', message)
    }
}
