import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Song} from './entity/song.entity';
import {SongController} from './song.controller';
import {SongService} from './song.service';

@Module({
    imports: [TypeOrmModule.forFeature([Song])],
    controllers: [SongController],
    providers: [SongService],
    exports: [SongService],
})
export class SongModule {}
