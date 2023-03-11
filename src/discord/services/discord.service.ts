import {Inject, Injectable} from '@nestjs/common'
import {DiscordClientService} from './discord.client.service'
import {DiscordCommandService} from './discord.command.service'
import {DiscordEventService} from './discord.event.service'
import {DiscordNotificationService} from './discord.notification.service'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {AppConfigService} from '../../config/config.service'
import {Client, ClientEvents, Interaction, Message, SlashCommandBuilder, VoiceState} from 'discord.js'
import {GeneralException} from '../../common/exceptions/general.exception'

@Injectable()
export class DiscordService {
    constructor(
        private readonly configService: AppConfigService,
        private readonly discordClientService: DiscordClientService,
        private readonly discordCommandService: DiscordCommandService,
        private readonly discordEventService: DiscordEventService,
        private readonly discordNotificationService: DiscordNotificationService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {
        this.init().then(() => this.logger.verbose('✅  DiscordService instance initialized'))
    }

    async errorHandler(handler: () => Promise<any>) {
        try {
            await handler()
        } catch (err) {
            if (err instanceof GeneralException) {
                await this.discordNotificationService.sendMessage(err.message, err.getCalledFrom(), [{name: 'stack', value: (err.stack || '').substring(0, 1024)}])
                return
            }
            await this.discordNotificationService.sendMessage(err.message, 'Unhandled Error', [{name: 'stack', value: (err.stack || '').substring(0, 1024)}])
        }
    }

    async init() {
        await this.discordClientService.init()
        //commands
        const playCommand = new SlashCommandBuilder().setName('p').setDescription('Plays music with uri')
        this.discordClientService.commands.set(playCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.play(message)))

        const emptyQueueCommand = new SlashCommandBuilder().setName('eq').setDescription('Empty music queue')
        this.discordClientService.commands.set(emptyQueueCommand.name.toLowerCase(), (message: Message) =>
            this.errorHandler(() => this.discordCommandService.emptyQueue(message)),
        )

        const helpCommand = new SlashCommandBuilder().setName('h').setDescription('show commands')
        this.discordClientService.commands.set(helpCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.help(message)))

        const leaveCommand = new SlashCommandBuilder().setName('l').setDescription('bot leaves voice channel')
        this.discordClientService.commands.set(leaveCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.leave(message)))

        const queueCommand = new SlashCommandBuilder().setName('q').setDescription('Show music queue')
        this.discordClientService.commands.set(queueCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.queue(message)))

        const skipCommand = new SlashCommandBuilder().setName('s').setDescription('Skip to next music')
        this.discordClientService.commands.set(skipCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.skip(message)))

        //events
        this.discordClientService.discordBotClient.once('ready', (client: Client) => this.errorHandler(() => this.discordEventService.ready(client)))

        this.discordClientService.discordBotClient.on('interactionCreate', (interaction: Interaction) =>
            this.errorHandler(() => this.discordEventService.interactionCreate(interaction)),
        )

        this.discordClientService.discordBotClient.on('messageCreate', message => this.errorHandler(() => this.discordEventService.messageCreate(message)))

        this.discordClientService.discordBotClient.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) =>
            this.errorHandler(() => this.discordEventService.voiceStateUpdate(oldState, newState)),
        )
    }
}
