export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  shortUrl: string;
  thumbnail: string;
  durationSeconds: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  url: string;
  videos: VideoInfo[];
}

export interface IYoutubeSearch {
  searchVideos(query: string, limit?: number): Promise<VideoInfo[]>;
  getVideo(url: string): Promise<VideoInfo | null>;
  getPlaylist(url: string): Promise<PlaylistInfo | null>;
}

export const YoutubeSearchPort = Symbol('YoutubeSearchPort');
