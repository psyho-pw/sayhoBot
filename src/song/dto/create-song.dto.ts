import { IsString } from 'class-validator';

export class CreateSongDto {
  @IsString()
  url: string;

  @IsString()
  title: string;
}
