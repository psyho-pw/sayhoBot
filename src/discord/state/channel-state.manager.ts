import {AudioPlayer, VoiceConnection} from '@discordjs/voice';
import {Injectable} from '@nestjs/common';
import {InteractionResponse, Message} from 'discord.js';
import {ChannelState} from './channel-state';
import {Song} from '../discord.model';

@Injectable()
export class ChannelStateManager {
    private readonly states = new Map<string, ChannelState>();

    get(guildId: string): ChannelState {
        if (!this.states.has(guildId)) {
            this.states.set(guildId, new ChannelState());
        }
        return this.states.get(guildId)!;
    }

    has(guildId: string): boolean {
        return this.states.has(guildId);
    }

    delete(guildId: string): void {
        this.states.delete(guildId);
    }

    getAll(): Map<string, ChannelState> {
        return this.states;
    }

    // Music Queue
    getMusicQueue(guildId: string): Song[] {
        return this.get(guildId).musicQueue;
    }

    setMusicQueue(guildId: string, queue: Song[]): void {
        this.get(guildId).musicQueue = queue;
    }

    shuffleMusicQueue(guildId: string): void {
        const state = this.get(guildId);
        const queue = state.musicQueue;

        if (queue.length <= 1) return;

        const current = queue.shift();
        if (!current) return;

        for (let i = queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue[i], queue[j]] = [queue[j], queue[i]];
        }

        queue.unshift(current);
        state.musicQueue = queue;
    }

    // Playing State
    getIsPlaying(guildId: string): boolean {
        return this.get(guildId).isPlaying;
    }

    setIsPlaying(guildId: string, isPlaying: boolean): void {
        this.get(guildId).isPlaying = isPlaying;
    }

    // Volume
    getVolume(guildId: string): number {
        return this.get(guildId).volume;
    }

    setVolume(guildId: string, volume: number): void {
        this.get(guildId).volume = volume;
    }

    // Player
    getPlayer(guildId: string): AudioPlayer | null {
        return this.get(guildId).player;
    }

    setPlayer(guildId: string, player: AudioPlayer): void {
        this.get(guildId).player = player;
    }

    deletePlayer(guildId: string): void {
        this.get(guildId).player = null;
    }

    // Connection
    getConnection(guildId: string): VoiceConnection | null {
        return this.get(guildId).connection;
    }

    setConnection(guildId: string, connection: VoiceConnection): void {
        this.get(guildId).connection = connection;
    }

    deleteConnection(guildId: string): void {
        this.get(guildId).connection = null;
    }

    // Current Info Message
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

    // Delete Queue
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
        state.deleteQueue.forEach(msg => msg.delete().catch(() => {}));
        state.deleteQueue.clear();
    }

    // Full cleanup
    cleanup(guildId: string): void {
        const state = this.get(guildId);
        state.currentInfoMsg?.delete().catch(() => {});
        state.deleteQueue.forEach(msg => msg.delete().catch(() => {}));
        state.connection?.destroy();
        state.reset();
    }
}
