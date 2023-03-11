import {GeneralException} from '../general.exception'
import {DiscordNotificationService} from 'src/discord/services/discord.notification.service'

export class DiscordNotificationException extends GeneralException {
    constructor(callMethod: string, message: string) {
        super(DiscordNotificationService.name, callMethod, message)
    }
}
