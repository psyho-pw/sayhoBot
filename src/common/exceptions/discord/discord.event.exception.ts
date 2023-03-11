import {GeneralException} from '../general.exception'
import {DiscordEventService} from 'src/discord/services/discord.event.service'

export class DiscordEventException extends GeneralException {
    constructor(callMethod: string, message: string) {
        super(DiscordEventService.name, callMethod, message)
    }
}
