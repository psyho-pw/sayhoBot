import {Injectable} from '@nestjs/common'
import {InjectRepository} from '@nestjs/typeorm'
import {Like, Repository} from 'typeorm'
import {Song} from './entity/song.entity'
import {Transactional} from 'typeorm-transactional'
import {CreateSongDto} from './dto/create-song.dto'
import {GetSongsDto} from './dto/get-songs.dto'
import {FindOptionsWhere} from 'typeorm/find-options/FindOptionsWhere'

@Injectable()
export class SongService {
    constructor(@InjectRepository(Song) private songRepository: Repository<Song>) {}

    @Transactional()
    public async create(createSongDto: CreateSongDto): Promise<Song> {
        const song = new Song()
        song.url = createSongDto.url
        song.title = createSongDto.title

        return this.songRepository.save(song)
    }

    @Transactional()
    public async findAll(getSongsDto: GetSongsDto) {
        const {searchText, page, limit} = getSongsDto
        const whereOptions: FindOptionsWhere<Song> = {}
        if (searchText) {
            whereOptions.title = Like(`%${searchText}%`)
        }
        return this.songRepository.find({
            where: whereOptions,
            order: {id: -1},
            skip: (page - 1) * limit,
            take: limit,
        })
    }
}
