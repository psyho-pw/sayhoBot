import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigServiceKey } from './common/modules/config/config.service';
import { IConfigService } from './common/modules/config/config.type';

@Controller()
export class AppController {
  constructor(
    @Inject(ConfigServiceKey)
    private readonly configService: IConfigService,
  ) {}

  @Get()
  info(): string {
    return `${this.configService.appConfig.NAME} server running ...`;
  }
}
