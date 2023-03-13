import {Inject, Injectable} from '@nestjs/common'
import {Client, Collection, EmbedBuilder, GatewayIntentBits, Message, StageChannel, TextChannel, VoiceChannel} from 'discord.js'
import {
    AudioPlayer,
    AudioPlayerStatus,
    AudioResource,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    generateDependencyReport,
    joinVoiceChannel,
    StreamType,
    VoiceConnection,
} from '@discordjs/voice'
import {AppConfigService} from '../../config/config.service'
import {HttpService} from '@nestjs/axios'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import ytdl from 'ytdl-core'
import {DiscordClientException} from '../../common/exceptions/discord/discord.client.exception'
import {SongService} from '../../song/song.service'
import {DiscordNotificationService} from './discord.notification.service'

export type Song = {
    url: string
    title: string
    duration: string | null
    thumbnail: string
    voiceChannel: VoiceChannel | StageChannel
    video: any
    videoId: string
}

@Injectable()
export class DiscordClientService {
    discordBotClient: Client
    public commands: Collection<string, any> = new Collection()
    private musicQueue = new Map<string, Song[]>()
    private isPlaying = new Map<string, boolean>()
    private currentInfoMsg = new Map<string, Message>()
    private volume = new Map<string, number>()
    private player = new Map<string, AudioPlayer>()
    private connection = new Map<string, VoiceConnection>()
    private deleteQueue: Map<string, Map<string, Message>> = new Map()

