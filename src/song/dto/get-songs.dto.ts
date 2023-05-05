import {BasePageQueryDto} from '../../common/validations/base-page-query.dto'
import {IsOptional, IsString} from 'class-validator'

export class GetSongsDto extends BasePageQueryDto {
    @IsOptional()
    @IsString()
    searchText: string
}
