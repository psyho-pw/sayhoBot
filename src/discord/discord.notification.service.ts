import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { EmbedBuilder, WebhookClient } from 'discord.js';
import { APIEmbedField } from 'discord-api-types/v10';
import {
  ConfigServiceKey,
  TypedConfigService,
} from 'src/config/config.service';
import { DiscordException } from '../common/exceptions/discord.exception';
import { GeneralException } from '../common/exceptions/general.exception';
import {
  LoggerServiceKey,
  ILoggerService,
} from '../common/logger/logger.interface';

@Injectable()
export class DiscordNotificationService {
  #webhookClient: WebhookClient;
  #webhookId: string;
  #webhookToken: string;

  private async getCredentials() {
    const config = this.configService.discordConfig;

    if (!this.#webhookId || !this.#webhookToken) {
      const credentials = await this.httpService.axiosRef.get(config.WEBHOOK_URL);
      if (!credentials.data.id || !credentials.data.token) {
        throw new DiscordException(
          'webhook credential fetch error',
          'notification',
          this.getCredentials.name,
        );
      }

      this.#webhookId = credentials.data.id;
      this.#webhookToken = credentials.data.token;
    }
  }

  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: TypedConfigService,
    private readonly httpService: HttpService,
    @Inject(LoggerServiceKey)
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(DiscordNotificationService.name);
    this.getCredentials()
      .then(() =>
        this.logger.verbose({
          ctx: 'constructor',
          info: '✅  DiscordNotificationModule instance initialized',
        }),
      )
      .catch((error) =>
        this.logger.error({
          ctx: 'constructor',
          info: error,
        }),
      );
  }

  public async sendMessage(
    message: string,
    title?: string,
    additional?: Array<APIEmbedField>,
  ): Promise<void> {
    await this.getCredentials();
    if (!this.#webhookClient)
      this.#webhookClient = new WebhookClient({
        id: this.#webhookId,
        token: this.#webhookToken,
      });

    const embed = new EmbedBuilder()
      .setTitle(title ? title : 'Error Report')
      .setColor('#ff0000')
      .addFields([{ name: 'Message', value: message }]);

    if (additional) embed.addFields([...additional]);

    await this.#webhookClient.send({ embeds: [embed] });
  }

  public async sendErrorReport(err: any) {
    if (err instanceof GeneralException) {
      await this.sendMessage(err.message, err.getCalledFrom(), [
        { name: 'stack', value: (err.stack || '').substring(0, 1024) },
      ]);
      return;
    }
    await this.sendMessage(err.message, 'Unhandled Error', [
      { name: 'stack', value: (err.stack || '').substring(0, 1024) },
    ]);
  }
}
