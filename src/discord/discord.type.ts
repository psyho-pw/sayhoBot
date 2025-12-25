interface Duration {
    hours: number
    minutes: number
    seconds: number
}

const Thumbnail = ['default', 'medium', 'high', 'standard', 'maxres'] as const

interface ThumbnailData {
    url: string
}

type Thumbnail = Record<(typeof Thumbnail)[number], ThumbnailData>

interface SimpleYoutubeAPIBase {
    raw: Record<string, any>
    full: boolean
    kind: string
    id: string

    title: string
    description: string
    thumbnails: Thumbnail
    publishedAt: Date
    channel: Channel
    duration?: Duration
}

export interface Channel extends SimpleYoutubeAPIBase {
    type: 'channel'
    url: string
    fetch(options?: Record<string, any>): Channel
}

export interface Video extends SimpleYoutubeAPIBase {
    type: 'video'
    url: string
    shortURL: string
    durationSeconds: number
    fetch(options?: Record<string, any>): Video
}

export interface PlayList extends SimpleYoutubeAPIBase {
    type: 'playlist'
    videos: Array<Video>

    url: string
    fetch(options?: Record<string, any>): PlayList
    getVideos(limit?: number, options?: Record<string, any>): Promise<Video[]>
}

export interface SimpleYoutubeAPI {
    searchVideos(query?: string, limit?: number, options?: Record<string, any>): Promise<Array<Channel | Video>>
    getPlaylist(url: string, options?: Record<string, any>): Promise<PlayList>
    getVideo(url: string, options?: Record<string, any>): Promise<Video>
}
