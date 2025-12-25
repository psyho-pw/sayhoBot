//@ts-ignore
import { Inject, Injectable } from '@nestjs/common';
import { APIEmbedField } from 'discord-api-types/v10';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionResponse,
  Message,
  PermissionFlagsBits,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { HandleDiscordError } from '../../../common/aop';
import { DiscordException } from '../../../common/exceptions/discord.exception';
import { ILoggerService, LoggerServiceKey } from '../../../common/modules/logger/logger.interface';
import { SearchVideoUseCase } from '../../application/search-video.usecase';
import { VoiceChannelInfo } from '../../domain/entities/song.entity';
import { IYoutubeSearch, YoutubeSearchPort } from '../../domain/ports/youtube-search.port';
import { DiscordClientAdapter } from '../../infrastructure/discord-client/discord-client.adapter';

interface ParsedPlayCommand {
  content: string;
  voiceChannel: VoiceChannel | StageChannel;
}

interface SelectListItem {
  label: string;
  description: string;
  value: string;
}

@Injectable()
export class CommandHandler {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    private readonly discordClient: DiscordClientAdapter,
    private readonly searchVideoUseCase: SearchVideoUseCase,
    @Inject(YoutubeSearchPort) private readonly youtubeSearch: IYoutubeSearch,
    @Inject(LoggerServiceKey) private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(CommandHandler.name);
  }

  private getVoiceChannelFromPayload(
    payload: Message | ChatInputCommandInteraction,
  ): VoiceChannel | StageChannel | null {
    if (payload instanceof Message) {
      return payload.member?.voice.channel ?? null;
    }
    return payload.guild?.members.cache.get(payload.member?.user.id ?? '')?.voice.channel ?? null;
  }

  private toVoiceChannelInfo(
    voiceChannel: VoiceChannel | StageChannel,
    guildId: string,
  ): VoiceChannelInfo {
    return {
      id: voiceChannel.id,
      guildId,
      name: voiceChannel.name,
    };
  }

  @HandleDiscordError({ bubble: true })
  private async playlistHandler(
    url: string,
    voiceChannel: VoiceChannel | StageChannel,
    message: Message | ChatInputCommandInteraction,
  ): Promise<void> {
    this.logger.info({ ctx: this.playlistHandler.name, info: 'Playlist detected' });
    if (!message.guildId) throw new DiscordException('guild is not specified', 'command');

    const voiceChannelInfo = this.toVoiceChannelInfo(voiceChannel, message.guildId);
    const songs = await this.searchVideoUseCase.getPlaylist(url, voiceChannelInfo);
    const messageChannel = message.channel as TextChannel;

    if (!songs.length) {
      const msg = await messageChannel.send('No videos found');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    // Add songs to queue using legacy interface for now
    const musicQueue = this.discordClient.getMusicQueue(message.guildId);
    for (const song of songs) {
      (musicQueue as any[]).push(song);
    }
    this.discordClient.setMusicQueue(message.guildId, musicQueue as any);

    this.logger.info({
      ctx: this.playlistHandler.name,
      info: `queue length: ${musicQueue.length}`,
    });

    const reply = await message.reply({
      embeds: [
        this.discordClient.formatMessageEmbed(
          url,
          songs.length,
          musicQueue.length,
          songs[0]?.title ?? 'Unknown',
          songs[0]?.thumbnail ?? '',
        ),
      ],
    });
    setTimeout(() => reply.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);

    if (!this.discordClient.getIsPlaying(message.guildId)) {
      await this.discordClient.playSong(message);
    }
  }

  @HandleDiscordError({ bubble: true })
  private async singleVidHandler(
    url: string,
    voiceChannel: VoiceChannel | StageChannel,
    message: Message | ChatInputCommandInteraction,
  ): Promise<void> {
    this.logger.info({ ctx: this.singleVidHandler.name, info: 'Single video/song detected' });
    if (!message.guildId) throw new DiscordException('guild is not specified', 'command');

    const voiceChannelInfo = this.toVoiceChannelInfo(voiceChannel, message.guildId);
    const song = await this.searchVideoUseCase.getByUrl(url, voiceChannelInfo);

    if (!song) {
      const msg = await message.reply('Video is either private or it does not exist');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    const musicQueue = this.discordClient.getMusicQueue(message.guildId);
    (musicQueue as any[]).push(song);
    this.discordClient.setMusicQueue(message.guildId, musicQueue as any);

    this.logger.info({
      ctx: this.singleVidHandler.name,
      info: `Queue length: ${musicQueue.length}`,
    });

    const reply = await message.reply({
      embeds: [
        this.discordClient.formatMessageEmbed(
          url,
          1,
          musicQueue.length,
          song.title,
          song.thumbnail,
        ),
      ],
    });
    setTimeout(() => reply.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);

    if (!this.discordClient.getIsPlaying(message.guildId)) {
      await this.discordClient.playSong(message);
    }
  }

  @HandleDiscordError({ bubble: true })
  private async searchHandler(
    searchTxt: string,
    payload: Message | ChatInputCommandInteraction,
  ): Promise<void> {
    this.logger.info({ ctx: this.searchHandler.name, info: 'Search detected' });

    searchTxt = searchTxt.trim();
    const results = await this.youtubeSearch.searchVideos(searchTxt, 10);

    const list: SelectListItem[] = results.map((item) => ({
      label: item.title.slice(0, 100),
      description: item.url.slice(0, 100),
      value: item.url,
    }));

    const selectList: Message | InteractionResponse = await payload.reply({
      content: `'${searchTxt}' 검색 결과`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: 'select',
              options: list,
              placeholder: '재생할 노래 선택',
              max_values: 1,
            },
          ],
        },
      ],
    });

    let replyMessage: Message | undefined;
    if (selectList instanceof Message) {
      replyMessage = selectList;
    } else if (payload instanceof ChatInputCommandInteraction) {
      replyMessage = await payload.fetchReply();
    }

    if (!replyMessage) {
      throw new DiscordException('cannot specify reply message object', 'command');
    }
    this.discordClient.setDeleteQueue(payload.guildId ?? '', replyMessage);
  }

  @HandleDiscordError()
  private async parsePlayCommand(
    payload: Message | ChatInputCommandInteraction,
  ): Promise<ParsedPlayCommand | null> {
    if (payload instanceof ChatInputCommandInteraction) {
      const content = payload.options.getString('input') ?? '';
      if (!content.length) {
        const msg = await payload.reply(`parameter count doesn't match`);
        setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
        return null;
      }

      const member = payload.guild?.members.cache.get(payload.member?.user.id ?? '');
      if (!member?.voice.channel) return null;

      return { content, voiceChannel: member.voice.channel };
    }

    const args = payload.content
      .slice(this.configService.discordConfig.COMMAND_PREFIX.length)
      .trim()
      .split(/ +/g);

    if (args.length < 2) {
      const msg = await payload.reply(`parameter count doesn't match`);
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return null;
    }

    args.shift();
    const content = args.join(' ');

    if (!payload.member?.voice.channel) return null;

    return { content, voiceChannel: payload.member.voice.channel };
  }

  @HandleDiscordError()
  public async play(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    const musicQueue = this.discordClient.getMusicQueue(payload.guildId);
    const parsedCommand = await this.parsePlayCommand(payload);

    if (!parsedCommand) {
      const msg = await payload.reply('You need to be in a voice channel to play music');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    const { content, voiceChannel } = parsedCommand;
    const permissions = voiceChannel.permissionsFor(payload.client.user);

    if (!permissions) {
      const msg = await payload.reply('Permission Error');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    const hasPermission =
      permissions.has(PermissionFlagsBits.Connect) && permissions.has(PermissionFlagsBits.Speak);

    if (!hasPermission) {
      const msg = await payload.reply(
        'I need the permissions to join and speak in your voice channel',
      );
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    if (!this.discordClient.getIsPlaying(payload.guildId) && musicQueue.length === 1) {
      const queue = [...musicQueue];
      queue.shift();
      this.discordClient.setMusicQueue(payload.guildId, queue as any);
      this.discordClient.setIsPlaying(payload.guildId, false);
    }

    const playlistCheck =
      content.match(/^(?!.*\?.*\bv=)https:\/\/(www\.)?youtube\.com\/.*\?.*\blist=.*$/) ||
      content.match(/https:\/\/music\.youtube\.com\/playlist\?list=.*/);
    const vidSongCheck =
      content.match(/https:\/\/(www\.)?youtube\.com\/watch\?v=.*/) ||
      content.match(/https:\/\/youtu\.be\/.*/) ||
      content.match(/https:\/\/music\.youtube\.com\/watch\?v=.*/);

    try {
      if (playlistCheck) await this.playlistHandler(content, voiceChannel, payload);
      else if (vidSongCheck) await this.singleVidHandler(content, voiceChannel, payload);
      else await this.searchHandler(content, payload);
    } catch (err) {
      this.discordClient.setIsPlaying(payload.guildId, false);
      throw err;
    }
  }

  @HandleDiscordError()
  public async emptyQueue(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!this.getVoiceChannelFromPayload(payload)) {
      const msg = await payload.reply('You have to be in a voice channel to clear queue music');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    const queue = this.discordClient.getMusicQueue(payload.guildId);
    if (queue.length === 0) {
      const msg = await payload.reply('Queue is empty');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    this.discordClient.setMusicQueue(payload.guildId, [queue[0]] as any);

    const msg = await payload.reply('queue cleared');
    setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
  }

  @HandleDiscordError()
  public async help(payload: Message | ChatInputCommandInteraction): Promise<void> {
    const discordConfig = this.configService.discordConfig;
    const embed = new EmbedBuilder()
      .setColor('#ffffff')
      .setTitle('Commands')
      .addFields([
        { name: 'prefix', value: discordConfig.COMMAND_PREFIX },
        { name: 'p', value: `음악 재생 => ${discordConfig.COMMAND_PREFIX}p [uri]` },
        { name: 's', value: `음악 스킵 => ${discordConfig.COMMAND_PREFIX}s` },
        { name: 'q', value: `음악 큐 조회 => ${discordConfig.COMMAND_PREFIX}q` },
        { name: 'eq', value: `음악 큐 제거 => ${discordConfig.COMMAND_PREFIX}eq` },
        { name: 'l', value: `내보내기 => ${discordConfig.COMMAND_PREFIX}l` },
      ]);

    const msg = await payload.reply({ embeds: [embed] });
    setTimeout(() => msg.delete(), discordConfig.MESSAGE_DELETE_TIMEOUT);
  }

  @HandleDiscordError()
  public async leave(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!this.getVoiceChannelFromPayload(payload)) {
      const msg = await payload.reply('You have to be in a voice channel to make bot leave');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    this.discordClient.setMusicQueue(payload.guildId, []);
    this.discordClient.setIsPlaying(payload.guildId, false);
    this.discordClient.deleteCurrentInfoMsg(payload.guildId);
    this.discordClient.getConnection(payload.guildId)?.destroy();
    this.discordClient.deleteConnection(payload.guildId);

    const msg = await payload.reply('bye bye ,,,');
    setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
  }

  @HandleDiscordError()
  public async queue(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!this.getVoiceChannelFromPayload(payload)) {
      await payload.reply('You have to be in a voice channel to see queue');
      return;
    }
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    const musicQueue = this.discordClient.getMusicQueue(payload.guildId);
    if (musicQueue.length <= 1) {
      const msg = await payload.reply('Queue is empty');
      setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#ffffff')
      .setTitle('Queue')
      .setThumbnail((musicQueue[1] as any).thumbnail);

    const fields: APIEmbedField[] = [];
    musicQueue.forEach((item, idx) => {
      if (idx !== 0 && idx < 26) {
        fields.push({ name: `${idx}`, value: `${(item as any).title}` });
      }
    });
    embed.addFields(fields);

    const msg = await payload.reply({ embeds: [embed] });
    setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
  }

  @HandleDiscordError()
  public async skip(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!this.getVoiceChannelFromPayload(payload)) {
      const reply = await payload.reply('You have to be in a voice channel to see queue');
      setTimeout(() => reply.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      return;
    }
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    this.logger.verbose({ ctx: this.skip.name, info: 'Skipping song...' });
    const musicQueue = this.discordClient.getMusicQueue(payload.guildId);
    this.discordClient.deleteCurrentInfoMsg(payload.guildId);

    if (musicQueue.length <= 1) {
      const reply = await payload.reply('Nothing to play');
      setTimeout(() => reply.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
      this.discordClient.setMusicQueue(payload.guildId, []);
      this.discordClient.getPlayer(payload.guildId).stop();
      return;
    }

    const queue = [...musicQueue];
    queue.shift();
    this.discordClient.setMusicQueue(payload.guildId, queue as any);
    this.discordClient.setIsPlaying(payload.guildId, false);
    await this.discordClient.playSong(payload);

    const msg = await payload.reply('Skipping ...');
    setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
  }

  @HandleDiscordError()
  public async shuffle(payload: Message | ChatInputCommandInteraction): Promise<void> {
    if (!payload.guildId) throw new DiscordException('guild is not specified', 'command');

    this.discordClient.shuffleMusicQueue(payload.guildId);

    const msg = await payload.reply('Queue shuffled');
    setTimeout(() => msg.delete(), this.configService.discordConfig.MESSAGE_DELETE_TIMEOUT);
  }
}
