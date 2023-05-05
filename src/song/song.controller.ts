import {Controller, Get, Query} from '@nestjs/common'
import {SongService} from './song.service'
import {GetSongsDto} from './dto/get-songs.dto'

@Controller('songs')
export class SongController {
    constructor(private readonly songsService: SongService) {}

    @Get('/')
    findAll(@Query() getSongsDto: GetSongsDto) {
        return this.songsService.findAll(getSongsDto)
    }
}
