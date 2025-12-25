import {Column, Entity, Index} from 'typeorm';
import {AbstractEntity} from '../../common/abstract.entity';

@Entity()
export class Song extends AbstractEntity {
    @Column()
    url: string;

    @Index()
    @Column()
    title: string;

    @Column({default: 1})
    count: number;
}
