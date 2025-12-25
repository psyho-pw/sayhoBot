import { Readable } from 'stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { ConfigServiceKey } from '../../../config/config.service';
import { IConfigService } from '../../../config/config.type';
import { AudioResource } from '../../domain/ports/audio-player.port';
import { IStreamProvider } from '../../domain/ports/stream-provider.port';

@Injectable()
export class StreamProviderAdapter implements IStreamProvider {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
  ) {}

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

  async createStream(url: string): Promise<Readable> {
    const ytdl = this.createYtdlClient();
    const webStream = await ytdl.download(url, {
      filter: 'audioandvideo',
    });
    return toPipeableStream(webStream);
  }

  createAudioResource(stream: Readable): AudioResource {
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });

    return {
      id: Math.random().toString(36).substring(7),
      stream,
      _internal: resource,
    } as AudioResource & { _internal: any };
  }

  async createAudioResourceFromUrl(url: string): Promise<AudioResource> {
    const stream = await this.createStream(url);
    return this.createAudioResource(stream);
  }
}
