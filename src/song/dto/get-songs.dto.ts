import { IsOptional, IsString } from 'class-validator';
import { BasePageQueryDto } from '../../common/validations/base-page-query.dto';

export class GetSongsDto extends BasePageQueryDto {
  @IsOptional()
  @IsString()
  searchText: string;
}
