import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DiscordErrorAspect } from '../common/aop';
import { SongModule } from '../song/song.module';
import { PlayMusicUseCase } from './application/play-music.usecase';
import { QueueStateManager } from './application/queue-state.manager';
import { SearchVideoUseCase } from './application/search-video.usecase';
import { DiscordService } from './discord.service';
import { NotificationPort } from './domain/ports/notification.port';
import { PoTokenServicePort } from './domain/ports/po-token.port';
import { StreamProviderPort } from './domain/ports/stream-provider.port';
import { VoiceConnectionManagerPort } from './domain/ports/voice-connection.port';
import { YoutubeSearchPort } from './domain/ports/youtube-search.port';
import { ChannelStateAdapter } from './infrastructure/discord-client/channel-state.adapter';
import { DiscordClientAdapter } from './infrastructure/discord-client/discord-client.adapter';
import { PlayerAdapter } from './infrastructure/discord-client/player.adapter';
import { NotificationAdapter } from './infrastructure/notification/notification.adapter';
import { StreamProviderAdapter } from './infrastructure/voice/stream-provider.adapter';
import { VoiceConnectionAdapter } from './infrastructure/voice/voice-connection.adapter';
import { PoTokenAdapter } from './infrastructure/youtube/po-token.adapter';
import { YoutubeSearchAdapter } from './infrastructure/youtube/youtube-search.adapter';
import { CommandHandler } from './presentation/commands/command.handler';
import { EventHandler } from './presentation/events/event.handler';

@Module({
  imports: [HttpModule, SongModule],
  providers: [
    // AOP
    DiscordErrorAspect,

    // Application layer
    QueueStateManager,
    PlayMusicUseCase,
    SearchVideoUseCase,

    // Infrastructure - Port implementations
    { provide: YoutubeSearchPort, useClass: YoutubeSearchAdapter },
    { provide: PoTokenServicePort, useClass: PoTokenAdapter },
    { provide: StreamProviderPort, useClass: StreamProviderAdapter },
    { provide: VoiceConnectionManagerPort, useClass: VoiceConnectionAdapter },
    { provide: NotificationPort, useClass: NotificationAdapter },

    // Infrastructure - Discord adapters
    ChannelStateAdapter,
    PlayerAdapter,
    DiscordClientAdapter,

    // Presentation layer
    CommandHandler,
    EventHandler,

    // Main service
    DiscordService,
  ],
  exports: [DiscordService, NotificationPort],
})
export class DiscordModule {}
