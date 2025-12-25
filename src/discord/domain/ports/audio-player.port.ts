import { Readable } from 'stream';

export interface AudioResource {
  readonly id: string;
  readonly stream: Readable;
}

export interface AudioPlayerEvents {
  onIdle: () => Promise<void>;
  onError: (error: Error) => void;
}

export interface IAudioPlayer {
  play(resource: AudioResource): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setVolume(volume: number): void;
}

export const AudioPlayerPort = Symbol('AudioPlayerPort');
