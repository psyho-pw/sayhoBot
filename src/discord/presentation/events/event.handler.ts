// @ts-ignore
import { Inject, Injectable } from '@nestjs/common';
import {
  Channel,
  Client,
  CommandInteraction,
  Guild,
  GuildMember,
  Interaction,
  Message,
  Snowflake,
  StringSelectMenuInteraction,
  VoiceState,
} from 'discord.js';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { LoggerServiceKey, ILoggerService } from 'src/common/modules/logger/logger.interface';
import { HandleDiscordError } from '../../../common/aop';
import { DiscordException } from '../../../common/exceptions/discord.exception';
import { SearchVideoUseCase } from '../../application/search-video.usecase';
import { VoiceChannelInfo } from '../../domain/entities/song.entity';
import { DiscordClientAdapter } from '../../infrastructure/discord-client/discord-client.adapter';

@Injectable()
export class EventHandler {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
    private readonly discordClient: DiscordClientAdapter,
    private readonly searchVideoUseCase: SearchVideoUseCase,
    @Inject(LoggerServiceKey)
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(EventHandler.name);
  }

  @HandleDiscordError()
  public async ready(_client: Client): Promise<void> {
    this.logger.verbose({
      ctx: this.ready.name,
      info: `Logged in as ${this.discordClient.getUser()}`,
    });
    this.logger.verbose({
      ctx: this.ready.name,
      info: `SayhoBot server ready`,
    });
  }

  @HandleDiscordError()
  private async commandHandler(interaction: CommandInteraction): Promise<void> {
    const command = this.discordClient.commands.get(interaction.commandName);
    if (!command) return;

    this.logger.info({
      ctx: this.commandHandler.name,
      info: `request:: command: ${interaction.commandName}, user: ${interaction.user.tag}`,
    });

    try {
      await command(interaction);
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ ctx: this.commandHandler.name, info: err });
      }
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      });
    }
  }

  @HandleDiscordError()
  private async selectMenuHandler(interaction: StringSelectMenuInteraction): Promise<void> {
    const selectedUrl = interaction.values[0];
    const guild: Guild | undefined = this.discordClient
      .getClient()
      .guilds.cache.get(interaction.guildId ?? '');
    const member: GuildMember | undefined = guild?.members.cache.get(
      interaction.member?.user.id as Snowflake,
    );

    if (!guild) throw new DiscordException('guild is not specified', 'event');
    if (!member?.voice.channel) {
      await interaction.reply('Cannot find channel');
      return;
    }

    const voiceChannelInfo: VoiceChannelInfo = {
      id: member.voice.channel.id,
      guildId: guild.id,
      name: member.voice.channel.name,
    };

    const song = await this.searchVideoUseCase.getByUrl(selectedUrl, voiceChannelInfo);
    if (!song) {
      await interaction.reply('Video is either private or it does not exist');
      return;
    }

    const musicQueue = this.discordClient.getMusicQueue(guild.id);
    (musicQueue as any[]).push(song);
    this.discordClient.setMusicQueue(guild.id, musicQueue as any);

    this.logger.info({ ctx: this.selectMenuHandler.name, info: `${song.title} added to queue` });
    this.logger.info({
      ctx: this.selectMenuHandler.name,
      info: `queue length: ${musicQueue.length}`,
    });

    const reply = await interaction.reply({
      embeds: [
        this.discordClient.formatMessageEmbed(
          selectedUrl,
          1,
          musicQueue.length,
          song.title,
          song.thumbnail,
        ),
      ],
    });
    setTimeout(() => reply.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
    this.discordClient.removeFromDeleteQueue(guild.id, interaction.message.id);

    if (!this.discordClient.getIsPlaying(guild.id)) {
      await this.discordClient.playSong(interaction.message);
    }
  }

  @HandleDiscordError()
  public async interactionCreate(interaction: Interaction): Promise<void> {
    if (interaction.isStringSelectMenu()) {
      await this.selectMenuHandler(interaction);
    } else if (interaction.isChatInputCommand()) {
      await this.commandHandler(interaction);
    }
  }

  @HandleDiscordError()
  public async messageCreate(message: Message): Promise<void> {
    this.logger.info({ ctx: this.messageCreate.name, info: `message received ${message.content}` });

    if (message.author.bot) return;

    if (!message.content.startsWith(this.configService.discordConfig.COMMAND_PREFIX)) {
      this.logger.verbose({
        ctx: this.messageCreate.name,
        info: `doesn't match prefix '${this.configService.discordConfig.COMMAND_PREFIX}' skipping...`,
      });
      return;
    }

    const args = message.content
      .slice(this.configService.discordConfig.COMMAND_PREFIX.length)
      .trim()
      .split(/ +/g);
    const commandName = args.shift()?.toLowerCase() ?? '';

    this.logger.info({ ctx: this.messageCreate.name, info: `command: ${commandName}` });

    const command = this.discordClient.commands.get(commandName);
    if (!command) {
      this.logger.error({
        ctx: this.messageCreate.name,
        info: `command ${commandName} does not exist`,
      });
      return;
    }

    try {
      await command(message);
      await message.delete();
    } catch (err) {
      await message.reply({ content: 'There was an error while executing this command' });
      throw err;
    }
  }

  @HandleDiscordError()
  public async voiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (oldState.channelId !== (oldState.guild.members.me?.voice.channelId || newState.channel)) {
      return;
    }

    if (!((oldState.channel?.members.size ?? 1) - 1)) {
      setTimeout(() => {
        if (!((oldState.channel?.members.size ?? 1) - 1)) {
          const channel = oldState.client.channels.cache
            .filter((ch: Channel) => {
              if (!ch.isTextBased() || ch.isDMBased()) return false;
              return (ch as any).guildId === oldState.guild.id && (ch as any).name === '일반';
            })
            .first() as any;

          if (channel) {
            channel.send('바윙~').then((msg: Message) => {
              this.discordClient.setMusicQueue(newState.guild.id, []);
              this.discordClient.setIsPlaying(newState.guild.id, false);
              this.discordClient.setVolume(newState.guild.id, 1);
              this.discordClient.deleteCurrentInfoMsg(newState.guild.id);
              this.discordClient.removeGuildFromDeleteQueue(newState.guild.id);
              this.discordClient.deletePlayer(newState.guild.id);
              this.discordClient.getConnection(newState.guild.id)?.destroy();
              this.discordClient.deleteConnection(newState.guild.id);
              setTimeout(
                () => msg.delete(),
                this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT,
              );
            });
          }
        }
      }, 5000);
    }
  }
}
