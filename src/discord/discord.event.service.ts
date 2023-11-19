// @ts-ignore
import Youtube from 'simple-youtube-api/src/index.js'
import {Inject, Injectable} from '@nestjs/common'
import {DiscordClientService} from './discord.client.service'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'
import {
    Channel,
    Client,
    CommandInteraction,
    Guild,
    GuildMember,
    Interaction,
    Message,
    SelectMenuInteraction,
    Snowflake,
    VoiceState,
} from 'discord.js'
import {HandleDiscordError} from '../common/decorators/discordErrorHandler.decorator'
import {DiscordEventException} from '../common/exceptions/discord/discord.event.exception'
import {AppConfigService} from '../config/config.service'
import {Song} from './discord.model'
import {SimpleYoutubeAPI} from './discord.type'

@Injectable()
export class DiscordEventService {
    private readonly youtube: SimpleYoutubeAPI = new Youtube(
        this.configService.getDiscordConfig().YOUTUBE_API_KEY,
    )

    constructor(
        private readonly configService: AppConfigService,
        private readonly discordClientService: DiscordClientService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    @HandleDiscordError()
    public async ready(client: Client) {
        this.logger.verbose(`Logged in as ${this.discordClientService.getUser()}`)
        this.logger.verbose(`SayhoBot server ready`)
    }

    @HandleDiscordError()
    private async commandHandler(interaction: CommandInteraction) {
        const command = this.discordClientService.commands.get(interaction.commandName)
        if (!command) return
        this.logger.info(
            `request:: command: ${interaction.commandName}, user: ${interaction.user.tag}`,
        )
        try {
            await command(interaction)
        } catch (err) {
            if (err instanceof Error) this.logger.error(err.stack)
            await interaction.reply({
                content: 'There was an error while executing this command!',
                ephemeral: true,
            })
        }
    }

    @HandleDiscordError()
    private async selectMenuHandler(interaction: SelectMenuInteraction) {
        const video = await this.youtube.getVideo(interaction.values[0])
        const guild: Guild | undefined = this.discordClientService
            .getClient()
            .guilds.cache.get(interaction.guildId ?? '')
        const member: GuildMember | undefined = guild?.members.cache.get(
            <Snowflake>interaction.member?.user.id,
        )

        if (!guild) throw new DiscordEventException('guild is not specified')
        if (!member || !member.voice.channel) return interaction.reply('Cannot find channel')

        const song: Song | null = this.discordClientService.formatVideo(video, member.voice.channel)
        if (!song) {
            return interaction.reply('Video is either private or it does not exist')
        }

        const musicQueue = this.discordClientService.getMusicQueue(guild.id)

        musicQueue.push(song)
        this.discordClientService.setMusicQueue(guild.id, musicQueue)
        this.logger.info(`${song.title} added to queue`)
        this.logger.info(`queue length: ${musicQueue.length}`)

        await interaction
            .reply({
                embeds: [
                    this.discordClientService.formatMessageEmbed(
                        interaction.values[0],
                        1,
                        musicQueue.length,
                        song.title,
                        song.thumbnail,
                    ),
                ],
            })
            .then(msg =>
                setTimeout(
                    () => msg.delete(),
                    this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                ),
            )
        this.discordClientService.removeFromDeleteQueue(guild.id, interaction.message.id)

        if (!this.discordClientService.getIsPlaying(guild.id)) {
            await this.discordClientService.playSong(interaction.message)
        }
    }

    @HandleDiscordError()
    public async interactionCreate(interaction: Interaction) {
        if (interaction.isStringSelectMenu()) await this.selectMenuHandler(interaction)
        else if (interaction.isChatInputCommand()) await this.commandHandler(interaction)
    }

    @HandleDiscordError()
    public async messageCreate(message: Message) {
        this.logger.info(`message received ${message.content}`)
        if (message.author.bot) return

        if (!message.content.startsWith(this.configService.getDiscordConfig().COMMAND_PREFIX)) {
            this.logger.verbose(
                `doesn't match prefix '${
                    this.configService.getDiscordConfig().COMMAND_PREFIX
                }' skipping...`,
            )
            return
        }

        const args: string[] = message.content
            .slice(this.configService.getDiscordConfig().COMMAND_PREFIX.length)
            .trim()
            .split(/ +/g)
        const commandName: string = args.shift()?.toLowerCase() ?? ''
        this.logger.info(`command: ${commandName}`)

        const command = this.discordClientService.commands.get(commandName)
        if (!command) {
            this.logger.error(`command ${commandName} does not exist`)
            return
        }

        try {
            await command(message)
            await message.delete()
        } catch (err) {
            await message.reply({content: 'There was an error while executing this command'})
            throw err
        }
    }

    @HandleDiscordError()
    public async voiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        if (oldState.channelId !== (oldState.guild.members.me?.voice.channelId || newState.channel))
            return

        if (!((oldState.channel?.members.size ?? 1) - 1)) {
            setTimeout(() => {
                if (!((oldState.channel?.members.size ?? 1) - 1)) {
                    const channel: any = oldState.client.channels.cache
                        .filter((channel: Channel) => {
                            if (!channel.isTextBased || channel.isDMBased()) return false
                            return channel.guildId === oldState.guild.id && channel.name === '일반'
                        })
                        .first()

                    channel.send('바윙~').then((msg: Message) => {
                        this.discordClientService.setMusicQueue(newState.guild.id, [])
                        this.discordClientService.setIsPlaying(newState.guild.id, false)
                        this.discordClientService.setVolume(newState.guild.id, 1)
                        this.discordClientService.deleteCurrentInfoMsg(newState.guild.id)
                        this.discordClientService.removeGuildFromDeleteQueue(newState.guild.id)

                        this.discordClientService.deletePlayer(newState.guild.id)
                        this.discordClientService.getConnection(newState.guild.id)?.destroy()
                        this.discordClientService.deleteConnection(newState.guild.id)
                        setTimeout(
                            () => msg.delete(),
                            this.configService.getDiscordConfig().MESSAGE_DELETE_TIMEOUT,
                        )
                    })
                }
            }, 5000)
            // 180000
        }
    }
}
