import { Readable } from 'stream';
import { AudioResource } from './audio-player.port';

export interface IStreamProvider {
  createStream(url: string): Promise<Readable>;
  createAudioResource(stream: Readable): AudioResource;
  createAudioResourceFromUrl(url: string): Promise<AudioResource>;
}

export const StreamProviderPort = Symbol('StreamProviderPort');
