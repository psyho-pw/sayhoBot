import {
  AudioPlayer,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { Injectable } from '@nestjs/common';
import { Client, VoiceChannel, StageChannel } from 'discord.js';
import { VoiceChannelInfo } from '../../domain/entities/song.entity';
import {
  AudioPlayerEvents,
  AudioResource,
  IAudioPlayer,
} from '../../domain/ports/audio-player.port';
import {
  IVoiceConnection,
  IVoiceConnectionManager,
} from '../../domain/ports/voice-connection.port';

class DiscordVoiceConnection implements IVoiceConnection {
  constructor(
    private readonly connection: VoiceConnection,
    public readonly channelId: string,
    public readonly guildId: string,
  ) {}

  subscribe(player: IAudioPlayer): void {
    const discordPlayer = (player as DiscordAudioPlayer).getInternal();
    this.connection.subscribe(discordPlayer);
  }

  destroy(): void {
    this.connection.destroy();
  }

  isConnected(): boolean {
    return this.connection.state.status === VoiceConnectionStatus.Ready;
  }
}

export class DiscordAudioPlayer implements IAudioPlayer {
  private readonly player: AudioPlayer;

  constructor(events: AudioPlayerEvents) {
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    this.player.on('stateChange', (oldState, newState) => {
      if (oldState.status !== 'idle' && newState.status === 'idle') {
        events.onIdle();
      }
    });

    this.player.on('error', (error) => {
      events.onError(error);
    });
  }

  play(resource: AudioResource): void {
    const internal = (resource as any)._internal;
    this.player.play(internal);
  }

  stop(): void {
    this.player.stop();
  }

  pause(): void {
    this.player.pause();
  }

  resume(): void {
    this.player.unpause();
  }

  setVolume(_volume: number): void {
    // Volume is handled at resource level in discord.js
  }

  getInternal(): AudioPlayer {
    return this.player;
  }
}

@Injectable()
export class VoiceConnectionAdapter implements IVoiceConnectionManager {
  private readonly connections = new Map<string, DiscordVoiceConnection>();
  private discordClient: Client | null = null;

  setClient(client: Client): void {
    this.discordClient = client;
  }

  async getOrCreateConnection(channel: VoiceChannelInfo): Promise<IVoiceConnection> {
    const existing = this.connections.get(channel.guildId);
    if (existing?.isConnected()) {
      return existing;
    }

    if (!this.discordClient) {
      throw new Error('Discord client not initialized');
    }

    const guild = this.discordClient.guilds.cache.get(channel.guildId);
    if (!guild) {
      throw new Error(`Guild ${channel.guildId} not found`);
    }

    const voiceChannel = guild.channels.cache.get(channel.id) as VoiceChannel | StageChannel;
    if (!voiceChannel) {
      throw new Error(`Voice channel ${channel.id} not found`);
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      connection.destroy();
      throw new Error('Failed to connect to voice channel');
    }

    const wrappedConnection = new DiscordVoiceConnection(connection, channel.id, channel.guildId);

    this.connections.set(channel.guildId, wrappedConnection);
    return wrappedConnection;
  }

  getConnection(guildId: string): IVoiceConnection | undefined {
    return this.connections.get(guildId);
  }

  destroyConnection(guildId: string): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
    }
  }
}
