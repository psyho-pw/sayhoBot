import { Song } from '../entities/song.entity';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface MessageEmbed {
  title?: string;
  description?: string;
  color?: number;
  thumbnail?: string;
  fields?: EmbedField[];
  footer?: string;
}

export interface SentMessage {
  id: string;
  channelId: string;
  delete(): Promise<void>;
}

export interface IMessageSender {
  sendEmbed(channelId: string, embed: MessageEmbed): Promise<SentMessage>;
  sendNowPlaying(channelId: string, song: Song): Promise<SentMessage>;
  sendAddedToQueue(channelId: string, song: Song, position: number): Promise<SentMessage>;
  sendQueueList(channelId: string, songs: readonly Song[]): Promise<SentMessage>;
  sendError(channelId: string, message: string): Promise<SentMessage>;
  deleteMessage(message: SentMessage): Promise<void>;
}

export const MessageSenderPort = Symbol('MessageSenderPort');
