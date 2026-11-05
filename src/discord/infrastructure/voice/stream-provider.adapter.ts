import { spawn } from 'child_process';
import { Readable } from 'stream';
import { createAudioResource, StreamType } from '@discordjs/voice';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigServiceKey } from 'src/common/modules/config/config.service';
import { IConfigService } from 'src/common/modules/config/config.type';
import { ILoggerService, LoggerServiceKey } from '../../../common/modules/logger/logger.interface';
import { AudioResource } from '../../domain/ports/audio-player.port';
import { IStreamProvider } from '../../domain/ports/stream-provider.port';

const STREAM_START_TIMEOUT_MS = 60_000;

@Injectable()
export class StreamProviderAdapter implements IStreamProvider {
  constructor(
    @Inject(ConfigServiceKey) private readonly configService: IConfigService,
    @Inject(LoggerServiceKey)
    private readonly loggerService: ILoggerService,
  ) {}

  private buildArgs(url: string): string[] {
    const args = [
      '-f',
      'bestaudio/best',
      '-o',
      '-',
      '--no-playlist',
      '--no-progress',
      '--quiet',
      '--no-warnings',
      '--socket-timeout',
      '30',
      '--js-runtimes',
      'node',
    ];
    const proxy = this.configService.appConfig.PROXY;
    if (proxy) args.push('--proxy', proxy);
    return [...args, '--', url];
  }

  createStream(url: string): Promise<Readable> {
    const child = spawn('yt-dlp', this.buildArgs(url), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-2000)));
    child.stdout.once('close', () => child.kill());

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        fail(new Error(`yt-dlp timed out after ${STREAM_START_TIMEOUT_MS}ms`));
      }, STREAM_START_TIMEOUT_MS);

      const fail = (error: Error) => {
        clearTimeout(timer);
        this.loggerService.error({
          ctx: this.createStream.name,
          info: `Stream creation error for ${url}: ${error.message}`,
        });
        reject(error);
      };

      child.once('error', (error) => fail(new Error(`yt-dlp spawn failed: ${error.message}`)));
      child.stdout.once('readable', () => {
        if (child.stdout.readableLength === 0) return;
        clearTimeout(timer);
        resolve(child.stdout);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        if (code === 0 || signal) return reject(new Error(`yt-dlp produced no audio: ${url}`));
        fail(new Error(`yt-dlp exited with code ${code}: ${stderr.trim() || 'no output'}`));
      });
    });
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
