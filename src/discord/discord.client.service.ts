import { Inject, Injectable } from '@nestjs/common'
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
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { DiscordNotificationService } from './discord.notification.service'
import { AppConfigService } from '../config/config.service'
import { SongService } from '../song/song.service'
import { HandleDiscordError } from '../common/aop'
import { DiscordException } from '../common/exceptions/discord.exception'
import { Song } from './discord.model'
import { Video } from './discord.type'
import { ChannelStateManager } from './state'

@Injectable()
export class DiscordClientService {
    discordBotClient: Client
    public commands: Collection<string, any> = new Collection()
    private rest: REST

    constructor(
        private readonly configService: AppConfigService,
        private readonly songService: SongService,
        private readonly discordNotificationService: DiscordNotificationService,
        private readonly stateManager: ChannelStateManager,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

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
            this.logger.verbose('DiscordBotClient instance initialized')
        } catch (err) {
            console.error(err)
            throw new DiscordException('login failed', 'client')
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
            const player = this.stateManager.getPlayer(guildId)
            if (!player) return this.logger.error('player not found')
            player.emit('error', err)
        }
    }

    @HandleDiscordError({ bubble: true })
    private async playerOnPlayHandler(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId || ''
        if (this.stateManager.getIsPlaying(guildId)) return

        const channel = message.channel as TextChannel
        const musicQueue = this.stateManager.getMusicQueue(guildId)
        if (!musicQueue.length) throw new DiscordException('Queue does not exist', 'client')

        const currentItem = musicQueue[0]
        if (!currentItem) throw new DiscordException('Queue item is corrupted', 'client')

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`:: Currently playing :arrow_forward: ::`)
            .setURL(currentItem.url)
            .setThumbnail(currentItem.thumbnail)
            .setDescription(`${currentItem.title} (${currentItem.duration})`)

        const msg = await channel.send({embeds: [embed]})
        this.stateManager.setCurrentInfoMsg(guildId, msg)
        this.logger.info(`Currently playing ${currentItem.title}`)

        this.stateManager.setIsPlaying(guildId, true)
    }

    @HandleDiscordError({ bubble: true })
    private async playerIdleHandler(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordException('guildId not specified', 'client')

        const channel = message.channel as TextChannel

        this.stateManager.deleteCurrentInfoMsg(guildId)
        const musicQueue = this.stateManager.getMusicQueue(guildId)
        if (!musicQueue.length) throw new DiscordException('Queue does not exist', 'client')

        this.stateManager.setIsPlaying(guildId, false)

        if (musicQueue.length > 1) {
            this.logger.debug('queue length is not zero')
            musicQueue.shift()
            this.stateManager.setMusicQueue(guildId, musicQueue)
            await this.playSong(message)
            return
        }

        this.logger.debug('queue empty')
        setTimeout(() => {
            const currentQueue = this.stateManager.getMusicQueue(guildId)
            if (currentQueue.length <= 1 && !this.stateManager.getIsPlaying(guildId)) {
                this.stateManager.setMusicQueue(guildId, [])
                this.stateManager.setIsPlaying(guildId, false)
                this.stateManager.setVolume(guildId, 1)

                channel
                    .send(`Disconnected from channel due to inactivity`)
                    .then(msg =>
                        setTimeout(
                            () => msg.delete(),
                            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                        ),
                    )
                this.stateManager.getConnection(guildId)?.destroy()
                this.stateManager.deleteConnection(guildId)
            }
        }, 180000)
    }

    @HandleDiscordError()
    private async createPlayer(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordException('guildId not specified', 'client')

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

                const musicQueue = this.stateManager.getMusicQueue(guildId)
                this.stateManager.setIsPlaying(guildId, false)
                this.stateManager.deleteCurrentInfoMsg(guildId)

                if (!musicQueue.length) {
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

                const exception = new DiscordException(err.message, 'client', 'player')
                exception.stack = err.stack
                await this.discordNotificationService.sendErrorReport(exception)
            })

        return player
    }

    @HandleDiscordError()
    public async playSong(message: Message | ChatInputCommandInteraction) {
        const guildId = message.guildId
        if (!guildId) throw new DiscordException('guildId not specified', 'client')

        const channel = message.channel as TextChannel
        const musicQueue = this.stateManager.getMusicQueue(guildId)
        if (!musicQueue.length) return channel.send('No Queue found')

        const video = await musicQueue[0].video.fetch()
        const nextSong: Song | null = this.formatVideo(video, musicQueue[0].voiceChannel)
        if (!nextSong) return channel.send('Cannot fetch next song')

        musicQueue[0] = nextSong
        this.stateManager.setMusicQueue(guildId, musicQueue)

        const proxyUrl = this.configService.getAppConfig().PROXY
        const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

        const createProxyFetcher = (agent: ProxyAgent) => {
            return (url: URL | RequestInfo, options?: RequestInit): Promise<Response> =>
                undiciFetch(url.toString(), {
                    ...((options ?? {}) as Record<string, unknown>),
                    dispatcher: agent,
                }) as Promise<Response>
        }

        const ytdl = new YtdlCore({
            clients: ['ios', 'android', 'tv'],
            fetcher: proxyAgent ? createProxyFetcher(proxyAgent) : undefined,
        })
        const webStream = await ytdl.download(musicQueue[0].url, {
            filter: 'audioandvideo',
        })
        const stream = toPipeableStream(webStream)

        stream.on('error', async (error: any) => {
            this.logger.error('ytdl stream error', error)
            await this.discordNotificationService.sendErrorReport(error)
        })

        const resource: AudioResource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
        })
        let connection = this.stateManager.getConnection(guildId)

        if (!connection) {
            if (!message.guild)
                return channel.send(`Error occurred on joining voice channel\nguild is not defined`)

            connection = joinVoiceChannel({
                channelId: musicQueue[0].voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
            })

            this.stateManager.setConnection(guildId, connection)
            this.stateManager.setIsPlaying(guildId, false)
            this.stateManager.setVolume(guildId, 1)
        }

        let player = this.stateManager.getPlayer(guildId)
        if (!player) {
            const newPlayer = await this.createPlayer(message)
            this.stateManager.setPlayer(guildId, newPlayer)
            player = newPlayer
        }

        try {
            player.play(resource)
            connection.subscribe(player)
        } catch (err: any) {
            this.logger.error(err)
            await channel.send('Error occurred on player.play()')
            throw new DiscordException(err.message, 'client')
        } finally {
            await this.songService.create({url: nextSong.url, title: nextSong.title})
        }
    }

    // Delegate methods to ChannelStateManager
    public deleteCurrentInfoMsg(guildId: string): void {
        this.stateManager.deleteCurrentInfoMsg(guildId)
    }

    public setDeleteQueue(guildId: string, message: Message | InteractionResponse): void {
        if (!guildId.length)
            throw new DiscordException('guildId not specified', 'client', this.setDeleteQueue.name)
        this.stateManager.addToDeleteQueue(guildId, message)
    }

    public removeFromDeleteQueue(guildId: string, id: string): void {
        this.stateManager.removeFromDeleteQueue(guildId, id)
    }

    public removeGuildFromDeleteQueue(guildId: string): void {
        this.stateManager.clearDeleteQueue(guildId)
    }

    public getConnection(guildId: string): VoiceConnection | null {
        return this.stateManager.getConnection(guildId)
    }

    public setConnection(guildId: string, conn: VoiceConnection): void {
        this.stateManager.setConnection(guildId, conn)
    }

    public deleteConnection(guildId: string): void {
        this.stateManager.deleteConnection(guildId)
    }

    public getTotalMusicQueue(): Map<string, import('./state').ChannelState> {
        return this.stateManager.getAll()
    }

    public getMusicQueue(guildId: string): Song[] {
        return this.stateManager.getMusicQueue(guildId)
    }

    public setMusicQueue(guildId: string, queue: Song[]): void {
        this.stateManager.setMusicQueue(guildId, queue)
    }

    public shuffleMusicQueue(guildId: string): void {
        this.stateManager.shuffleMusicQueue(guildId)
    }

    public getIsPlaying(guildId: string): boolean {
        return this.stateManager.getIsPlaying(guildId)
    }

    public setIsPlaying(guildId: string, isPlaying: boolean): void {
        this.stateManager.setIsPlaying(guildId, isPlaying)
    }

    public getVolume(guildId: string): number {
        return this.stateManager.getVolume(guildId)
    }

    public setVolume(guildId: string, volume: number): void {
        this.stateManager.setVolume(guildId, volume)
    }

    public getPlayer(guildId: string): AudioPlayer {
        const player = this.stateManager.getPlayer(guildId)
        if (!player) throw new DiscordException('No player found', 'client', this.getPlayer.name)
        return player
    }

    public setPlayer(guildId: string, player: AudioPlayer): void {
        this.stateManager.setPlayer(guildId, player)
    }

    public deletePlayer(guildId: string): void {
        this.stateManager.deletePlayer(guildId)
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
