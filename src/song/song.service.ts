import {Injectable} from '@nestjs/common'
import {InjectRepository} from '@nestjs/typeorm'
import {Repository} from 'typeorm'
import {Song} from './entity/song.entity'
import {Transactional} from 'typeorm-transactional'
import {CreateSongDto} from './dto/create-song.dto'

@Injectable()
export class SongService {
    constructor(@InjectRepository(Song) private songRepository: Repository<Song>) {}

    @Transactional()
    async create(createSongDto: CreateSongDto): Promise<Song> {
        const song = new Song()
        song.url = createSongDto.url
        song.title = createSongDto.title

        return this.songRepository.save(song)
    }
}
