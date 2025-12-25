import { Inject, Injectable } from '@nestjs/common';
import { QueueStateManager } from './queue-state.manager';
import { Song, VoiceChannelInfo } from '../domain/entities/song.entity';
import { IAudioPlayer, AudioPlayerEvents } from '../domain/ports/audio-player.port';
import { IStreamProvider, StreamProviderPort } from '../domain/ports/stream-provider.port';
import {
  IVoiceConnectionManager,
  VoiceConnectionManagerPort,
} from '../domain/ports/voice-connection.port';

export interface PlayMusicRequest {
  guildId: string;
  song: Song;
  voiceChannel: VoiceChannelInfo;
}

@Injectable()
export class PlayMusicUseCase {
  private readonly players = new Map<string, IAudioPlayer>();

  constructor(
    private readonly queueStateManager: QueueStateManager,
    @Inject(StreamProviderPort) private readonly streamProvider: IStreamProvider,
    @Inject(VoiceConnectionManagerPort)
    private readonly voiceConnectionManager: IVoiceConnectionManager,
  ) {}

  async execute(request: PlayMusicRequest): Promise<void> {
    const { guildId, song, voiceChannel } = request;
    const queueState = this.queueStateManager.getOrCreate(guildId);

    queueState.addSong(song);

    if (queueState.isPlaying) {
      return;
    }

    await this.playNext(guildId, voiceChannel);
  }

  async playNext(guildId: string, voiceChannel: VoiceChannelInfo): Promise<void> {
    const queueState = this.queueStateManager.get(guildId);
    if (!queueState || queueState.isEmpty) {
      return;
    }

    const currentSong = queueState.currentSong;
    if (!currentSong) {
      return;
    }

    const connection = await this.voiceConnectionManager.getOrCreateConnection(voiceChannel);
    const resource = await this.streamProvider.createAudioResourceFromUrl(currentSong.url);

    let player = this.players.get(guildId);
    if (!player) {
      player = this.createPlayer(guildId, voiceChannel);
      this.players.set(guildId, player);
    }

    connection.subscribe(player);
    player.play(resource);
    queueState.isPlaying = true;
  }

  private createPlayer(guildId: string, voiceChannel: VoiceChannelInfo): IAudioPlayer {
    const events: AudioPlayerEvents = {
      onIdle: async () => {
        const queueState = this.queueStateManager.get(guildId);
        if (queueState) {
          queueState.removeCurrent();
          if (!queueState.isEmpty) {
            await this.playNext(guildId, voiceChannel);
          } else {
            queueState.isPlaying = false;
          }
        }
      },
      onError: (error) => {
        console.error(`Player error for guild ${guildId}:`, error);
      },
    };

    // This will be injected via factory in infrastructure layer
    return (this as any).audioPlayerFactory?.create(events);
  }

  stop(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
    }

    const queueState = this.queueStateManager.get(guildId);
    if (queueState) {
      queueState.reset();
    }

    this.voiceConnectionManager.destroyConnection(guildId);
    this.players.delete(guildId);
  }

  skip(guildId: string, voiceChannel: VoiceChannelInfo): void {
    const queueState = this.queueStateManager.get(guildId);
    if (queueState && !queueState.isEmpty) {
      queueState.removeCurrent();
      if (!queueState.isEmpty) {
        this.playNext(guildId, voiceChannel);
      } else {
        this.stop(guildId);
      }
    }
  }
}
