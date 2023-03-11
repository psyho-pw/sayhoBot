import {Controller, Get} from '@nestjs/common'
import {AppConfigService} from './config/config.service'

@Controller()
export class AppController {
    constructor(private readonly configService: AppConfigService) {}

    @Get()
    info(): string {
        return `${this.configService.getAppConfig().NAME} server running ...`
    }
}
