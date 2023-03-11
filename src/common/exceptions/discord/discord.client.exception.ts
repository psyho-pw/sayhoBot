import {GeneralException} from '../general.exception'
import {DiscordClientService} from 'src/discord/services/discord.client.service'

export class DiscordClientException extends GeneralException {
    constructor(callMethod: string, message: string) {
        super(DiscordClientService.name, callMethod, message)
    }
}
