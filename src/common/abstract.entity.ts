// import type {User} from 'src/user/entities/user.entity'
import {
    CreateDateColumn,
    DeleteDateColumn,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export abstract class AbstractEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date | null;
}

// export abstract class AbstractActorEntity extends AbstractEntity {
//     @ManyToOne('User', 'id')
//     @JoinColumn()
//     createdBy: Relation<User>
//
//     // @OneToMany(() => User, user => user.id, {cascade: true, onDelete: 'CASCADE'})
//     @ManyToOne('User', 'id')
//     @JoinColumn()
//     updatedBy: Relation<User>
//
//     @ManyToOne('User', 'id')
//     @JoinColumn()
//     deletedBy: Relation<User>
// }
