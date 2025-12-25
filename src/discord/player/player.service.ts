import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  DiscordGatewayAdapterCreator,
  joinVoiceChannel,
  VoiceConnection,
} from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  Message,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ILoggerService, LoggerServiceKey } from 'src/common/logger/logger.interface';
import { ConfigServiceKey } from 'src/config/config.service';
import { IConfigService } from 'src/config/config.type';
import { HandleDiscordError } from '../../common/aop';
import { DiscordException } from '../../common/exceptions/discord.exception';
import { DiscordNotificationService } from '../notification/notification.service';
import { ChannelStateManager } from '../state/channel-state.manager';
export interface PlayContext {
  message: Message | ChatInputCommandInteraction;
  guildId: string;
  channel: TextChannel;
}

@Injectable()
export class PlayerService {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    private readonly notificationService: DiscordNotificationService,
    private readonly stateManager: ChannelStateManager,
    @Inject(LoggerServiceKey) private readonly logger: ILoggerService,
  ) {}

  private async playerWrapper(handler: () => Promise<any>, guildId: string) {
    try {
      await handler();
    } catch (err) {
      const player = this.stateManager.getPlayer(guildId);
      if (!player)
        return this.logger.error({ ctx: this.playerWrapper.name, info: 'player not found' });
      player.emit('error', err);
    }
  }

  @HandleDiscordError({ bubble: true })
  private async handlePlaying(context: PlayContext) {
    const { guildId, channel } = context;
    if (this.stateManager.getIsPlaying(guildId)) return;

    const musicQueue = this.stateManager.getMusicQueue(guildId);
    if (!musicQueue.length) throw new DiscordException('Queue does not exist', 'client');

    const currentItem = musicQueue[0];
    if (!currentItem) throw new DiscordException('Queue item is corrupted', 'client');

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`:: Currently playing :arrow_forward: ::`)
      .setURL(currentItem.url)
      .setThumbnail(currentItem.thumbnail)
      .setDescription(`${currentItem.title} (${currentItem.duration})`);

    const msg = await channel.send({ embeds: [embed] });
    this.stateManager.setCurrentInfoMsg(guildId, msg);
    this.logger.info({
      ctx: this.handlePlaying.name,
      info: currentItem,
      message: `Currently playing ${currentItem.title}`,
    });

    this.stateManager.setIsPlaying(guildId, true);
  }

  @HandleDiscordError({ bubble: true })
  private async handleIdle(context: PlayContext, onPlayNext: () => Promise<void>) {
    const { guildId, channel } = context;

    this.stateManager.deleteCurrentInfoMsg(guildId);
    const musicQueue = this.stateManager.getMusicQueue(guildId);
    if (!musicQueue.length) throw new DiscordException('Queue does not exist', 'client');

    this.stateManager.setIsPlaying(guildId, false);

    if (musicQueue.length > 1) {
      this.logger.debug({ ctx: this.handleIdle.name, info: 'queue length is not zero' });
      musicQueue.shift();
      this.stateManager.setMusicQueue(guildId, musicQueue);
      await onPlayNext();
      return;
    }

    this.logger.debug({ ctx: this.handleIdle.name, info: 'queue empty' });
    setTimeout(() => {
      const currentQueue = this.stateManager.getMusicQueue(guildId);
      if (currentQueue.length <= 1 && !this.stateManager.getIsPlaying(guildId)) {
        this.stateManager.setMusicQueue(guildId, []);
        this.stateManager.setIsPlaying(guildId, false);
        this.stateManager.setVolume(guildId, 1);

        channel
          .send(`Disconnected from channel due to inactivity`)
          .then((msg) =>
            setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT),
          );
        this.stateManager.getConnection(guildId)?.destroy();
        this.stateManager.deleteConnection(guildId);
      }
    }, 180000);
  }

  private async handleError(err: any, context: PlayContext) {
    const { guildId, channel } = context;

    this.logger.error({ ctx: this.handleError.name, info: err, message: 'fatal error occurred' });

    const musicQueue = this.stateManager.getMusicQueue(guildId);
    this.stateManager.setIsPlaying(guildId, false);
    this.stateManager.deleteCurrentInfoMsg(guildId);

    if (!musicQueue.length) {
      return channel
        .send('Queue does not exist')
        .then((msg) =>
          setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT),
        );
    }

    if (err.message === 'Status code: 410') {
      return channel
        .send(`Unplayable Song: ${musicQueue[0].title}`)
        .then((msg) =>
          setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT),
        );
    }

    await channel
      .send('fatal error occurred, skipping ,,')
      .then((msg) =>
        setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT),
      );

    const exception = new DiscordException(err.message, 'client', 'player');
    exception.stack = err.stack;
    await this.notificationService.sendErrorReport(exception);
  }

  public createPlayer(context: PlayContext, onPlayNext: () => Promise<void>): AudioPlayer {
    const { guildId } = context;
    const player: AudioPlayer = createAudioPlayer();

    player
      .on(AudioPlayerStatus.Playing, () =>
        this.playerWrapper(() => this.handlePlaying(context), guildId),
      )
      .on(AudioPlayerStatus.Idle, () =>
        this.playerWrapper(() => this.handleIdle(context, onPlayNext), guildId),
      )
      .on('error', async (err) => {
        await this.handleError(err, context);
      });

    return player;
  }

  public getOrCreatePlayer(context: PlayContext, onPlayNext: () => Promise<void>): AudioPlayer {
    const { guildId } = context;
    let player = this.stateManager.getPlayer(guildId);

    if (!player) {
      player = this.createPlayer(context, onPlayNext);
      this.stateManager.setPlayer(guildId, player);
    }

    return player;
  }

  public joinVoiceChannel(
    guild: Guild,
    voiceChannel: VoiceChannel | StageChannel,
  ): VoiceConnection {
    return joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });
  }

  public getOrCreateConnection(
    guildId: string,
    guild: Guild,
    voiceChannel: VoiceChannel | StageChannel,
  ): VoiceConnection {
    let connection = this.stateManager.getConnection(guildId);

    if (!connection) {
      connection = this.joinVoiceChannel(guild, voiceChannel);
      this.stateManager.setConnection(guildId, connection);
      this.stateManager.setIsPlaying(guildId, false);
      this.stateManager.setVolume(guildId, 1);
    }

    return connection;
  }

  public play(player: AudioPlayer, connection: VoiceConnection, resource: AudioResource): void {
    player.play(resource);
    connection.subscribe(player);
  }
}
