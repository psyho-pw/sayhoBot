import {Module} from '@nestjs/common'
import {HttpModule} from '@nestjs/axios'
import {SongModule} from '../song/song.module'
import {DiscordService} from './discord.service'
import {DiscordClientService} from './discord.client.service'
import {DiscordCommandService} from './discord.command.service'
import {DiscordEventService} from './discord.event.service'
import {DiscordNotificationService} from './discord.notification.service'

@Module({
    imports: [HttpModule, SongModule],
    providers: [
        DiscordService,
        DiscordClientService,
        DiscordCommandService,
        DiscordEventService,
        DiscordNotificationService,
    ],
    exports: [DiscordService, DiscordNotificationService],
})
export class DiscordModule {}
