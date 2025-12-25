export interface VoiceChannelInfo {
  id: string;
  guildId: string;
  name: string;
}

export class Song {
  constructor(
    public readonly videoId: string,
    public readonly title: string,
    public readonly url: string,
    public readonly thumbnail: string,
    public readonly duration: string | null,
    public readonly voiceChannel: VoiceChannelInfo,
  ) {}

  static create(params: {
    videoId: string;
    title: string;
    url: string;
    thumbnail: string;
    duration: string | null;
    voiceChannel: VoiceChannelInfo;
  }): Song {
    return new Song(
      params.videoId,
      params.title,
      params.url,
      params.thumbnail,
      params.duration,
      params.voiceChannel,
    );
  }
}
