import { Inject, Injectable } from '@nestjs/common';
import Youtube from 'simple-youtube-api';
import { ConfigServiceKey } from '../../../config/config.service';
import { IConfigService } from '../../../config/config.type';
import { IYoutubeSearch, PlaylistInfo, VideoInfo } from '../../domain/ports/youtube-search.port';

@Injectable()
export class YoutubeSearchAdapter implements IYoutubeSearch {
  private readonly youtube: Youtube;

  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
  ) {
    this.youtube = new Youtube(this.configService.youtubeConfig.YOUTUBE_API_KEY);
  }

  async searchVideos(query: string, limit = 5): Promise<VideoInfo[]> {
    const results = await this.youtube.searchVideos(query, limit);

    return results
      .filter((result: any) => result.type === 'video')
      .map((video: any) => this.mapToVideoInfo(video));
  }

  async getVideo(url: string): Promise<VideoInfo | null> {
    try {
      const video = await this.youtube.getVideo(url);
      if (!video) {
        return null;
      }
      return this.mapToVideoInfo(video);
    } catch {
      return null;
    }
  }

  async getPlaylist(url: string): Promise<PlaylistInfo | null> {
    try {
      const playlist = await this.youtube.getPlaylist(url);
      if (!playlist) {
        return null;
      }

      const videos = await playlist.getVideos(100);

      return {
        id: playlist.id,
        title: playlist.title,
        url: playlist.url,
        videos: videos.map((video: any) => this.mapToVideoInfo(video)),
      };
    } catch {
      return null;
    }
  }

  private mapToVideoInfo(video: any): VideoInfo {
    return {
      id: video.id,
      title: video.title,
      url: video.url,
      shortUrl: video.shortURL,
      thumbnail: video.thumbnails?.high?.url ?? video.thumbnails?.default?.url ?? '',
      durationSeconds: video.durationSeconds ?? 0,
    };
  }
}
