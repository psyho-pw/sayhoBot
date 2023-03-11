import {GeneralException} from '../general.exception'
import {DiscordService} from 'src/discord/services/discord.service'

export class DiscordException extends GeneralException {
    constructor(callMethod: string, message: string) {
        super(DiscordService.name, callMethod, message)
    }
}
