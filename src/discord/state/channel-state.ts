import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { InteractionResponse, Message } from 'discord.js';
import { Song } from '../discord.model';

export class ChannelState {
  musicQueue: Song[] = [];
  isPlaying = false;
  currentInfoMsg: Message | null = null;
  volume = 1;
  player: AudioPlayer | null = null;
  connection: VoiceConnection | null = null;
  deleteQueue: Map<string, Message | InteractionResponse> = new Map();

  reset(): void {
    this.musicQueue = [];
    this.isPlaying = false;
    this.currentInfoMsg = null;
    this.volume = 1;
    this.player = null;
    this.connection = null;
    this.deleteQueue.clear();
  }
}
