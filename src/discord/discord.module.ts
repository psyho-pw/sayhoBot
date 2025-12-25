import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DiscordErrorAspect } from '../common/aop';
import { SongModule } from '../song/song.module';
import { PlayMusicUseCase } from './application/play-music.usecase';
import { QueueStateManager } from './application/queue-state.manager';
import { SearchVideoUseCase } from './application/search-video.usecase';
import { DiscordClientService } from './client/client.service';
import { DiscordCommandService } from './command/command.service';
import { DiscordService } from './discord.service';
import { StreamProviderPort } from './domain/ports/stream-provider.port';
import { VoiceConnectionManagerPort } from './domain/ports/voice-connection.port';
import { YoutubeSearchPort } from './domain/ports/youtube-search.port';
import { DiscordEventService } from './event/event.service';
import { StreamProviderAdapter } from './infrastructure/voice/stream-provider.adapter';
import { VoiceConnectionAdapter } from './infrastructure/voice/voice-connection.adapter';
import { YoutubeSearchAdapter } from './infrastructure/youtube/youtube-search.adapter';
import { DiscordNotificationService } from './notification/notification.service';
import { PlayerService } from './player/player.service';
import { StreamService } from './player/stream.service';
import { ChannelStateManager } from './state/channel-state.manager';

@Module({
  imports: [HttpModule, SongModule],
  providers: [
    // Clean Architecture - Application layer
    QueueStateManager,
    PlayMusicUseCase,
    SearchVideoUseCase,

    // Clean Architecture - Infrastructure adapters (Port implementations)
    {
      provide: YoutubeSearchPort,
      useClass: YoutubeSearchAdapter,
    },
    {
      provide: StreamProviderPort,
      useClass: StreamProviderAdapter,
    },
    {
      provide: VoiceConnectionManagerPort,
      useClass: VoiceConnectionAdapter,
    },

    // Legacy services (maintained for compatibility)
    DiscordService,
    DiscordClientService,
    DiscordCommandService,
    DiscordEventService,
    DiscordNotificationService,
    DiscordErrorAspect,
    ChannelStateManager,
    PlayerService,
    StreamService,
  ],
  exports: [DiscordService, DiscordNotificationService],
})
export class DiscordModule {}
