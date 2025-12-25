import { IAudioPlayer } from './audio-player.port';
import { VoiceChannelInfo } from '../entities/song.entity';

export interface IVoiceConnection {
  readonly channelId: string;
  readonly guildId: string;
  subscribe(player: IAudioPlayer): void;
  destroy(): void;
  isConnected(): boolean;
}

export interface IVoiceConnectionManager {
  getOrCreateConnection(channel: VoiceChannelInfo): Promise<IVoiceConnection>;
  getConnection(guildId: string): IVoiceConnection | undefined;
  destroyConnection(guildId: string): void;
}

export const VoiceConnectionManagerPort = Symbol('VoiceConnectionManagerPort');
