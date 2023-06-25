//@ts-ignore
import Youtube from 'simple-youtube-api'
import {Inject, Injectable} from '@nestjs/common'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {AppConfigService} from '../../config/config.service'
import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Message,
    PermissionFlagsBits,
    StageChannel,
    TextChannel,
    VoiceChannel,
} from 'discord.js'
import {DiscordClientService, Song} from './discord.client.service'
import {DiscordCommandException} from '../../common/exceptions/discord/discord.command.exception'
import {APIEmbedField} from 'discord-api-types/v10'
import {DiscordErrorHandler} from '../../common/decorators/discordErrorHandler.decorator'
import {DiscordNotificationService} from './discord.notification.service'

@Injectable()
export class DiscordCommandService {
    private readonly youtube = new Youtube(this.configService.getDiscordConfig().YOUTUBE_API_KEY)

    constructor(
        private readonly configService: AppConfigService,
        private readonly discordClientService: DiscordClientService,
        private readonly discordNotificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    private getVoiceChannelFromPayload(payload: Message | ChatInputCommandInteraction) {
        return payload instanceof Message
            ? payload.member?.voice.channel
            : payload.guild?.members.cache.get(payload.member?.user.id || '')?.voice.channel
    }

    @DiscordErrorHandler(true)
    private async playlistHandler(
        url: string,
        voiceChannel: VoiceChannel | StageChannel,
        message: Message | ChatInputCommandInteraction,
    ) {
        this.logger.info('Playlist detected')
        if (!message.guildId) throw new DiscordCommandException('guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        const messageChannel = message.channel as TextChannel
        try {
            const playlist = await this.youtube.getPlaylist(url)
            const videosObj = await playlist.getVideos()
            if (!videosObj.length) {
                return messageChannel
                    .send('No videos found')
                    .then(msg =>
                        setTimeout(
                            () => msg.delete(),
                            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                        ),
                    )
            }

            let thumb
            for (const [idx, item] of videosObj.entries()) {
                if (item.raw.status.privacyStatus === 'private') continue

                if (idx === 0) thumb = item.thumbnails.high.url
                const song: Song | null = this.discordClientService.formatVideo(item, voiceChannel)
                if (song) {
                    musicQueue.push(song)
                    this.discordClientService.setMusicQueue(message.guildId, musicQueue)
                }
            }

            this.logger.info(`queue length: ${musicQueue.length}`)
            this.logger.info(`next: ${JSON.stringify(musicQueue[0].title)}`)

            const reply = await message.reply({
                embeds: [
                    this.discordClientService.formatMessageEmbed(
                        url,
                        videosObj.length,
                        musicQueue.length,
                        playlist.title,
                        thumb,
                    ),
                ],
            })
            setTimeout(
                () => reply.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )

            if (!this.discordClientService.getIsPlaying(message.guildId))
                return this.discordClientService.playSong(message)
        } catch (err) {
            message
                .reply('Playlist is either private or it does not exist')
                .then(msg =>
                    setTimeout(
                        () => msg.delete(),
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )
            throw new DiscordCommandException(err.message)
        }
    }

    @DiscordErrorHandler(true)
    private async singleVidHandler(
        url: string,
        voiceChannel: VoiceChannel | StageChannel,
        message: Message | ChatInputCommandInteraction,
    ) {
        this.logger.info('Single video/song detected')
        if (!message.guildId) throw new DiscordCommandException('guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        const video = await this.youtube.getVideo(url)
        const song: Song | null = this.discordClientService.formatVideo(video, voiceChannel)
        if (!song)
            return message
                .reply('Video is either private or it does not exist')
                .then(msg =>
                    setTimeout(
                        () => msg.delete(),
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )
        musicQueue.push(song)
        this.discordClientService.setMusicQueue(message.guildId, musicQueue)

        this.logger.info(`Queue length: ${musicQueue.length}`)
        this.logger.info(`Current: ${JSON.stringify(musicQueue[0].title)}`)

        const reply = await message.reply({
            embeds: [
                this.discordClientService.formatMessageEmbed(
                    url,
                    1,
                    musicQueue.length,
                    song.title,
                    song.thumbnail,
                ),
            ],
        })
        setTimeout(
            () => reply.delete(),
            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
        )

        if (!this.discordClientService.getIsPlaying(message.guildId))
            return this.discordClientService.playSong(message)
    }

    @DiscordErrorHandler(true)
    private async searchHandler(searchTxt: string, payload: Message | ChatInputCommandInteraction) {
        this.logger.info('Search detected')

        searchTxt = searchTxt.trim()
        this.logger.debug(`searchTxt: ${searchTxt}`)
        const results = await this.youtube.searchVideos(searchTxt, 10)

        type ListItem = {
            label: string
            description: string
            value: string
        }
        const list: ListItem[] = results.flatMap((item: any): ListItem[] => {
            const url = `https://www.youtube.com/watch?v=${item.id}`
            const title = item.raw.snippet.title
            if (title.length >= 100) return []
            return [{label: title, description: title, value: url}]
        })

        const selectList = await payload.reply({
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
        })

        let replyMessage: Message<boolean> | undefined = undefined
        if (selectList instanceof Message<boolean>) replyMessage = selectList
        else if (payload instanceof ChatInputCommandInteraction)
            replyMessage = await payload.fetchReply()

        if (!replyMessage) throw new DiscordCommandException('cannot specify reply message object')
        this.discordClientService.setDeleteQueue(payload.guildId || '', replyMessage)
    }

    @DiscordErrorHandler()
    async play(payload: Message | ChatInputCommandInteraction) {
        if (!payload.guildId) throw new DiscordCommandException('guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(payload.guildId)

        let content = ''
        let voiceChannel: VoiceChannel | StageChannel | null | undefined = null
        if (payload instanceof ChatInputCommandInteraction) {
            content = payload.options.getString('input') ?? ''
            if (!content.length) {
                const msg = await payload.reply(`parameter count doesn't match`)
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                )
                return
            }
            const member = payload.guild?.members.cache.get(payload.member?.user.id || '')
            voiceChannel = member?.voice.channel
        } else {
            const args: string[] = payload.content
                .slice(this.configService.getDiscordConfig().COMMAND_PREFIX.length)
                .trim()
                .split(/ +/g)
            if (args.length < 2) {
                const msg = await payload.reply(`parameter count doesn't match`)
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                )
                return
            }
            args.shift()
            content = args.join(' ')
            console.log(content)
            voiceChannel = payload.member?.voice.channel
        }

        // const voiceChannel: VoiceChannel | StageChannel | null | undefined = payload.member?.voice.channel
        this.logger.verbose(JSON.stringify(voiceChannel))
        if (!voiceChannel) {
            const sentMessage = await payload.reply(
                'You need to be in a voice channel to play music',
            )
            setTimeout(
                () => sentMessage.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )
            return
        }

        const permissions = voiceChannel.permissionsFor(payload.client.user)
        if (!permissions) {
            const sentMessage = await payload.reply('Permission Error')
            setTimeout(
                () => sentMessage.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )
            return
        }
        if (
            !permissions.has(PermissionFlagsBits.Connect) ||
            !permissions.has(PermissionFlagsBits.Speak)
        ) {
            const sentMessage = await payload.reply(
                'I need the permissions to join and speak in your voice channel',
            )
            setTimeout(
                () => sentMessage.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )
            return
        }

        if (!this.discordClientService.getIsPlaying(payload.guildId) && musicQueue.length === 1) {
            musicQueue.shift()
            this.discordClientService.setMusicQueue(payload.guildId, musicQueue)
            this.discordClientService.setIsPlaying(payload.guildId, false)
        }

        const playlistCheck =
            content.match(/^(?!.*\?.*\bv=)https:\/\/(www\.)?youtube\.com\/.*\?.*\blist=.*$/) ||
            content.match(/https:\/\/music\.youtube\.com\/playlist\?list=.*/)
        const vidSongCheck =
            content.match(/https:\/\/(www\.)?youtube\.com\/watch\?v=.*/) ||
            content.match(/https:\/\/youtu\.be\/.*/) ||
            content.match(/https:\/\/music\.youtube\.com\/watch\?v=.*/)

        try {
            if (playlistCheck) await this.playlistHandler(content, voiceChannel, payload)
            else if (vidSongCheck) await this.singleVidHandler(content, voiceChannel, payload)
            else await this.searchHandler(content, payload)
        } catch (err) {
            this.discordClientService.setIsPlaying(payload.guildId, false)
            throw err
        }
    }

    @DiscordErrorHandler()
    async emptyQueue(payload: Message | ChatInputCommandInteraction) {
        if (!this.getVoiceChannelFromPayload(payload)) {
            return payload
                .reply('You have to be in a voice channel to clear queue music')
                .then(msg =>
                    setTimeout(
                        () => msg.delete,
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )
        }
        if (!payload.guildId) throw new DiscordCommandException('guild is not specified')

        const queue = this.discordClientService.getMusicQueue(payload.guildId)
        if (queue.length === 0) {
            return payload
                .reply('Queue is empty')
                .then(msg =>
                    setTimeout(
                        () => msg.delete(),
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )
        }

        this.discordClientService.setMusicQueue(payload.guildId, [queue[0]])
        return payload
            .reply('queue cleared')
            .then(msg =>
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                ),
            )
    }

    @DiscordErrorHandler()
    async help(payload: Message | ChatInputCommandInteraction) {
        const discordConfig = await this.configService.getDiscordConfig()
        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor('#ffffff')
            .setTitle('Commands')
            .addFields([
                {name: 'prefix', value: discordConfig.COMMAND_PREFIX},
                {name: 'p', value: `음악 재생 => ${discordConfig.COMMAND_PREFIX}p [uri]`},
                {name: 's', value: `음악 스킵 => ${discordConfig.COMMAND_PREFIX}s`},
                {name: 'q', value: `음악 큐 조회 => ${discordConfig.COMMAND_PREFIX}q`},
                {name: 'eq', value: `음악 큐 제거 => ${discordConfig.COMMAND_PREFIX}eq`},
                {name: 'l', value: `내보내기 => ${discordConfig.COMMAND_PREFIX}l`},
            ])

        return payload
            .reply({embeds: [embed]})
            .then(msg => setTimeout(() => msg.delete(), discordConfig.MESSAGE_DELETE_TIMEOUT))
    }

    @DiscordErrorHandler()
    async leave(payload: Message | ChatInputCommandInteraction) {
        if (!this.getVoiceChannelFromPayload(payload)) {
            return payload
                .reply('You have to be in a voice channel to make bot leave')
                .then(msg =>
                    setTimeout(
                        () => msg.delete(),
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )
        }
        if (!payload.guildId) throw new DiscordCommandException('guild is not specified')

        this.discordClientService.setMusicQueue(payload.guildId, [])
        this.discordClientService.setIsPlaying(payload.guildId, false)
        this.discordClientService.deleteCurrentInfoMsg(payload.guildId)

        this.discordClientService.getConnection(payload.guildId)?.destroy()
        this.discordClientService.deleteConnection(payload.guildId)
        return payload
            .reply('bye bye ,,,')
            .then(msg =>
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                ),
            )
    }

    @DiscordErrorHandler()
    async queue(payload: Message | ChatInputCommandInteraction) {
        if (!this.getVoiceChannelFromPayload(payload))
            return payload.reply('You have to be in a voice channel to see queue')
        if (!payload.guildId) throw new DiscordCommandException('guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(payload.guildId)
        if (!musicQueue.length || musicQueue.length === 1)
            return payload
                .reply('Queue is empty')
                .then(msg =>
                    setTimeout(
                        () => msg.delete(),
                        this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                    ),
                )

        const embed: EmbedBuilder = new EmbedBuilder()
            .setColor('#ffffff')
            .setTitle('Queue')
            .setThumbnail(musicQueue[1].thumbnail)
        const fields: Array<APIEmbedField> = []

        musicQueue.forEach(
            (item, idx) =>
                idx !== 0 && idx < 26 && fields.push({name: `${idx}`, value: `${item.title}`}),
        )
        embed.addFields(fields)
        await payload
            .reply({embeds: [embed]})
            .then(msg =>
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                ),
            )
    }

    @DiscordErrorHandler()
    async skip(payload: Message | ChatInputCommandInteraction) {
        if (!this.getVoiceChannelFromPayload(payload)) {
            const reply = await payload.reply('You have to be in a voice channel to see queue')
            setTimeout(
                () => reply.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )
            return
        }
        if (!payload.guildId) throw new DiscordCommandException('guild is not specified')

        this.logger.verbose('Skipping song...')
        const musicQueue = this.discordClientService.getMusicQueue(payload.guildId)
        this.discordClientService.deleteCurrentInfoMsg(payload.guildId)
        if (musicQueue.length <= 1) {
            const reply = await payload.reply('Nothing to play')
            setTimeout(
                () => reply.delete(),
                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
            )

            this.discordClientService.setMusicQueue(payload.guildId, [])
            this.discordClientService.getPlayer(payload.guildId).stop()
            return
        }

        musicQueue.shift()
        this.discordClientService.setMusicQueue(payload.guildId, musicQueue)
        this.discordClientService.setIsPlaying(payload.guildId, false)
        await this.discordClientService.playSong(payload)

        return payload
            .reply('Skipping ...')
            .then(msg =>
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                ),
            )
    }
}
