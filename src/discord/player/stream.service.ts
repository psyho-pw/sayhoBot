import { Readable } from 'stream';
import { AudioResource, createAudioResource, StreamType } from '@discordjs/voice';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { LoggerServiceKey, ILoggerService } from 'src/common/logger/logger.interface';
import { IConfigService } from 'src/config/config.type';
import { ConfigServiceKey } from '../../config/config.service';
import { DiscordNotificationService } from '../discord.notification.service';

@Injectable()
export class StreamService {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
    private readonly notificationService: DiscordNotificationService,
    @Inject(forwardRef(() => LoggerServiceKey))
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(StreamService.name);
  }

  private createProxyFetcher(agent: ProxyAgent) {
    return (url: URL | RequestInfo, options?: RequestInit): Promise<Response> =>
      undiciFetch(url.toString(), {
        ...((options ?? {}) as Record<string, unknown>),
        dispatcher: agent,
      }) as unknown as Promise<Response>;
  }

  private createYtdlClient(): YtdlCore {
    const proxyUrl = this.configService.appConfig.PROXY;
    const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

    return new YtdlCore({
      clients: ['ios', 'android', 'tv'],
      fetcher: proxyAgent ? this.createProxyFetcher(proxyAgent) : undefined,
    });
  }

  public async createStream(url: string): Promise<Readable> {
    const ytdl = this.createYtdlClient();
    const webStream = await ytdl.download(url, {
      filter: 'audioandvideo',
    });
    const stream = toPipeableStream(webStream);

    stream.on('error', async (error: any) => {
      this.logger.error({
        ctx: this.createStream.name,
        info: error,
        message: error.message,
      });
      await this.notificationService.sendErrorReport(error);
    });

    return stream;
  }

  public createAudioResource(stream: Readable): AudioResource {
    return createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });
  }

  public async createAudioResourceFromUrl(url: string): Promise<AudioResource> {
    const stream = await this.createStream(url);
    return this.createAudioResource(stream);
  }
}
