import { Inject, Injectable } from '@nestjs/common'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'
import { Logger } from 'winston'
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core'
import { fetch as undiciFetch, ProxyAgent } from 'undici'
import { AudioResource, createAudioResource, StreamType } from '@discordjs/voice'
import { AppConfigService } from '../../config/config.service'
import { DiscordNotificationService } from '../discord.notification.service'
import { Readable } from 'stream'

@Injectable()
export class StreamService {
    constructor(
        private readonly configService: AppConfigService,
        private readonly notificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    private createProxyFetcher(agent: ProxyAgent) {
        return (url: URL | RequestInfo, options?: RequestInit): Promise<Response> =>
            undiciFetch(url.toString(), {
                ...((options ?? {}) as Record<string, unknown>),
                dispatcher: agent,
            }) as Promise<Response>
    }

    private createYtdlClient(): YtdlCore {
        const proxyUrl = this.configService.getAppConfig().PROXY
        const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

        return new YtdlCore({
            clients: ['ios', 'android', 'tv'],
            fetcher: proxyAgent ? this.createProxyFetcher(proxyAgent) : undefined,
        })
    }

    public async createStream(url: string): Promise<Readable> {
        const ytdl = this.createYtdlClient()
        const webStream = await ytdl.download(url, {
            filter: 'audioandvideo',
        })
        const stream = toPipeableStream(webStream)

        stream.on('error', async (error: any) => {
            this.logger.error('ytdl stream error', error)
            await this.notificationService.sendErrorReport(error)
        })

        return stream
    }

    public createAudioResource(stream: Readable): AudioResource {
        return createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
        })
    }

    public async createAudioResourceFromUrl(url: string): Promise<AudioResource> {
        const stream = await this.createStream(url)
        return this.createAudioResource(stream)
    }
}
