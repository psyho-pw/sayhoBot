import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DiscordClientService } from './client/client.service';
import { DiscordCommandService } from './command/command.service';
import { DiscordService } from './discord.service';
import { DiscordEventService } from './event/event.service';
import { DiscordNotificationService } from './notification/notification.service';
import { PlayerService } from './player/player.service';
import { StreamService } from './player/stream.service';
import { ChannelStateManager } from './state/channel-state.manager';
import { DiscordErrorAspect } from '../common/aop';
import { SongModule } from '../song/song.module';

@Module({
  imports: [HttpModule, SongModule],
  providers: [
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
