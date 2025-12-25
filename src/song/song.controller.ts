import { Controller, Get, Query } from '@nestjs/common';
import { GetSongsDto } from './dto/get-songs.dto';
import { SongService } from './song.service';

@Controller('songs')
export class SongController {
  constructor(private readonly songsService: SongService) {}

  @Get('/')
  findAll(@Query() getSongsDto: GetSongsDto) {
    return this.songsService.findAll(getSongsDto);
  }
}
