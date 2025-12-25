import { Song } from './song.entity';

export class QueueState {
  private _queue: Song[] = [];
  private _isPlaying = false;
  private _volume = 1;

  get queue(): readonly Song[] {
    return this._queue;
  }

  get currentSong(): Song | undefined {
    return this._queue[0];
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get volume(): number {
    return this._volume;
  }

  get isEmpty(): boolean {
    return this._queue.length === 0;
  }

  get length(): number {
    return this._queue.length;
  }

  addSong(song: Song): void {
    this._queue.push(song);
  }

  addSongs(songs: Song[]): void {
    this._queue.push(...songs);
  }

  removeCurrent(): Song | undefined {
    return this._queue.shift();
  }

  clear(): void {
    this._queue = [];
  }

  setPlaying(playing: boolean): void {
    this._isPlaying = playing;
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(2, volume));
  }

  skip(): Song | undefined {
    return this.removeCurrent();
  }

  reset(): void {
    this._queue = [];
    this._isPlaying = false;
    this._volume = 1;
  }
}
