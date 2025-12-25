import {HttpModule} from '@nestjs/axios';
import {Module} from '@nestjs/common';
import {DiscordClientService} from './discord.client.service';
import {DiscordCommandService} from './discord.command.service';
import {DiscordEventService} from './discord.event.service';
import {DiscordNotificationService} from './discord.notification.service';
import {DiscordService} from './discord.service';
import {PlayerService, StreamService} from './player';
import {ChannelStateManager} from './state';
import {DiscordErrorAspect} from '../common/aop';
import {SongModule} from '../song/song.module';

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
