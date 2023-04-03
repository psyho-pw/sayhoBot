import {Inject, Injectable} from '@nestjs/common'
import {DiscordClientService} from './discord.client.service'
import {DiscordCommandService} from './discord.command.service'
import {DiscordEventService} from './discord.event.service'
import {DiscordNotificationService} from './discord.notification.service'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {AppConfigService} from '../../config/config.service'
import {ChatInputCommandInteraction, Client, Interaction, Message, Routes, SlashCommandBuilder, VoiceState} from 'discord.js'

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

    private async errorHandler(handler: () => Promise<any>) {
        try {
            await handler()
        } catch (err) {
            await this.discordNotificationService.sendErrorReport(err)
        }
    }

    async init() {
        await this.errorHandler(() => this.discordClientService.init())

        //commands
        const slashCommands = []
        const playCommand = new SlashCommandBuilder()
            .setName('p')
            .setDescription('Plays music with url or search parameter')
            .addStringOption(option => option.setName('input').setDescription('url or search text').setRequired(true))
        slashCommands.push(playCommand.toJSON())
        this.discordClientService.commands.set(playCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
            this.errorHandler(() => this.discordCommandService.play(payload)),
        )

        const emptyQueueCommand = new SlashCommandBuilder().setName('eq').setDescription('Empty music queue')
        slashCommands.push(emptyQueueCommand.toJSON())
        this.discordClientService.commands.set(emptyQueueCommand.name.toLowerCase(), (message: Message) =>
            this.errorHandler(() => this.discordCommandService.emptyQueue(message)),
        )

        const helpCommand = new SlashCommandBuilder().setName('h').setDescription('show commands')
        slashCommands.push(helpCommand.toJSON())
        this.discordClientService.commands.set(helpCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.help(message)))

        const leaveCommand = new SlashCommandBuilder().setName('l').setDescription('bot leaves voice channel')
        slashCommands.push(leaveCommand.toJSON())
        this.discordClientService.commands.set(leaveCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.leave(message)))

        const queueCommand = new SlashCommandBuilder().setName('q').setDescription('Show music queue')
        slashCommands.push(queueCommand.toJSON())
        this.discordClientService.commands.set(queueCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.queue(message)))

        const skipCommand = new SlashCommandBuilder().setName('s').setDescription('Skip to next music')
        slashCommands.push(skipCommand.toJSON())
        this.discordClientService.commands.set(skipCommand.name.toLowerCase(), (message: Message) => this.errorHandler(() => this.discordCommandService.skip(message)))

        await this.discordClientService.Rest.put(Routes.applicationCommands(this.configService.getDiscordConfig().CLIENT_ID), {body: slashCommands})

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
