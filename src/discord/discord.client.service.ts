import {Inject, Injectable} from '@nestjs/common'
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
} from 'discord.js'
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
import {HttpService} from '@nestjs/axios'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import ytdl from '@distube/ytdl-core'
import {DiscordNotificationService} from './discord.notification.service'
import {AppConfigService} from '../config/config.service'
import {SongService} from '../song/song.service'
import {HandleDiscordError} from '../common/decorators/discordErrorHandler.decorator'
import {DiscordClientException} from '../common/exceptions/discord/discord.client.exception'
import {Song} from './discord.model'
import {Video} from './discord.type'

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
    private deleteQueue: Map<string, Map<string, Message | InteractionResponse>> = new Map()
    private rest: REST

    private readonly configService: AppConfigService

    private readonly songService: SongService

    constructor(
        configService: AppConfigService,
        private readonly httpService: HttpService,
        songService: SongService,
        private readonly discordNotificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {
        this.songService = songService
        this.configService = configService
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
        })

        this.logger.verbose(generateDependencyReport())
        try {
            this.rest = new REST({version: '10'}).setToken(
                this.configService.getDiscordConfig().TOKEN,
            )
            await this.discordBotClient.login(this.configService.getDiscordConfig().TOKEN)
            this.logger.verbose('✅  DiscordBotClient instance initialized')
        } catch (err) {
            console.error(err)
            throw new DiscordClientException('login failed')
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
        }`
    }

    public formatVideo(video: Video, voiceChannel: VoiceChannel | StageChannel): Song | null {
        if (video.title === 'Deleted video') return null

        let duration: string | null =
            video.duration !== undefined ? this.formatDuration(video.duration) : null
        if (duration === '00:00') duration = 'Live Stream'

        const song = new Song()
        song.url = video.url
        song.title = video.raw.snippet.title
        song.duration = duration
        song.thumbnail = video.thumbnails.high.url
        song.voiceChannel = voiceChannel
        song.video = video
        song.videoId = video.raw.id

        return song
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
                {name: 'Total Queue', value: `${queueLength} tracks`},
                {
                    name: 'Track',
                    value: `:musical_note:  ${title} :musical_note: has been added to queue`,
                },
            ])
            .setThumbnail(thumbnail)
    }

    private async playerWrapper(handler: () => Promise<any>, guildId: string) {
        try {
            await handler()
        } catch (err) {
            const player = this.player.get(guildId)
            if (!player) return this.logger.error('player not found')
            player.emit('error', err)
        }
    }

    @HandleDiscordError(true)
    private async playerOnPlayHandler(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId || ''
        if (this.isPlaying.get(guildId)) return

        const channel = message.channel as TextChannel
        const musicQueue = this.musicQueue.get(guildId)
        if (!musicQueue) throw new DiscordClientException('Queue does not exist')

        const currentItem = musicQueue[0]
        if (!currentItem) throw new DiscordClientException('Queue item is corrupted')

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`:: Currently playing :arrow_forward: ::`)
            .setURL(currentItem.url)
            .setThumbnail(currentItem.thumbnail)
            .setDescription(`${currentItem.title} (${currentItem.duration})`)

        const msg = await channel.send({embeds: [embed]})
        this.currentInfoMsg.set(guildId, msg)
        this.logger.info(`Currently playing ${currentItem.title}`)

        this.isPlaying.set(guildId, true)
    }

    @HandleDiscordError(true)
    private async playerIdleHandler(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException('guildId not specified')

        const channel = message.channel as TextChannel

        this.deleteCurrentInfoMsg(guildId)
        const musicQueue = this.musicQueue.get(guildId)
        if (!musicQueue) throw new DiscordClientException('Queue does not exist')

        this.isPlaying.set(guildId, false)

        if (musicQueue.length > 1) {
            this.logger.debug('queue length is not zero')
            musicQueue.shift()
            this.musicQueue.set(guildId, musicQueue)
            await this.playSong(message)
            return
        }

        this.logger.debug('queue empty')
        setTimeout(() => {
            if ((this.musicQueue.get(guildId) || []).length <= 1 && !this.isPlaying.get(guildId)) {
                this.musicQueue.set(guildId, [])
                this.isPlaying.set(guildId, false)
                this.volume.set(guildId, 1)

                channel
                    .send(`Disconnected from channel due to inactivity`)
                    .then(msg =>
                        setTimeout(
                            () => msg.delete(),
                            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                        ),
                    )
                this.connection.get(guildId)?.destroy()
                this.connection.delete(guildId)
            }
        }, 180000)
    }

    @HandleDiscordError()
    private async createPlayer(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException('guildId not specified')

        const player: AudioPlayer = createAudioPlayer()
        const channel = message.channel as TextChannel

        player
            .on(AudioPlayerStatus.Playing, () =>
                this.playerWrapper(() => this.playerOnPlayHandler(message), guildId),
            )
            .on(AudioPlayerStatus.Idle, () =>
                this.playerWrapper(() => this.playerIdleHandler(message), guildId),
            )
            .on('error', async err => {
                this.logger.error('fatal error occurred', {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                })

                const musicQueue = this.musicQueue.get(guildId)
                this.isPlaying.set(guildId, false)
                this.deleteCurrentInfoMsg(guildId)

                if (!musicQueue) {
                    return channel
                        .send('Queue does not exist')
                        .then(msg =>
                            setTimeout(
                                () => msg.delete(),
                                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                            ),
                        )
                }

                if (err.message === 'Status code: 410') {
                    return channel
                        .send(`Unplayable Song: ${musicQueue[0].title}`)
                        .then(msg =>
                            setTimeout(
                                () => msg.delete(),
                                this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                            ),
                        )
                }

                await channel
                    .send('fatal error occurred, skipping ,,')
                    .then(msg =>
                        setTimeout(
                            () => msg.delete(),
                            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                        ),
                    )

                const exception = new DiscordClientException(err.message, 'player')
                exception.stack = err.stack
                await this.discordNotificationService.sendErrorReport(exception)
            })

        return player
    }

    @HandleDiscordError()
    public async playSong(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordClientException('guildId not specified')

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
            requestOptions: {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            },
        }).on('error', async (error: any) => {
            this.logger.error('ytdl create readable stream error', error)
            await this.discordNotificationService.sendErrorReport(error)
        })

        const resource: AudioResource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
        })
        let connection = this.connection.get(guildId)

        if (!connection) {
            if (!message.guild)
                return channel.send(`Error occurred on joining voice channel\nguild is not defined`)

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
            connection.subscribe(player)
        } catch (err: any) {
            this.logger.error(err)
            await channel.send('Error occurred on player.play()')
            throw new DiscordClientException(err.message)
        } finally {
            await this.songService.create({url: nextSong.url, title: nextSong.title})
        }
    }

    public deleteCurrentInfoMsg(guildId: string) {
        const currentInfoMsg = this.currentInfoMsg.get(guildId)
        currentInfoMsg?.delete()
        this.currentInfoMsg.delete(guildId)
    }

    public setDeleteQueue(guildId: string, message: Message | InteractionResponse) {
        if (!guildId.length)
            throw new DiscordClientException('guildId not specified', this.setDeleteQueue.name)
        this.deleteQueue.set(
            guildId,
            (this.deleteQueue.get(guildId) || new Map<string, Message | InteractionResponse>()).set(
                message.id,
                message,
            ),
        )
    }

    public removeFromDeleteQueue(guildId: string, id: string) {
        const innerMap = this.deleteQueue.get(guildId)
        if (!innerMap)
            throw new DiscordClientException(
                'data does not exist in delete queue',
                this.removeFromDeleteQueue.name,
            )

        innerMap.get(id)?.delete()
        innerMap.delete(id)
        this.deleteQueue.set(guildId, innerMap)
    }

    public removeGuildFromDeleteQueue(guildId: string) {
        const innerMap = this.deleteQueue.get(guildId)
        if (!innerMap) return

        Array.from(innerMap.keys()).forEach(key => innerMap.get(key)?.delete)
        this.deleteQueue.delete(guildId)
    }

    public getConnection(guildId: string): VoiceConnection {
        const connection = this.connection.get(guildId)
        if (!connection)
            throw new DiscordClientException('no such connection', this.getConnection.name)
        return connection
    }

    public setConnection(guildId: string, conn: VoiceConnection): void {
        this.connection.set(guildId, conn)
    }

    public deleteConnection(guildId: string): void {
        this.connection.delete(guildId)
    }

    public getTotalMusicQueue() {
        return this.musicQueue
    }

    public getMusicQueue(guildId: string): Song[] {
        return this.musicQueue.get(guildId) || []
    }

    public setMusicQueue(guildId: string, queue: Song[]): void {
        this.musicQueue.set(guildId, queue)
    }

    public shuffleMusicQueue(guildId: string): void {
        const shuffle = (queue: Song[]) => {
            for (let i = queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                ;[queue[i], queue[j]] = [queue[j], queue[i]]
            }

            return queue
        }

        const queue = this.musicQueue.get(guildId)
        if (!queue) {
            this.logger.debug('queue does not exist')
            return
        }

        const current = queue.shift()
        if (!current) {
            this.logger.debug('queue is empty')
            return
        }

        const shuffled = shuffle(queue)
        shuffled.unshift(current)
        this.musicQueue.set(guildId, shuffled)
    }

    public getIsPlaying(guildId: string): boolean {
        return this.isPlaying.get(guildId) || false
    }

    public setIsPlaying(guildId: string, isPlaying: boolean): void {
        this.isPlaying.set(guildId, isPlaying)
    }

    public getVolume(guildId: string): number {
        return this.volume.get(guildId) || 1
    }

    public setVolume(guildId: string, volume: number): void {
        this.volume.set(guildId, volume)
    }

    public getPlayer(guildId: string): AudioPlayer {
        const player = this.player.get(guildId)
        if (!player) throw new DiscordClientException('No player found', this.getPlayer.name)
        return player
    }

    public setPlayer(guildId: string, player: AudioPlayer): void {
        this.player.set(guildId, player)
    }

    public deletePlayer(guildId: string): void {
        this.player.delete(guildId)
    }

    public getClient() {
        return this.discordBotClient
    }

    public getUser() {
        return this.discordBotClient.user?.tag
    }

    public get Rest() {
        return this.rest
    }

    public set Rest(rest: REST) {
        this.rest = rest
    }
}
