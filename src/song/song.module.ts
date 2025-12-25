import { Module } from '@nestjs/common'
import { SongService } from './song.service'
import { SongController } from './song.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Song } from './entity/song.entity'

@Module({
    imports: [TypeOrmModule.forFeature([Song]), ],
    controllers: [SongController],
    providers: [SongService],
    exports: [SongService],
})
export class SongModule {}
