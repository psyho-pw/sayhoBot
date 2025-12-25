import {HttpStatus} from '@nestjs/common';
import {GeneralException} from './general.exception';

export type DiscordExceptionContext = 'service' | 'client' | 'command' | 'event' | 'notification';

export class DiscordException extends GeneralException {
    private readonly context: DiscordExceptionContext;
    private readonly metadata?: Record<string, any>;

    constructor(
        message: string,
        context: DiscordExceptionContext,
        callMethod?: string,
        metadata?: Record<string, any>,
        status?: number,
    ) {
        const callClass = `Discord${context.charAt(0).toUpperCase() + context.slice(1)}Service`;
        super(callClass, callMethod ?? '', message, status || HttpStatus.INTERNAL_SERVER_ERROR);
        this.context = context;
        this.metadata = metadata;
    }

    get Context(): DiscordExceptionContext {
        return this.context;
    }

    get Metadata(): Record<string, any> | undefined {
        return this.metadata;
    }
}
