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
import { IConfigService } from 'src/config/config.type';
import { HandleDiscordError } from '../../common/aop';
import { DiscordException } from '../../common/exceptions/discord.exception';
import { LoggerServiceKey, ILoggerService } from '../../common/logger/logger.interface';
import { ConfigServiceKey } from '../../config/config.service';
import { SongService } from '../../song/song.service';
import { Song } from '../discord.model';
import { Video } from '../discord.type';
import { PlayerService, PlayContext } from '../player/player.service';
import { StreamService } from '../player/stream.service';
import { ChannelState } from '../state/channel-state';
import { ChannelStateManager } from '../state/channel-state.manager';

@Injectable()
export class DiscordClientService {
  discordBotClient: Client;
  public commands: Collection<string, any> = new Collection();
  private rest: REST;

  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
    private readonly songService: SongService,
    private readonly stateManager: ChannelStateManager,
    private readonly playerService: PlayerService,
    private readonly streamService: StreamService,
    @Inject(LoggerServiceKey)
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(DiscordClientService.name);
  }

  @HandleDiscordError()
  public async init() {
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
      this.logger.verbose({
        ctx: this.init.name,
        info: 'DiscordBotClient instance initialized',
      });
    } catch (err) {
      console.error(err);
      throw new DiscordException('login failed', 'client');
    }
  }

  private formatDuration(durationObj: any) {
    return `${durationObj.hours ? durationObj.hours + ':' : ''}${
      durationObj.minutes ? durationObj.minutes : '00'
    }:${
      durationObj.seconds < 10
        ? '0' + durationObj.seconds
        : durationObj.seconds
          ? durationObj.seconds
          : '00'
    }`;
  }

  public formatVideo(video: Video, voiceChannel: VoiceChannel | StageChannel): Song | null {
    if (video.title === 'Deleted video') return null;

    let duration: string | null =
      video.duration !== undefined ? this.formatDuration(video.duration) : null;
    if (duration === '00:00') duration = 'Live Stream';

    const song = new Song();
    song.url = video.url;
    song.title = video.raw.snippet.title;
    song.duration = duration;
    song.thumbnail = video.thumbnails.high.url;
    song.voiceChannel = voiceChannel;
    song.video = video;
    song.videoId = video.raw.id;

    return song;
  }

  public formatMessageEmbed(
    url: string,
    queuedCount: number,
    queueLength: number,
    title: string,
    thumbnail: string,
  ) {
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
  public async playSong(message: Message | ChatInputCommandInteraction) {
    const guildId = message.guildId;
    if (!guildId) throw new DiscordException('guildId not specified', 'client');

    const channel = message.channel as TextChannel;
    const musicQueue = this.stateManager.getMusicQueue(guildId);
    if (!musicQueue.length) return channel.send('No Queue found');

    const video = await musicQueue[0].video.fetch();
    const nextSong: Song | null = this.formatVideo(video, musicQueue[0].voiceChannel);
    if (!nextSong) return channel.send('Cannot fetch next song');

    musicQueue[0] = nextSong;
    this.stateManager.setMusicQueue(guildId, musicQueue);

    const resource = await this.streamService.createAudioResourceFromUrl(musicQueue[0].url);

    if (!message.guild)
      return channel.send(`Error occurred on joining voice channel\nguild is not defined`);

    const connection = this.playerService.getOrCreateConnection(
      guildId,
      message.guild,
      musicQueue[0].voiceChannel,
    );

    const context: PlayContext = { message, guildId, channel };
    const player = this.playerService.getOrCreatePlayer(context, async () => {
      await this.playSong(message);
    });

    try {
      this.playerService.play(player, connection, resource);
    } catch (err: any) {
      this.logger.error({
        ctx: this.playSong.name,
        info: err,
      });
      await channel.send('Error occurred on player.play()');
      throw new DiscordException(err.message, 'client');
    } finally {
      await this.songService.create({
        url: nextSong.url,
        title: nextSong.title,
      });
    }
  }

  // Delegate methods to ChannelStateManager
  public deleteCurrentInfoMsg(guildId: string): void {
    this.stateManager.deleteCurrentInfoMsg(guildId);
  }

  public setDeleteQueue(guildId: string, message: Message | InteractionResponse): void {
    if (!guildId.length)
      throw new DiscordException('guildId not specified', 'client', this.setDeleteQueue.name);
    this.stateManager.addToDeleteQueue(guildId, message);
  }

  public removeFromDeleteQueue(guildId: string, id: string): void {
    this.stateManager.removeFromDeleteQueue(guildId, id);
  }

  public removeGuildFromDeleteQueue(guildId: string): void {
    this.stateManager.clearDeleteQueue(guildId);
  }

  public getConnection(guildId: string): VoiceConnection | null {
    return this.stateManager.getConnection(guildId);
  }

  public setConnection(guildId: string, conn: VoiceConnection): void {
    this.stateManager.setConnection(guildId, conn);
  }

  public deleteConnection(guildId: string): void {
    this.stateManager.deleteConnection(guildId);
  }

  public getTotalMusicQueue(): Map<string, ChannelState> {
    return this.stateManager.getAll();
  }

  public getMusicQueue(guildId: string): Song[] {
    return this.stateManager.getMusicQueue(guildId);
  }

  public setMusicQueue(guildId: string, queue: Song[]): void {
    this.stateManager.setMusicQueue(guildId, queue);
  }

  public shuffleMusicQueue(guildId: string): void {
    this.stateManager.shuffleMusicQueue(guildId);
  }

  public getIsPlaying(guildId: string): boolean {
    return this.stateManager.getIsPlaying(guildId);
  }

  public setIsPlaying(guildId: string, isPlaying: boolean): void {
    this.stateManager.setIsPlaying(guildId, isPlaying);
  }

  public getVolume(guildId: string): number {
    return this.stateManager.getVolume(guildId);
  }

  public setVolume(guildId: string, volume: number): void {
    this.stateManager.setVolume(guildId, volume);
  }

  public getPlayer(guildId: string): AudioPlayer {
    const player = this.stateManager.getPlayer(guildId);
    if (!player) throw new DiscordException('No player found', 'client', this.getPlayer.name);
    return player;
  }

  public setPlayer(guildId: string, player: AudioPlayer): void {
    this.stateManager.setPlayer(guildId, player);
  }

  public deletePlayer(guildId: string): void {
    this.stateManager.deletePlayer(guildId);
  }

  public getClient() {
    return this.discordBotClient;
  }

  public getUser() {
    return this.discordBotClient.user?.tag;
  }

  public get Rest() {
    return this.rest;
  }

  public set Rest(rest: REST) {
    this.rest = rest;
  }
}
