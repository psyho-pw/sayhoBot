import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { APIEmbedField } from 'discord-api-types/v10';
import { EmbedBuilder, WebhookClient } from 'discord.js';
import { ConfigServiceKey, TypedConfigService } from 'src/common/modules/config/config.service';
import { DiscordException } from '../../../common/exceptions/discord.exception';
import { GeneralException } from '../../../common/exceptions/general.exception';
import { ILoggerService, LoggerServiceKey } from '../../../common/modules/logger/logger.interface';
import { EmbedField, INotificationService } from '../../domain/ports/notification.port';

@Injectable()
export class NotificationAdapter implements INotificationService {
  #webhookClient: WebhookClient;
  #webhookId: string;
  #webhookToken: string;

  constructor(
    @Inject(ConfigServiceKey) private readonly configService: TypedConfigService,
    private readonly httpService: HttpService,
    @Inject(LoggerServiceKey) private readonly logger: ILoggerService,
  ) {
    this.initCredentials();
  }

  private async initCredentials(): Promise<void> {
    try {
      await this.getCredentials();
      this.logger.verbose({
        ctx: this.initCredentials.name,
        info: '✅  NotificationAdapter initialized',
      });
    } catch (error) {
      this.logger.error({ ctx: this.initCredentials.name, info: error });
    }
  }

  private async getCredentials(): Promise<void> {
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
      this.#webhookClient = new WebhookClient({ id: this.#webhookId, token: this.#webhookToken });
    }
  }

  async sendMessage(message: string, title?: string, additional?: EmbedField[]): Promise<void> {
    await this.getCredentials();

    const embed = new EmbedBuilder()
      .setTitle(title ?? 'Error Report')
      .setColor('#ff0000')
      .addFields([{ name: 'Message', value: message }]);

    if (additional) {
      embed.addFields(additional as APIEmbedField[]);
    }

    await this.#webhookClient.send({ embeds: [embed] });
  }

  async sendErrorReport(error: Error): Promise<void> {
    if (error instanceof GeneralException) {
      await this.sendMessage(error.message, error.getCalledFrom(), [
        { name: 'stack', value: (error.stack ?? '').substring(0, 1024) },
      ]);
      return;
    }

    await this.sendMessage(error.message, 'Unhandled Error', [
      { name: 'stack', value: (error.stack ?? '').substring(0, 1024) },
    ]);
  }
}
