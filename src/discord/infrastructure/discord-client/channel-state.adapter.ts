import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { Injectable } from '@nestjs/common';
import { InteractionResponse, Message } from 'discord.js';
import { QueueState } from '../../domain/entities/queue-state.entity';
import { Song } from '../../domain/entities/song.entity';

/**
 * Discord-specific channel state that extends domain QueueState
 * with Discord.js infrastructure concerns (connections, messages, etc.)
 */
export class ChannelState {
  readonly queueState = new QueueState();
  currentInfoMsg: Message | null = null;
  player: AudioPlayer | null = null;
  connection: VoiceConnection | null = null;
  deleteQueue: Map<string, Message | InteractionResponse> = new Map();

  reset(): void {
    this.queueState.reset();
    this.currentInfoMsg = null;
    this.player = null;
    this.connection = null;
    this.deleteQueue.clear();
  }
}

@Injectable()
export class ChannelStateAdapter {
  private readonly states = new Map<string, ChannelState>();

  get(guildId: string): ChannelState {
    if (!this.states.has(guildId)) {
      this.states.set(guildId, new ChannelState());
    }
    return this.states.get(guildId)!;
  }

  getQueueState(guildId: string): QueueState {
    return this.get(guildId).queueState;
  }

  has(guildId: string): boolean {
    return this.states.has(guildId);
  }

  delete(guildId: string): void {
    this.states.delete(guildId);
  }

  // Music Queue (delegates to QueueState)
  getMusicQueue(guildId: string): readonly Song[] {
    return this.getQueueState(guildId).queue;
  }

  addToQueue(guildId: string, song: Song): void {
    this.getQueueState(guildId).addSong(song);
  }

  addSongsToQueue(guildId: string, songs: Song[]): void {
    this.getQueueState(guildId).addSongs(songs);
  }

  clearQueue(guildId: string): void {
    this.getQueueState(guildId).clear();
  }

  shuffleMusicQueue(guildId: string): void {
    const queueState = this.getQueueState(guildId);
    const queue = [...queueState.queue];

    if (queue.length <= 1) return;

    const current = queue.shift();
    if (!current) return;

    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    queueState.clear();
    queueState.addSong(current);
    queueState.addSongs(queue);
  }

  // Playing State
  getIsPlaying(guildId: string): boolean {
    return this.getQueueState(guildId).isPlaying;
  }

  setIsPlaying(guildId: string, isPlaying: boolean): void {
    this.getQueueState(guildId).isPlaying = isPlaying;
  }

  // Volume
  getVolume(guildId: string): number {
    return this.getQueueState(guildId).volume;
  }

  setVolume(guildId: string, volume: number): void {
    this.getQueueState(guildId).volume = volume;
  }

  // Player (infrastructure concern)
  getPlayer(guildId: string): AudioPlayer | null {
    return this.get(guildId).player;
  }

  setPlayer(guildId: string, player: AudioPlayer): void {
    this.get(guildId).player = player;
  }

  deletePlayer(guildId: string): void {
    this.get(guildId).player = null;
  }

  // Connection (infrastructure concern)
  getConnection(guildId: string): VoiceConnection | null {
    return this.get(guildId).connection;
  }

  setConnection(guildId: string, connection: VoiceConnection): void {
    this.get(guildId).connection = connection;
  }

  deleteConnection(guildId: string): void {
    this.get(guildId).connection = null;
  }

  // Current Info Message (infrastructure concern)
  getCurrentInfoMsg(guildId: string): Message | null {
    return this.get(guildId).currentInfoMsg;
  }

  setCurrentInfoMsg(guildId: string, msg: Message): void {
    this.get(guildId).currentInfoMsg = msg;
  }

  deleteCurrentInfoMsg(guildId: string): void {
    const state = this.get(guildId);
    state.currentInfoMsg?.delete().catch(() => {});
    state.currentInfoMsg = null;
  }

  // Delete Queue (infrastructure concern)
  addToDeleteQueue(guildId: string, message: Message | InteractionResponse): void {
    this.get(guildId).deleteQueue.set(message.id, message);
  }

  removeFromDeleteQueue(guildId: string, id: string): void {
    const state = this.get(guildId);
    state.deleteQueue
      .get(id)
      ?.delete()
      .catch(() => {});
    state.deleteQueue.delete(id);
  }

  clearDeleteQueue(guildId: string): void {
    const state = this.get(guildId);
    state.deleteQueue.forEach((msg) => msg.delete().catch(() => {}));
    state.deleteQueue.clear();
  }

  // Full cleanup
  cleanup(guildId: string): void {
    const state = this.get(guildId);
    state.currentInfoMsg?.delete().catch(() => {});
    state.deleteQueue.forEach((msg) => msg.delete().catch(() => {}));
    state.connection?.destroy();
    state.reset();
  }
}
