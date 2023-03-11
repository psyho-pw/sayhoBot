import {Module} from '@nestjs/common'

import {HttpModule} from '@nestjs/axios'
import {DiscordNotificationService} from './services/discord.notification.service'
import {DiscordClientService} from './services/discord.client.service'
import {DiscordCommandService} from './services/discord.command.service'
import {DiscordEventService} from './services/discord.event.service'
import {DiscordService} from './services/discord.service'

@Module({
    imports: [HttpModule],
    providers: [DiscordService, DiscordClientService, DiscordCommandService, DiscordEventService, DiscordNotificationService],
    exports: [DiscordService, DiscordNotificationService],
})
export class DiscordModule {}
