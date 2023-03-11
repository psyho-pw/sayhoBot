//@ts-ignore
import Youtube from 'simple-youtube-api'
import {forwardRef, Inject, Injectable} from '@nestjs/common'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {AppConfigService} from '../../config/config.service'
import {Message, PermissionFlagsBits, StageChannel, TextChannel, VoiceChannel} from 'discord.js'
import {DiscordClientService, Song} from './discord.client.service'
import {DiscordCommandException} from '../../common/exceptions/discord/discord.command.exception'

@Injectable()
export class DiscordCommandService {
    private readonly youtube = new Youtube(this.configService.getDiscordConfig().YOUTUBE_API_KEY)
    constructor(
        private readonly configService: AppConfigService,
        @Inject(forwardRef(() => DiscordClientService)) private readonly discordClientService: DiscordClientService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    private async playlistHandler(url: string, voiceChannel: VoiceChannel | StageChannel, message: Message) {
        this.logger.info('Playlist detected')
        if (!message.guildId) throw new DiscordCommandException(this.playlistHandler.name, 'guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        const messageChannel = message.channel as TextChannel
        try {
            const playlist = await this.youtube.getPlaylist(url)
            const videosObj = await playlist.getVideos()
            if (!videosObj.length) {
                return messageChannel.send('No videos found').then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
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

            const reply = await message.reply({embeds: [this.discordClientService.formatMessageEmbed(url, videosObj.length, musicQueue.length, playlist.title, thumb)]})
            setTimeout(() => reply.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)

            if (!this.discordClientService.getIsPlaying(message.guildId)) {
                this.discordClientService.setIsPlaying(message.guildId, true)
                return this.discordClientService.playSong(message)
            }
        } catch (err) {
            message
                .reply('Playlist is either private or it does not exist')
                .then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
            throw new DiscordCommandException(this.playlistHandler.name, err.message)
        }
    }

    private async singleVidHandler(url: string, voiceChannel: VoiceChannel | StageChannel, message: Message) {
        this.logger.info('Single video/song detected')
        if (!message.guildId) throw new DiscordCommandException(this.singleVidHandler.name, 'guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        const video = await this.youtube.getVideo(url)
        const song: Song | null = this.discordClientService.formatVideo(video, voiceChannel)
        if (!song)
            return message
                .reply('Video is either private or it does not exist')
                .then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
        musicQueue.push(song)
        this.discordClientService.setMusicQueue(message.guildId, musicQueue)

        this.logger.info(`Queue length: ${musicQueue.length}`)
        this.logger.info(`Current: ${JSON.stringify(musicQueue[0].title)}`)

        const reply = await message.reply({embeds: [this.discordClientService.formatMessageEmbed(url, 1, musicQueue.length, song.title, song.thumbnail)]})
        setTimeout(() => reply.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)

        if (!this.discordClientService.getIsPlaying(message.guildId)) {
            this.discordClientService.setIsPlaying(message.guildId, true)
            return this.discordClientService.playSong(message)
        }
    }

    private async searchHandler(args: string[], message: Message) {
        this.logger.info('Search detected')
        let searchTxt = ''
        args.forEach((item, idx) => {
            if (idx !== 0) searchTxt += `${item} `
        })

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

        const selectList = await message.reply({
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

        this.discordClientService.setDeleteQueue(selectList)
    }
    async play(message: Message) {
        if (!message.guildId) throw new DiscordCommandException(this.play.name, 'guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        const messageChannel = message.channel as TextChannel

        const args: string[] = message.content.slice(this.configService.getDiscordConfig().COMMAND_PREFIX.length).trim().split(/ +/g)
        if (args.length < 2) {
            const msg = await message.reply(`parameter count doesn't match`)
            setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
            return
        }

        const voiceChannel: VoiceChannel | StageChannel | null | undefined = message.member?.voice.channel
        this.logger.verbose(JSON.stringify(voiceChannel))
        if (!voiceChannel) {
            const sentMessage = await messageChannel.send('You need to be in a voice channel to play music')
            setTimeout(() => sentMessage.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
            return
        }

        const permissions = voiceChannel.permissionsFor(message.client.user)
        if (!permissions) {
            const sentMessage = await messageChannel.send('Permission Error')
            setTimeout(() => sentMessage.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
            return
        }
        if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
            messageChannel
                .send('I need the permissions to join and speak in your voice channel')
                .then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
            return
        }

        if (!this.discordClientService.getIsPlaying(message.guildId) && musicQueue.length === 1) {
            musicQueue.shift()
            this.discordClientService.setMusicQueue(message.guildId, musicQueue)
            this.discordClientService.setIsPlaying(message.guildId, false)
        }

        const query: string = args[1]
        const playlistCheck =
            query.match(/^(?!.*\?.*\bv=)https:\/\/(www\.)?youtube\.com\/.*\?.*\blist=.*$/) || query.match(/https:\/\/music\.youtube\.com\/playlist\?list=.*/)
        const vidSongCheck =
            query.match(/https:\/\/(www\.)?youtube\.com\/watch\?v=.*/) ||
            query.match(/https:\/\/youtu\.be\/.*/) ||
            query.match(/https:\/\/music\.youtube\.com\/watch\?v=.*/)

        try {
            if (playlistCheck) await this.playlistHandler(query, voiceChannel, message)
            else if (vidSongCheck) await this.singleVidHandler(query, voiceChannel, message)
            else await this.searchHandler(args, message)
        } catch (err) {
            this.discordClientService.setIsPlaying(message.guildId, false)
            throw err
        }
    }

    async emptyQueue(message: Message) {
        if (!message.member?.voice.channel) return message.reply('You have to be in a voice channel to clear queue music')
        if (!message.guildId) throw new DiscordCommandException(this.emptyQueue.name, 'guild is not specified')

        const queue = this.discordClientService.getMusicQueue(message.guildId)
        if (queue.length === 0) {
            return message.reply('Queue is empty').then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
        }

        this.discordClientService.setMusicQueue(message.guildId, [queue[0]])
        this.discordClientService.setIsPlaying(message.guildId, false)
        const msg = await message.reply('queue cleared')
        setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
    }
}
