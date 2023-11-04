import {GeneralException} from '../general.exception'
import {DiscordEventService} from 'src/discord/discord.event.service'

export class DiscordEventException extends GeneralException {
    constructor(message: string, callMethod?: string) {
        super(DiscordEventService.name, callMethod ?? '', message)
    }
}
