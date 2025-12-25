import { Inject, Injectable } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  Message,
  Routes,
  SlashCommandBuilder,
  VoiceState,
} from 'discord.js';
import { HandleDiscordError } from '../common/aop';
import { ILoggerService, LoggerServiceKey } from '../common/modules/logger/logger.interface';
import { ConfigServiceKey } from '../common/modules/config/config.service';
import { IConfigService } from '../common/modules/config/config.type';
import { DiscordClientAdapter } from './infrastructure/discord-client/discord-client.adapter';
import { CommandHandler } from './presentation/commands/command.handler';
import { EventHandler } from './presentation/events/event.handler';

@Injectable()
export class DiscordService {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
    private readonly discordClient: DiscordClientAdapter,
    private readonly commandHandler: CommandHandler,
    private readonly eventHandler: EventHandler,
    @Inject(LoggerServiceKey)
    private readonly logger: ILoggerService,
  ) {
    this.logger.setContext(DiscordService.name);
    this.init().then(() =>
      this.logger.verbose({
        ctx: 'constructor',
        info: '✅  DiscordService instance initialized',
      }),
    );
  }

  @HandleDiscordError()
  private async init(): Promise<void> {
    await this.discordClient.init();

    const slashCommands = [];

    // Play command
    const playCommand = new SlashCommandBuilder()
      .setName('play')
      .setDescription('Plays music with url or search parameter')
      .addStringOption((option) =>
        option.setName('input').setDescription('url or search text').setRequired(true),
      );
    slashCommands.push(playCommand.toJSON());
    this.discordClient.commands.set('p', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.play(payload),
    );
    this.discordClient.commands.set(playCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.play(payload),
    );

    // Shuffle command
    const shuffleCommand = new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('Shuffle songs currently available in queue');
    slashCommands.push(shuffleCommand.toJSON());
    this.discordClient.commands.set('sh', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.shuffle(payload),
    );
    this.discordClient.commands.set(shuffleCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.shuffle(payload),
    );

    // Empty queue command
    const emptyQueueCommand = new SlashCommandBuilder()
      .setName('empty')
      .setDescription('Empty music queue');
    slashCommands.push(emptyQueueCommand.toJSON());
    this.discordClient.commands.set('eq', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.emptyQueue(payload),
    );
    this.discordClient.commands.set(emptyQueueCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.emptyQueue(payload),
    );

    // Help command
    const helpCommand = new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show commands');
    slashCommands.push(helpCommand.toJSON());
    this.discordClient.commands.set('h', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.help(payload),
    );
    this.discordClient.commands.set(helpCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.help(payload),
    );

    // Leave command
    const leaveCommand = new SlashCommandBuilder()
      .setName('leave')
      .setDescription('bot leaves voice channel');
    slashCommands.push(leaveCommand.toJSON());
    this.discordClient.commands.set('l', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.leave(payload),
    );
    this.discordClient.commands.set(leaveCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.leave(payload),
    );

    // Queue command
    const queueCommand = new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Show music queue');
    slashCommands.push(queueCommand.toJSON());
    this.discordClient.commands.set('q', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.queue(payload),
    );
    this.discordClient.commands.set(queueCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.queue(payload),
    );

    // Skip command
    const skipCommand = new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip to next music');
    slashCommands.push(skipCommand.toJSON());
    this.discordClient.commands.set('s', (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.skip(payload),
    );
    this.discordClient.commands.set(skipCommand.name.toLowerCase(), (payload: Message | ChatInputCommandInteraction) =>
      this.commandHandler.skip(payload),
    );

    // Register slash commands
    await this.discordClient.Rest.put(
      Routes.applicationCommands(this.configService.discordConfig.CLIENT_ID),
      { body: slashCommands },
    );

    // Events
    this.discordClient.discordBotClient.once('ready', (client: Client) =>
      this.eventHandler.ready(client),
    );

    this.discordClient.discordBotClient.on('interactionCreate', (interaction: Interaction) =>
      this.eventHandler.interactionCreate(interaction),
    );

    this.discordClient.discordBotClient.on('messageCreate', (message: Message) =>
      this.eventHandler.messageCreate(message),
    );

    this.discordClient.discordBotClient.on(
      'voiceStateUpdate',
      (oldState: VoiceState, newState: VoiceState) =>
        this.eventHandler.voiceStateUpdate(oldState, newState),
    );
  }
}
