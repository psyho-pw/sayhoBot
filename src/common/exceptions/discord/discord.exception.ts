import {GeneralException} from '../general.exception'
import {DiscordService} from 'src/discord/services/discord.service'

export class DiscordException extends GeneralException {
    constructor(message: string, callMethod?: string) {
        super(DiscordService.name, callMethod ?? '', message)
    }
}
