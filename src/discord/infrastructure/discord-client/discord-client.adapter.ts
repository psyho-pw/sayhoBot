import { AudioPlayer, generateDependencyReport, VoiceConnection } from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionResponse,
  Message,
  REST,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { ChannelState, ChannelStateAdapter } from './channel-state.adapter';
import { PlayerAdapter } from './player.adapter';
import { HandleDiscordError } from '../../../common/aop';
import { DiscordException } from '../../../common/exceptions/discord.exception';
import { ILoggerService, LoggerServiceKey } from '../../../common/modules/logger/logger.interface';
import { SongService } from '../../../song/song.service';
import { Song } from '../../domain/entities/song.entity';
import { IStreamProvider, StreamProviderPort } from '../../domain/ports/stream-provider.port';

@Injectable()
export class DiscordClientAdapter {
  discordBotClient: Client;
  public commands: Collection<string, any> = new Collection();
  private rest: REST;

  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    private readonly songService: SongService,
    private readonly stateAdapter: ChannelStateAdapter,
    private readonly playerAdapter: PlayerAdapter,
    @Inject(StreamProviderPort) private readonly streamProvider: IStreamProvider,
    @Inject(LoggerServiceKey) private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(DiscordClientAdapter.name);
  }

  @HandleDiscordError()
  public async init(): Promise<void> {
    this.discordBotClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.logger.verbose({
      ctx: this.init.name,
      info: generateDependencyReport(),
    });

    try {
      this.rest = new REST({ version: '10' }).setToken(this.configService.discordConfig.TOKEN);
      await this.discordBotClient.login(this.configService.discordConfig.TOKEN);
      this.logger.verbose({ ctx: this.init.name, info: 'DiscordBotClient instance initialized' });
    } catch (err) {
      console.error(err);
      throw new DiscordException('login failed', 'client');
    }
  }

  public formatMessageEmbed(
    url: string,
    queuedCount: number,
    queueLength: number,
    title: string,
    thumbnail: string,
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#ffffff')
      .setTitle('Queued')
      .setURL(url)
      .setDescription(`Queued ${queuedCount} track${queuedCount === 1 ? '' : 's'}`)
      .addFields([
        { name: 'Total Queue', value: `${queueLength} tracks` },
        {
          name: 'Track',
          value: `:musical_note:  ${title} :musical_note: has been added to queue`,
        },
      ])
      .setThumbnail(thumbnail);
  }

  @HandleDiscordError()
  public async playSong(message: Message | ChatInputCommandInteraction): Promise<Message | void> {
    const guildId = message.guildId;
    if (!guildId) throw new DiscordException('guildId not specified', 'client');

    const channel = message.channel as TextChannel;
    const musicQueue = this.stateAdapter.getMusicQueue(guildId);
    if (!musicQueue.length) return channel.send('No Queue found');

    const currentSong = musicQueue[0];

    const resource = await this.streamProvider.createAudioResourceFromUrl(currentSong.url);

    if (!message.guild) {
      return channel.send(`Error occurred on joining voice channel\nguild is not defined`);
    }

    // Get the actual voice channel from the guild
    const voiceChannel = message.guild.channels.cache.get(currentSong.voiceChannel.id) as
      | VoiceChannel
      | StageChannel
      | undefined;
    if (!voiceChannel) {
      return channel.send('Cannot find voice channel');
    }

    const connection = this.playerAdapter.getOrCreateConnection(
      guildId,
      message.guild,
      voiceChannel,
    );

    const player = this.playerAdapter.getOrCreatePlayer({ message, guildId, channel }, async () => {
      await this.playSong(message);
    });

    try {
      this.playerAdapter.play(player, connection, resource);
    } catch (err: any) {
      this.logger.error({
        ctx: this.playSong.name,
        info: err,
      });
      await channel.send('Error occurred on player.play()');
      throw new DiscordException(err.message, 'client');
    } finally {
      await this.songService.create({
        url: currentSong.url,
        title: currentSong.title,
      });
    }
  }

  // Delegate methods to ChannelStateAdapter
  public deleteCurrentInfoMsg(guildId: string): void {
    this.stateAdapter.deleteCurrentInfoMsg(guildId);
  }

  public setDeleteQueue(guildId: string, message: Message | InteractionResponse): void {
    if (!guildId.length) {
      throw new DiscordException('guildId not specified', 'client', this.setDeleteQueue.name);
    }
    this.stateAdapter.addToDeleteQueue(guildId, message);
  }

  public removeFromDeleteQueue(guildId: string, id: string): void {
    this.stateAdapter.removeFromDeleteQueue(guildId, id);
  }

  public removeGuildFromDeleteQueue(guildId: string): void {
    this.stateAdapter.clearDeleteQueue(guildId);
  }

  public getConnection(guildId: string): VoiceConnection | null {
    return this.stateAdapter.getConnection(guildId);
  }

  public setConnection(guildId: string, conn: VoiceConnection): void {
    this.stateAdapter.setConnection(guildId, conn);
  }

  public deleteConnection(guildId: string): void {
    this.stateAdapter.deleteConnection(guildId);
  }

  public getTotalMusicQueue(): Map<string, ChannelState> {
    // Return a new map with all states
    const result = new Map<string, ChannelState>();
    // This would need proper implementation based on state adapter
    return result;
  }

  public getMusicQueue(guildId: string): readonly Song[] {
    return this.stateAdapter.getMusicQueue(guildId);
  }

  public setMusicQueue(guildId: string, songs: Song[]): void {
    this.stateAdapter.clearQueue(guildId);
    this.stateAdapter.addSongsToQueue(guildId, songs);
  }

  public shuffleMusicQueue(guildId: string): void {
    this.stateAdapter.shuffleMusicQueue(guildId);
  }

  public getIsPlaying(guildId: string): boolean {
    return this.stateAdapter.getIsPlaying(guildId);
  }

  public setIsPlaying(guildId: string, isPlaying: boolean): void {
    this.stateAdapter.setIsPlaying(guildId, isPlaying);
  }

  public getVolume(guildId: string): number {
    return this.stateAdapter.getVolume(guildId);
  }

  public setVolume(guildId: string, volume: number): void {
    this.stateAdapter.setVolume(guildId, volume);
  }

  public getPlayer(guildId: string): AudioPlayer {
    const player = this.stateAdapter.getPlayer(guildId);
    if (!player) throw new DiscordException('No player found', 'client', this.getPlayer.name);
    return player;
  }

  public setPlayer(guildId: string, player: AudioPlayer): void {
    this.stateAdapter.setPlayer(guildId, player);
  }

  public deletePlayer(guildId: string): void {
    this.stateAdapter.deletePlayer(guildId);
  }

  public getClient(): Client {
    return this.discordBotClient;
  }

  public getUser(): string | undefined {
    return this.discordBotClient.user?.tag;
  }

  public get Rest(): REST {
    return this.rest;
  }

  public set Rest(rest: REST) {
    this.rest = rest;
  }
}