    constructor(
        private readonly configService: AppConfigService,
        private readonly httpService: HttpService,
        private readonly songService: SongService,
        private readonly discordNotificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    async init() {
        this.discordBotClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ],
        })

        this.logger.verbose(generateDependencyReport())
        try {
            await this.discordBotClient.login(this.configService.getDiscordConfig().TOKEN)
            this.logger.verbose('✅  DiscordBotClient instance initialized')
        } catch (err) {
            throw new DiscordClientException(this.init.name, 'login failed')
        }
    }

    private formatDuration(durationObj: any) {
        return `${durationObj.hours ? durationObj.hours + ':' : ''}${durationObj.minutes ? durationObj.minutes : '00'}:${
            durationObj.seconds < 10 ? '0' + durationObj.seconds : durationObj.seconds ? durationObj.seconds : '00'
        }`
    }

    formatVideo(video: any, voiceChannel: VoiceChannel | StageChannel): Song | null {
        if (video.title === 'Deleted video') return null

        let duration: string | null = video.duration !== undefined ? this.formatDuration(video.duration) : null
        if (duration === '00:00') duration = 'Live Stream'
        return {
            url: `https://www.youtube.com/watch?v=${video.raw.id}`,
            title: video.raw.snippet.title,
            duration,
            thumbnail: video.thumbnails.high.url,
            voiceChannel,
            video: video,
            videoId: video.raw.id,
        }
    }

    formatMessageEmbed(url: string, queuedCount: number, queueLength: number, title: string, thumbnail: string) {
        return new EmbedBuilder()
            .setColor('#ffffff')
            .setTitle('Queued')
            .setURL(url)
            .setDescription(`Queued ${queuedCount} track${queuedCount === 1 ? '' : 's'}`)
            .addFields([
                {name: 'Total Queue', value: `${queueLength} tracks`},
                {name: 'Track', value: `:musical_note:  ${title} :musical_note: has been added to queue`},
            ])
            .setThumbnail(thumbnail)
    }

    private playerWrapper = (handler: (message: Message) => Promise<any>, message: Message) => async (guildId: string) => {
        try {
            await handler(message)
        } catch (err) {
            const player = this.player.get(guildId)
            if (!player) return this.logger.error('player not found')
            player.emit('error', err)
        }
    }
    private async playerOnPlayHandler(message: Message) {
        const guildId = message.guildId || ''

        const channel = message.channel as TextChannel

        const musicQueue = this.musicQueue.get(guildId)
        if (!musicQueue) throw new DiscordClientException(this.playerOnPlayHandler.name, 'Queue does not exist')

        const currentItem = musicQueue[0]
        if (!currentItem) throw new DiscordClientException(this.playerOnPlayHandler.name, 'Queue item is corrupted')

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`:: Currently playing :arrow_forward: ::`)
            .setURL(currentItem.url)
            .setThumbnail(currentItem.thumbnail)
            .setDescription(`${currentItem.title} (${currentItem.duration})`)
            .addFields([
                {name: 'Requester', value: (message.mentions.repliedUser || message.author).toString(), inline: true},
                {name: 'PlayTime', value: '00 : 00', inline: true},
            ])

        const msg = await channel.send({embeds: [embed]})

        let tick = 1
        const intervalRef = setInterval(async () => {
            const time = tick++
            embed.setFields([
                msg.embeds[0].fields[0],
                {
                    name: 'Playtime',
                    value: (~~(time / 60)).toString().padStart(2, '0') + ' : ' + (time % 60).toString().padStart(2, '0'),
                    inline: true,
                },
            ])

            try {
                await msg.edit({embeds: [embed]})
            } catch (err) {
                clearInterval(intervalRef)
            }
        }, 1000)

        this.currentInfoMsg.set(guildId, msg)
        this.logger.info(`Currently playing ${currentItem.title}`)
    }

    private async playerIdleHandler(message: Message) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException(this.playerIdleHandler.name, 'guildId not specified')

        const channel = message.channel as TextChannel

        this.deleteCurrentInfoMsg(guildId)
        const musicQueue = this.musicQueue.get(guildId)

        if (!musicQueue) throw new DiscordClientException(this.playerIdleHandler.name, 'Queue does not exist')

        if (musicQueue.length > 1) {
            this.logger.debug('queue length is not zero')
            musicQueue.shift()
            this.musicQueue.set(guildId, musicQueue)
            await this.playSong(message)
            return
        }

        this.logger.debug('queue empty')
        this.isPlaying.set(guildId, false)
        setTimeout(() => {
            if ((this.musicQueue.get(guildId) || []).length <= 1 && !this.isPlaying.get(guildId)) {
                this.musicQueue.set(guildId, [])
                this.isPlaying.set(guildId, false)
                this.volume.set(guildId, 1)

                channel
                    .send(`Disconnected from channel due to inactivity`)
                    .then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
                this.connection.get(guildId)?.destroy()
                this.connection.delete(guildId)
            }
        }, 180000)
    }

    private createPlayer(message: Message) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException(this.createPlayer.name, 'guildId not specified')

        const player: AudioPlayer = createAudioPlayer()
        const channel = message.channel as TextChannel

        player
            .on(AudioPlayerStatus.Playing, () => this.playerWrapper(this.playerOnPlayHandler, message)(guildId))
            .on(AudioPlayerStatus.Idle, () => this.playerWrapper(this.playerIdleHandler, message)(guildId))
            .on('error', async err => {
                this.logger.error('fatal error occurred')
                const musicQueue = this.musicQueue.get(guildId)
                this.isPlaying.set(guildId, false)
                this.deleteCurrentInfoMsg(guildId)

                if (!musicQueue) return channel.send('Queue does not exist')

                if (err.message === 'Status code: 410') {
                    return channel
                        .send(`Unplayable Song: ${musicQueue[0].title}`)
                        .then(msg => setTimeout(() => msg.delete(), this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT))
                }

                await channel.send('\n' + 'fatal error occurred')
                this.connection.get(guildId)?.destroy()
                this.connection.delete(guildId)

                await this.discordNotificationService.sendErrorReport(err)
            })

        return player
    }

    async playSong(message: Message) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException(this.playSong.name, 'guildId not specified')

        const channel = message.channel as TextChannel
        const musicQueue = this.musicQueue.get(guildId)
        if (!musicQueue) return channel.send('No Queue found')
        if (!musicQueue.length) return channel.send('No songs in queue')

        const video = await musicQueue[0].video.fetch()
        const nextSong: Song | null = this.formatVideo(video, musicQueue[0].voiceChannel)
        if (!nextSong) return channel.send('Cannot fetch next song')

        musicQueue[0] = nextSong
        this.musicQueue.set(guildId, musicQueue)

        const validate = ytdl.validateURL(musicQueue[0].url)
        if (!validate) {
            this.logger.error('Please input a **valid** URL.')
            await channel.send('Please input a **valid** URL.')
        }
        const stream = ytdl(musicQueue[0].videoId, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
            liveBuffer: 4000,
        }).on('error', (error: any) => {
            this.logger.error(error)
            throw new DiscordClientException(this.playSong.name, error.message)
        })

        const resource: AudioResource = createAudioResource(stream, {inputType: StreamType.Arbitrary})
        let connection = this.connection.get(guildId)

        if (!connection) {
            if (!message.guild) return channel.send(`Error occurred on joining voice channel\nguild is not defined`)

            connection = joinVoiceChannel({
                channelId: musicQueue[0].voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            })

            this.connection.set(guildId, connection)
            this.isPlaying.set(guildId, false)
            this.volume.set(guildId, 1)
        }

        let player = this.player.get(guildId)
        if (!player) {
            const newPlayer = await this.createPlayer(message)
            this.player.set(guildId, newPlayer)
            player = newPlayer
        }

        try {
            player.play(resource)
            await this.songService.create({
                url: nextSong.url,
                title: nextSong.title,
            })
            this.isPlaying.set(guildId, true)
            connection.subscribe(player)
        } catch (err: any) {
            this.logger.error(err)
            await channel.send('Error occurred on player.play()')
            await channel.send(err)
            throw new DiscordClientException(this.playSong.name, err.message)
        }
    }

    deleteCurrentInfoMsg(guildId: string) {
        const currentInfoMsg = this.currentInfoMsg.get(guildId)
        currentInfoMsg?.delete()
        this.currentInfoMsg.delete(guildId)
    }

    setDeleteQueue(message: Message) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException(this.setDeleteQueue.name, 'guildId not specified')
        this.deleteQueue.set(guildId, (this.deleteQueue.get(guildId) || new Map<string, Message>()).set(message.id, message))
    }

    removeFromDeleteQueue(guildId: string, id: string) {
        const innerMap = this.deleteQueue.get(guildId)
        if (!innerMap) throw new DiscordClientException(this.removeFromDeleteQueue.name, 'data does not exist in delete queue')
        innerMap.get(id)?.delete()
        innerMap.delete(id)
        this.deleteQueue.set(guildId, innerMap)
    }

    getConnection(guildId: string): VoiceConnection {
        const connection = this.connection.get(guildId)
        if (!connection) throw new DiscordClientException(this.getConnection.name, 'no such connection')
        return connection
    }

    setConnection(guildId: string, conn: VoiceConnection): void {
        this.connection.set(guildId, conn)
    }

    deleteConnection(guildId: string): void {
        this.connection.delete(guildId)
    }

    getMusicQueue(guildId: string): Song[] {
        return this.musicQueue.get(guildId) || []
    }

    getTotalMusicQueue() {
        return this.musicQueue
    }

    setMusicQueue(guildId: string, queue: Song[]): void {
        this.musicQueue.set(guildId, queue)
    }

    getIsPlaying(guildId: string): boolean {
        return this.isPlaying.get(guildId) || false
    }

    setIsPlaying(guildId: string, isPlaying: boolean): void {
        this.isPlaying.set(guildId, isPlaying)
    }

    getVolume(guildId: string): number {
        return this.volume.get(guildId) || 1
    }

    setVolume(guildId: string, volume: number): void {
        this.volume.set(guildId, volume)
    }

    getPlayer(guildId: string): AudioPlayer {
        const player = this.player.get(guildId)
        if (!player) throw new DiscordClientException(this.getPlayer.name, 'No player found')
        return player
    }

    setPlayer(guildId: string, player: AudioPlayer): void {
        this.player.set(guildId, player)
    }

    deletePlayer(guildId: string): void {
        this.player.delete(guildId)
    }

    getClient() {
        return this.discordBotClient
    }
    getUser() {
        console.log(this.discordBotClient.user?.tag)
        return this.discordBotClient.user?.tag
    }
}
