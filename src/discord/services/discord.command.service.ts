//@ts-ignore
import Youtube from 'simple-youtube-api'
import {Inject, Injectable} from '@nestjs/common'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {AppConfigService} from '../../config/config.service'
import {ChatInputCommandInteraction, EmbedBuilder, Message, PermissionFlagsBits, StageChannel, TextChannel, VoiceChannel} from 'discord.js'
import {DiscordClientService, Song} from './discord.client.service'
import {DiscordCommandException} from '../../common/exceptions/discord/discord.command.exception'
import {APIEmbedField} from 'discord-api-types/v10'

@Injectable()
export class DiscordCommandService {
    private readonly youtube = new Youtube(this.configService.getDiscordConfig().YOUTUBE_API_KEY)
    constructor(
        private readonly configService: AppConfigService,
        private readonly discordClientService: DiscordClientService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    private async playlistHandler(url: string, voiceChannel: VoiceChannel | StageChannel, message: Message | ChatInputCommandInteraction) {
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

    private async singleVidHandler(url: string, voiceChannel: VoiceChannel | StageChannel, message: Message | ChatInputCommandInteraction) {
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

    private async searchHandler(searchTxt: string, message: Message | ChatInputCommandInteraction) {
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

        const selectList = await message.reply({
            content: `'${searchTxt}' 검색 결과`,
            components: [{type: 1, components: [{type: 3, custom_id: 'select', options: list, placeholder: '재생할 노래 선택', max_values: 1}]}],
        })

        this.discordClientService.setDeleteQueue(message.guildId || '', selectList)
    }
    async play(payload: Message | ChatInputCommandInteraction) {
        console.log(payload)
        // console.log(message)
        if (!payload.guildId) throw new DiscordCommandException(this.play.name, 'guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(payload.guildId)
        const messageChannel = payload.channel as TextChannel

        let content = ''
        let voiceChannel: VoiceChannel | StageChannel | null | undefined = null
        if (payload instanceof ChatInputCommandInteraction) {
            content = payload.options.getString('input') ?? ''
            if (!content.length) {
                const msg = await payload.reply(`parameter count doesn't match`)
                setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
                return
            }
            const member = payload.guild?.members.cache.get(payload.member?.user.id || '')
            voiceChannel = member?.voice.channel
        } else {
            const args: string[] = payload.content.slice(this.configService.getDiscordConfig().COMMAND_PREFIX.length).trim().split(/ +/g)
            if (args.length < 2) {
                const msg = await payload.reply(`parameter count doesn't match`)
                setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
                return
            }
            content = args[1]
            voiceChannel = payload.member?.voice.channel
        }

        // const voiceChannel: VoiceChannel | StageChannel | null | undefined = payload.member?.voice.channel
        this.logger.verbose(JSON.stringify(voiceChannel))
        if (!voiceChannel) {
            const sentMessage = await messageChannel.send('You need to be in a voice channel to play music')
            setTimeout(() => sentMessage.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
            return
        }

        const permissions = voiceChannel.permissionsFor(payload.client.user)
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

        if (!this.discordClientService.getIsPlaying(payload.guildId) && musicQueue.length === 1) {
            musicQueue.shift()
            this.discordClientService.setMusicQueue(payload.guildId, musicQueue)
            this.discordClientService.setIsPlaying(payload.guildId, false)
        }

        const playlistCheck =
            content.match(/^(?!.*\?.*\bv=)https:\/\/(www\.)?youtube\.com\/.*\?.*\blist=.*$/) || content.match(/https:\/\/music\.youtube\.com\/playlist\?list=.*/)
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

    async help(message: Message) {
        if (!message.member?.voice.channel) return message.reply('You have to be in a voice channel to make bot leave')
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

        const msg = await message.reply({embeds: [embed]})
        setTimeout(() => msg.delete(), discordConfig.MESSAGE_DELETE_TIMEOUT)
    }

    async leave(message: Message) {
        if (!message.member?.voice.channel) return message.reply('You have to be in a voice channel to make bot leave')
        if (!message.guildId) throw new DiscordCommandException(this.leave.name, 'guild is not specified')

        this.discordClientService.setMusicQueue(message.guildId, [])
        this.discordClientService.setIsPlaying(message.guildId, false)
        this.discordClientService.deleteCurrentInfoMsg(message.guildId)

        this.discordClientService.getConnection(message.guildId)?.destroy()
        this.discordClientService.deleteConnection(message.guildId)
    }

    async queue(message: Message) {
        if (!message.member?.voice.channel) return message.reply('You have to be in a voice channel to see queue')
        if (!message.guildId) throw new DiscordCommandException(this.queue.name, 'guild is not specified')

        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        if (!musicQueue.length || musicQueue.length === 1)
            return message.reply('Queue is empty').then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))

        const embed: EmbedBuilder = new EmbedBuilder().setColor('#ffffff').setTitle('Queue').setThumbnail(musicQueue[1].thumbnail)
        const fields: Array<APIEmbedField> = []

        musicQueue.forEach((item, idx) => idx !== 0 && idx < 26 && fields.push({name: `${idx}`, value: `${item.title}`}))
        embed.addFields(fields)
        await message.reply({embeds: [embed]}).then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
    }

    async skip(message: Message) {
        if (!message.member?.voice.channel) {
            const reply = await message.reply('You have to be in a voice channel to see queue')
            setTimeout(() => reply.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)
            return
        }
        if (!message.guildId) throw new DiscordCommandException(this.skip.name, 'guild is not specified')

        this.logger.verbose('Skipping song...')
        const musicQueue = this.discordClientService.getMusicQueue(message.guildId)
        this.discordClientService.deleteCurrentInfoMsg(message.guildId)
        if (musicQueue.length <= 1) {
            const reply = await message.reply('Nothing to play')
            setTimeout(() => reply.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT)

            this.discordClientService.setMusicQueue(message.guildId, [])
            this.discordClientService.getPlayer(message.guildId).stop()
            return
        }

        musicQueue.shift()
        this.discordClientService.setMusicQueue(message.guildId, musicQueue)
        await this.discordClientService.playSong(message)
    }
}
