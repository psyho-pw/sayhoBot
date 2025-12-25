import {Type} from 'class-transformer';
import {IsInt, IsOptional} from 'class-validator';

export class BasePageQueryDto {
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    page = 1;

    @IsOptional()
    @IsInt()
    @Type(() => Number)
    limit = 20;
}
