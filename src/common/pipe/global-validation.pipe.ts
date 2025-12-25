import { Injectable, ValidationPipe, ValidationPipeOptions, Inject } from '@nestjs/common';
import { ValidatorOptions, ValidationError } from 'class-validator';
import { ClsServiceKey } from '../cls/cls.module';
import { IClsService } from '../cls/cls.type';
import { LoggerServiceKey, ILoggerService } from '../logger/logger.interface';

@Injectable()
export class GlobalValidationPipe extends ValidationPipe {
    private static readonly options: ValidationPipeOptions = {
        whitelist: true,
        transform: true,
        transformOptions: {strategy: 'exposeAll'},
    };

    constructor(
        @Inject(LoggerServiceKey) private readonly loggerService: ILoggerService,
        @Inject(ClsServiceKey) private readonly clsService: IClsService,
    ) {
        super(GlobalValidationPipe.options);
    }

    protected override async validate(
        object: object,
        validatorOptions?: ValidatorOptions,
    ): Promise<ValidationError[]> {
        const errors = await super.validate(object, validatorOptions);

        if (errors.length > 0) {
            this.loggerService.warn({
                ctx: this.validate.name,
                info: {
                    errors,
                    controllerCtx: this.clsService.controllerCtx,
                    methodCtx: this.clsService.methodCtx,
                },
                message: 'validation error',
            });
        }

        return errors;
    }
}
