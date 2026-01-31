import { Readable } from 'stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { ILoggerService, LoggerServiceKey } from '../../../common/modules/logger/logger.interface';
import { AudioResource } from '../../domain/ports/audio-player.port';
import { IPoTokenService, PoTokenServicePort } from '../../domain/ports/po-token.port';
import { IStreamProvider } from '../../domain/ports/stream-provider.port';

@Injectable()
export class StreamProviderAdapter implements IStreamProvider {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(PoTokenServicePort)
    private readonly poTokenService: IPoTokenService,
    @Inject(LoggerServiceKey)
    private readonly loggerService: ILoggerService,
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
    const proxyAgent = proxyUrl
      ? new ProxyAgent({
          uri: proxyUrl,
          keepAliveTimeout: 60000, // 60초
          keepAliveMaxTimeout: 600000, // 10분
          connect: {
            timeout: 30000, // 연결 타임아웃 30초
          },
        })
      : undefined;

    const tokenData = this.poTokenService.getPoToken();
    const poToken = tokenData?.poToken || undefined;
    const visitorData = tokenData?.visitorData || undefined;

    if (proxyAgent) {
      this.loggerService.debug({
        ctx: this.createYtdlClient.name,
        info: `Using proxy: ${proxyUrl?.replace(/:[^:@]+@/, ':***@')}`, // 비밀번호 마스킹
      });
    }

    return new YtdlCore({
      clients: ['ios', 'android', 'tv'],
      fetcher: proxyAgent ? this.createProxyFetcher(proxyAgent) : undefined,
      poToken,
      visitorData,
      disablePoTokenAutoGeneration: true,
      highWaterMark: 1024 * 1024 * 32,
    });
  }

  private async createStreamWithRetry(url: string, maxRetries: number = 2): Promise<Readable> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const ytdl = this.createYtdlClient();
        const webStream = await ytdl.download(url, { filter: 'audioandvideo' });

        if (attempt > 1) {
          this.loggerService.info({
            ctx: this.createStreamWithRetry.name,
            info: `Successfully created stream on attempt ${attempt} for ${url}`,
          });
        }

        return toPipeableStream(webStream);
      } catch (error: any) {
        lastError = error;

        // 재시도 가능한 에러인지 확인
        const isRetryable =
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ECONNREFUSED' ||
          error?.syscall === 'connect';

        if (!isRetryable || attempt === maxRetries) {
          break;
        }

        this.loggerService.warn({
          ctx: this.createStreamWithRetry.name,
          info: `Retrying stream creation (attempt ${attempt}/${maxRetries}) for ${url}: ${error?.message}`,
        });

        // 재시도 전 잠시 대기 (백오프)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw lastError;
  }

  async createStream(url: string): Promise<Readable> {
    try {
      return await this.createStreamWithRetry(url);
    } catch (error: any) {
      // 상세한 에러 로깅
      this.loggerService.error({
        ctx: this.createStream.name,
        info: `Stream creation error for ${url}: ${JSON.stringify({
          message: error?.message,
          code: error?.code,
          errno: error?.errno,
          syscall: error?.syscall,
          stack: error?.stack?.split('\n').slice(0, 3).join('\n'),
        })}`,
      });

      // 네트워크/프록시 관련 에러
      const isNetworkError =
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNRESET' ||
        error?.syscall === 'connect' ||
        error?.message?.includes('proxy') ||
        error?.message?.includes('PROXY');

      if (isNetworkError) {
        throw new Error(
          `Network/Proxy connection failed (${error?.code || error?.syscall}). Please check proxy settings. URL: ${url}`,
        );
      }

      // YouTube API/인증 관련 에러
      const isAuthError =
        error?.statusCode === 403 ||
        error?.statusCode === 401 ||
        error?.message?.includes('Sign in') ||
        error?.message?.includes('authentication');

      if (isAuthError) {
        throw new Error(`YouTube authentication failed. PoToken may be expired. URL: ${url}`);
      }

      // 영상 정보 없음 (삭제/비공개)
      const isMediaNotFound =
        error?.message?.includes('formats') ||
        error?.message?.includes('Cannot read properties of null') ||
        error?.statusCode === 404;

      if (isMediaNotFound) {
        throw new Error(
          `Cannot get YouTube video information. The video may have been deleted or made private. URL: ${url}`,
        );
      }

      // 기타 에러
      throw new Error(
        `An error occurred while creating the stream: ${error?.message || error}. URL: ${url}`,
      );
    }
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
