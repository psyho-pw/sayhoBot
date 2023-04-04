import {GeneralException} from '../general.exception'
import {DiscordCommandService} from 'src/discord/services/discord.command.service'

export class DiscordCommandException extends GeneralException {
    constructor(message: string, callMethod?: string) {
        super(DiscordCommandService.name, callMethod ?? '', message)
    }
}
