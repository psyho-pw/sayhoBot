import {GeneralException} from '../general.exception'
import {DiscordCommandService} from 'src/discord/services/discord.command.service'

export class DiscordCommandException extends GeneralException {
    constructor(callMethod: string, message: string) {
        super(DiscordCommandService.name, callMethod, message)
    }
}
