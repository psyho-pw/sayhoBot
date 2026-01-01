import {
  AudioPlayer,
  AudioResource,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { Injectable } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  Guild,
  Message,
  StageChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ChannelStateAdapter } from './channel-state.adapter';
import { AudioResource as DomainAudioResource } from '../../domain/ports/audio-player.port';

export interface PlayContext {
  message: Message | ChatInputCommandInteraction;
  guildId: string;
  channel: TextChannel;
}

@Injectable()
export class PlayerAdapter {
  constructor(private readonly stateAdapter: ChannelStateAdapter) {}

  public createPlayer(
    context: PlayContext,
    onPlayNext: () => Promise<void>,
    onQueueEmpty: () => void,
  ): AudioPlayer {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

    player.on('stateChange', async (oldState, newState) => {
      if (oldState.status !== 'idle' && newState.status === 'idle') {
        const queue = this.stateAdapter.getMusicQueue(context.guildId);
        if (queue.length > 0) {
          // Remove current song from queue
          const queueArray = [...queue];
          queueArray.shift();
          this.stateAdapter.clearQueue(context.guildId);
          this.stateAdapter.addSongsToQueue(context.guildId, queueArray);
        }

        if (this.stateAdapter.getMusicQueue(context.guildId).length > 0) {
          await onPlayNext();
        } else {
          this.stateAdapter.setIsPlaying(context.guildId, false);
          onQueueEmpty();
        }
      }
    });

    player.on('error', async (error) => {
      console.error('Player error:', error);
      // On stream error, skip to next song
      const queue = this.stateAdapter.getMusicQueue(context.guildId);
      if (queue.length > 0) {
        const queueArray = [...queue];
        queueArray.shift();
        this.stateAdapter.clearQueue(context.guildId);
        this.stateAdapter.addSongsToQueue(context.guildId, queueArray);
      }

      if (this.stateAdapter.getMusicQueue(context.guildId).length > 0) {
        await onPlayNext();
      } else {
        this.stateAdapter.setIsPlaying(context.guildId, false);
        onQueueEmpty();
      }
    });

    this.stateAdapter.setPlayer(context.guildId, player);
    return player;
  }

  public getOrCreatePlayer(
    context: PlayContext,
    onPlayNext: () => Promise<void>,
    onQueueEmpty: () => void,
  ): AudioPlayer {
    const existingPlayer = this.stateAdapter.getPlayer(context.guildId);
    if (existingPlayer) {
      return existingPlayer;
    }
    return this.createPlayer(context, onPlayNext, onQueueEmpty);
  }

  public getOrCreateConnection(
    guildId: string,
    guild: Guild,
    voiceChannel: VoiceChannel | StageChannel,
  ): VoiceConnection {
    const existingConnection = this.stateAdapter.getConnection(guildId);
    if (existingConnection) {
      return existingConnection;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });

    entersState(connection, VoiceConnectionStatus.Ready, 30_000).catch(() => {
      connection.destroy();
    });

    this.stateAdapter.setConnection(guildId, connection);
    return connection;
  }

  public play(
    player: AudioPlayer,
    connection: VoiceConnection,
    resource: DomainAudioResource | AudioResource,
  ): void {
    connection.subscribe(player);
    // Handle both domain and discord.js audio resources
    const discordResource = (resource as any)._internal ?? resource;
    player.play(discordResource);
  }
}
