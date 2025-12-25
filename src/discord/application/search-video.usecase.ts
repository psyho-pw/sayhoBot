import { Inject, Injectable } from '@nestjs/common';
import { Song, VoiceChannelInfo } from '../domain/entities/song.entity';
import { IYoutubeSearch, VideoInfo, YoutubeSearchPort } from '../domain/ports/youtube-search.port';

export interface SearchVideoRequest {
  query: string;
  voiceChannel: VoiceChannelInfo;
  limit?: number;
}

export interface SearchVideoResult {
  songs: Song[];
}

@Injectable()
export class SearchVideoUseCase {
  constructor(@Inject(YoutubeSearchPort) private readonly youtubeSearch: IYoutubeSearch) {}

  async searchByQuery(request: SearchVideoRequest): Promise<SearchVideoResult> {
    const videos = await this.youtubeSearch.searchVideos(request.query, request.limit ?? 5);

    const songs = videos.map((video) => this.videoToSong(video, request.voiceChannel));

    return { songs };
  }

  async getByUrl(url: string, voiceChannel: VoiceChannelInfo): Promise<Song | null> {
    const video = await this.youtubeSearch.getVideo(url);
    if (!video) {
      return null;
    }

    return this.videoToSong(video, voiceChannel);
  }

  async getPlaylist(url: string, voiceChannel: VoiceChannelInfo): Promise<Song[]> {
    const playlist = await this.youtubeSearch.getPlaylist(url);
    if (!playlist) {
      return [];
    }

    return playlist.videos.map((video) => this.videoToSong(video, voiceChannel));
  }

  private videoToSong(video: VideoInfo, voiceChannel: VoiceChannelInfo): Song {
    const duration = this.formatDuration(video.durationSeconds);

    return Song.create({
      videoId: video.id,
      title: video.title,
      url: video.url,
      thumbnail: video.thumbnail,
      duration,
      voiceChannel,
    });
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
