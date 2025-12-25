import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BG } from 'bgutils-js';
import { JSDOM } from 'jsdom';
import { fetch } from 'undici';
import { ILoggerService, LoggerServiceKey } from 'src/common/modules/logger/logger.interface';
import { IPoTokenService, PoTokenData } from '../../domain/ports/po-token.port';

const YOUTUBE_VIDEO_ID = 'dQw4w9WgXcQ';
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

@Injectable()
export class PoTokenAdapter implements IPoTokenService, OnModuleInit {
  private tokenData: PoTokenData | null = null;
  private isRefreshing = false;
  private readonly TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  constructor(
    @Inject(LoggerServiceKey)
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(PoTokenAdapter.name);
  }

  async onModuleInit(): Promise<void> {
    await this.refreshPoToken();
  }

  getPoToken(): PoTokenData | null {
    return this.tokenData;
  }

  isTokenValid(): boolean {
    if (!this.tokenData) return false;

    const elapsed = Date.now() - this.tokenData.generatedAt.getTime();
    return elapsed < this.TOKEN_TTL_MS;
  }

  private async fetchVisitorData(): Promise<string> {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.00.00',
            },
          },
          videoId: YOUTUBE_VIDEO_ID,
        }),
      },
    );

    const data = (await response.json()) as { responseContext?: { visitorData?: string } };
    return data.responseContext?.visitorData || '';
  }

  async refreshPoToken(): Promise<PoTokenData> {
    if (this.isRefreshing) {
      this.logger.verbose({
        ctx: this.refreshPoToken.name,
        info: 'Token refresh already in progress',
      });
      return this.tokenData ?? { poToken: '', visitorData: '', generatedAt: new Date() };
    }

    this.isRefreshing = true;

    try {
      this.logger.info({ ctx: this.refreshPoToken.name, info: 'Generating new poToken...' });

      // Setup JSDOM for BG
      const dom = new JSDOM();
      Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
      });

      // Fetch visitor data from YouTube
      const visitorData = await this.fetchVisitorData();
      if (!visitorData) {
        throw new Error('Failed to fetch visitorData from YouTube');
      }

      this.logger.verbose({
        ctx: this.refreshPoToken.name,
        info: 'VisitorData fetched successfully',
      });

      // Generate poToken using bgutils-js
      const bgConfig = {
        fetch: fetch as unknown as typeof globalThis.fetch,
        globalObj: globalThis,
        identifier: visitorData,
        requestKey: REQUEST_KEY,
      };

      const challenge = await BG.Challenge.create(bgConfig);
      if (!challenge) {
        throw new Error('Failed to create BG challenge');
      }

      const interpreterJs =
        challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;
      if (interpreterJs) {
        new Function(interpreterJs)();
      } else {
        throw new Error('Failed to load interpreter JavaScript');
      }

      const poTokenResult = await BG.PoToken.generate({
        program: challenge.program,
        globalName: challenge.globalName,
        bgConfig,
      });

      const poToken = poTokenResult.poToken || '';

      this.tokenData = {
        poToken,
        visitorData,
        generatedAt: new Date(),
      };

      this.logger.info({
        ctx: this.refreshPoToken.name,
        info: `poToken generated successfully (length: ${poToken.length})`,
      });

      return this.tokenData;
    } catch (error) {
      this.logger.error({
        ctx: this.refreshPoToken.name,
        info: error,
        message: 'Error generating poToken',
      });

      // Keep existing token if available, otherwise set empty
      if (!this.tokenData) {
        this.tokenData = {
          poToken: '',
          visitorData: '',
          generatedAt: new Date(),
        };
      }

      return this.tokenData;
    } finally {
      this.isRefreshing = false;
    }
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async handleCron(): Promise<void> {
    this.logger.info({ ctx: this.handleCron.name, info: 'Scheduled poToken refresh started' });
    await this.refreshPoToken();
  }
}
