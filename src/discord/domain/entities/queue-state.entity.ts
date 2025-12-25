import { Song } from './song.entity';

export class QueueState {
  #queue: Song[] = [];
  #isPlaying = false;
  #volume = 1;

  get queue(): readonly Song[] {
    return this.#queue;
  }

  get currentSong(): Song | undefined {
    return this.#queue[0];
  }

  get isPlaying(): boolean {
    return this.#isPlaying;
  }

  get volume(): number {
    return this.#volume;
  }

  get isEmpty(): boolean {
    return this.#queue.length === 0;
  }

  get length(): number {
    return this.#queue.length;
  }

  addSong(song: Song): void {
    this.#queue.push(song);
  }

  addSongs(songs: Song[]): void {
    this.#queue.push(...songs);
  }

  removeCurrent(): Song | undefined {
    return this.#queue.shift();
  }

  clear(): void {
    this.#queue = [];
  }

  set isPlaying(value: boolean) {
    this.#isPlaying = value;
  }

  set volume(volume: number) {
    this.#volume = Math.max(0, Math.min(2, volume));
  }

  skip(): Song | undefined {
    return this.removeCurrent();
  }

  reset(): void {
    this.#queue = [];
    this.#isPlaying = false;
    this.#volume = 1;
  }
}
