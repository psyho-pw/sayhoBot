import { Readable } from 'stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { AudioResource } from '../../domain/ports/audio-player.port';
import { IPoTokenService, PoTokenServicePort } from '../../domain/ports/po-token.port';
import { IStreamProvider } from '../../domain/ports/stream-provider.port';

@Injectable()
export class StreamProviderAdapter implements IStreamProvider {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(PoTokenServicePort)
    private readonly poTokenService: IPoTokenService,
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

    const tokenData = this.poTokenService.getPoToken();
    const poToken = tokenData?.poToken || undefined;
    const visitorData = tokenData?.visitorData || undefined;

    return new YtdlCore({
      clients: ['ios', 'android', 'tv'],
      fetcher: proxyAgent ? this.createProxyFetcher(proxyAgent) : undefined,
      poToken,
      visitorData,
      disablePoTokenAutoGeneration: true,
      highWaterMark: 1024 * 1024 * 32,
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
