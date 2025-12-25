import {StageChannel, VoiceChannel} from 'discord.js';

export class Song {
    duration: string | null;

    thumbnail: string;

    title: string;

    url: string;

    video: any;

    videoId: string;

    voiceChannel: VoiceChannel | StageChannel;
}

export class ParsedPlayCommand {
    content: string;

    voiceChannel: VoiceChannel | StageChannel;

    constructor(content: string, voiceChannel: VoiceChannel | StageChannel) {
        this.content = content;
        this.voiceChannel = voiceChannel;
    }
}

export class SelectListItem {
    label: string;

    description: string;

    value: string;
}
