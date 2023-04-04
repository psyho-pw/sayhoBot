import {GeneralException} from '../general.exception'
import {DiscordClientService} from 'src/discord/services/discord.client.service'

export class DiscordClientException extends GeneralException {
    constructor(message: any, callMethod?: any) {
        super(DiscordClientService.name, callMethod ?? '', message)
    }
}
