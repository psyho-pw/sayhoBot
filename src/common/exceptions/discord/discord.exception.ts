import {GeneralException} from '../general.exception'
import {DiscordService} from 'src/discord/discord.service'

export class DiscordException extends GeneralException {
    constructor(message: string, callMethod?: string) {
        super(DiscordService.name, callMethod ?? '', message)
    }
}
