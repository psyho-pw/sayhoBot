import {Inject, Injectable} from '@nestjs/common'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {HttpService} from '@nestjs/axios'
import {EmbedBuilder, WebhookClient} from 'discord.js'
import {APIEmbedField} from 'discord-api-types/v10'
import {AppConfigService} from 'src/config/config.service'
import {DiscordNotificationException} from '../../common/exceptions/discord/discord.notification.exception'

@Injectable()
export class DiscordNotificationService {
    #webhookClient: WebhookClient
    #webhookId: string
    #webhookToken: string

    async #getCredentials() {
        const config = this.configService.getDiscordConfig()

        if (!this.#webhookId || !this.#webhookToken) {
            const credentials = await this.httpService.axiosRef.get(config.WEBHOOK_URL)
            if (!credentials.data.id || !credentials.data.token) {
                throw new DiscordNotificationException(this.#getCredentials.name, 'webhook credential fetch error')
            }

            this.#webhookId = credentials.data.id
            this.#webhookToken = credentials.data.token
        }
    }

    constructor(
        private readonly configService: AppConfigService,
        private readonly httpService: HttpService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {
        this.#getCredentials()
            .then(() => this.logger.verbose('✅  DiscordNotificationModule instance initialized'))
            .catch(error => this.logger.error('error caught', error))
    }

    async sendMessage(message: string, title?: string, additional?: Array<APIEmbedField>): Promise<void> {
        await this.#getCredentials()
        if (!this.#webhookClient) this.#webhookClient = new WebhookClient({id: this.#webhookId, token: this.#webhookToken})

        const embed = new EmbedBuilder()
            .setTitle(title ? title : 'Error Report')
            .setColor('#ff0000')
            .addFields([{name: 'Message', value: message}])

        if (additional) embed.addFields([...additional])

        await this.#webhookClient.send({embeds: [embed]})
    }
}
