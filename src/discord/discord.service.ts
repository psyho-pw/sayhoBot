import { Inject, Injectable } from '@nestjs/common';
import { DiscordClientService } from './discord.client.service';
import { DiscordCommandService } from './discord.command.service';
import { DiscordEventService } from './discord.event.service';
import { DiscordNotificationService } from './discord.notification.service';
import {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  Message,
  Routes,
  SlashCommandBuilder,
  VoiceState,
} from 'discord.js';
import {
  ConfigServiceKey
} from '../config/config.service';
import { HandleDiscordError } from '../common/aop';
import {
  LoggerServiceKey,
  ILoggerService,
} from '../common/logger/logger.interface';
import { IConfigService } from 'src/config/config.type';

@Injectable()
export class DiscordService {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
    private readonly discordClientService: DiscordClientService,
    private readonly discordCommandService: DiscordCommandService,
    private readonly discordEventService: DiscordEventService,
    private readonly discordNotificationService: DiscordNotificationService,
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

  //TODO: make register method
  private registerCommands(
    command: string,
    handlerFunction: (...args: any[]) => Promise<any>,
  ) {
    this.discordClientService.commands.set(
      command,
      (payload: Message | ChatInputCommandInteraction) =>
        handlerFunction(payload),
    );
  }

  @HandleDiscordError()
  private async init() {
    await this.discordClientService.init();

    //commands
    const slashCommands = [];

    const playCommand = new SlashCommandBuilder()
      .setName('play')
      .setDescription('Plays music with url or search parameter')
      .addStringOption((option) =>
        option
          .setName('input')
          .setDescription('url or search text')
          .setRequired(true),
      );
    slashCommands.push(playCommand.toJSON());
    this.discordClientService.commands.set(
      'p',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.play(payload),
    );
    this.discordClientService.commands.set(
      playCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.play(payload),
    );

    const shuffleCommand = new SlashCommandBuilder()
      .setName('shuffle')
      .setDescription('Shuffle songs currently available in queue');
    slashCommands.push(shuffleCommand.toJSON());
    this.discordClientService.commands.set(
      'sh',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.shuffle(payload),
    );
    this.discordClientService.commands.set(
      shuffleCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.shuffle(payload),
    );

    const emptyQueueCommand = new SlashCommandBuilder()
      .setName('empty')
      .setDescription('Empty music queue');
    slashCommands.push(emptyQueueCommand.toJSON());
    this.discordClientService.commands.set(
      'eq',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.emptyQueue(payload),
    );
    this.discordClientService.commands.set(
      emptyQueueCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.emptyQueue(payload),
    );

    const helpCommand = new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show commands');
    slashCommands.push(helpCommand.toJSON());
    this.discordClientService.commands.set(
      'h',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.help(payload),
    );
    this.discordClientService.commands.set(
      helpCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.help(payload),
    );

    const leaveCommand = new SlashCommandBuilder()
      .setName('leave')
      .setDescription('bot leaves voice channel');
    slashCommands.push(leaveCommand.toJSON());
    this.discordClientService.commands.set(
      'l',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.leave(payload),
    );
    this.discordClientService.commands.set(
      leaveCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.leave(payload),
    );

    const queueCommand = new SlashCommandBuilder()
      .setName('queue')
      .setDescription('Show music queue');
    slashCommands.push(queueCommand.toJSON());
    this.discordClientService.commands.set(
      'q',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.queue(payload),
    );
    this.discordClientService.commands.set(
      queueCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.queue(payload),
    );

    const skipCommand = new SlashCommandBuilder()
      .setName('skip')
      .setDescription('Skip to next music');
    slashCommands.push(skipCommand.toJSON());
    this.discordClientService.commands.set(
      's',
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.skip(payload),
    );
    this.discordClientService.commands.set(
      skipCommand.name.toLowerCase(),
      (payload: Message | ChatInputCommandInteraction) =>
        this.discordCommandService.skip(payload),
    );

    await this.discordClientService.Rest.put(
      Routes.applicationCommands(
        this.configService.discordConfig.CLIENT_ID,
      ),
      { body: slashCommands },
    );

    //events
    this.discordClientService.discordBotClient.once('ready', (client: Client) =>
      this.discordEventService.ready(client),
    );

    this.discordClientService.discordBotClient.on(
      'interactionCreate',
      (interaction: Interaction) =>
        this.discordEventService.interactionCreate(interaction),
    );

    this.discordClientService.discordBotClient.on('messageCreate', (message) =>
      this.discordEventService.messageCreate(message),
    );

    this.discordClientService.discordBotClient.on(
      'voiceStateUpdate',
      (oldState: VoiceState, newState: VoiceState) =>
        this.discordEventService.voiceStateUpdate(oldState, newState),
    );
  }
}
