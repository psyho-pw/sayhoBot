import {ConfigServiceKey} from '../../config/config.service';
import {Env} from '../../constants';
import {Inject, Injectable, Scope} from '@nestjs/common';
import {INQUIRER} from '@nestjs/core';
import {WINSTON_MODULE_NEST_PROVIDER, WinstonLogger} from 'nest-winston';
import {v7} from 'uuid';
import {Log, LogParams, ILoggerService} from './logger.interface';
import {IConfigService} from 'src/config/config.type';
import {IClsService} from '../cls/cls.type';
import {ClsServiceKey} from '../cls/cls.module';

@Injectable({scope: Scope.TRANSIENT})
export class LoggerService implements ILoggerService {
    private context: string;
    private isTest: boolean;

    constructor(
        @Inject(WINSTON_MODULE_NEST_PROVIDER)
        private readonly winstonLogger: WinstonLogger,
        @Inject(INQUIRER) private readonly caller: object,
        @Inject(ConfigServiceKey)
        private readonly configService: IConfigService,
        @Inject(ClsServiceKey) private readonly clsService: IClsService,
    ) {
        this.context = this.caller?.constructor.name || 'Unknown';
        this.isTest = this.configService.appConfig.ENV === Env.test;
    }

    private format(obj: object | string, message = ''): Log {
        const requestId = this.clsService.requestId;
        const log: Log = {message, requestId, logId: v7()};
        const appName = this.configService.appConfig.NAME;
        const nodeEnv = this.configService.appConfig.ENV;

        if (nodeEnv !== Env.local) {
            log.app = appName;
            log.env = nodeEnv;
        }

        if (obj instanceof Error) {
            log.stack = obj.stack;
            return log;
        }

        if (typeof obj === 'string') {
            log.message = `[${obj}] ${message}`;
            return log;
        }

        log.data = obj;
        return log;
    }

    public setContext(context: string) {
        this.context = context;
    }

    private makeContextString(detailedContext: string) {
        return `${this.context}#${detailedContext}`;
    }

    public verbose({ctx: detailedContext, info: object, message}: LogParams) {
        const log = this.format(object, message);
        this.winstonLogger.verbose?.(log, this.makeContextString(detailedContext));
    }

    public debug({ctx: detailedContext, info: object, message}: LogParams) {
        const log = this.format(object, message);
        this.winstonLogger.debug?.(log, this.makeContextString(detailedContext));
    }

    public info({ctx: detailedContext, info: object, message}: LogParams) {
        const log = this.format(object, message);
        this.winstonLogger.log(log, this.makeContextString(detailedContext));
    }

    public warn({ctx: detailedContext, info: object, message}: LogParams) {
        if (this.isTest) return;

        const log = this.format(object, message);
        this.winstonLogger.warn(log, this.makeContextString(detailedContext));
    }

    public error({ctx: detailedContext, info: object, message}: LogParams) {
        if (this.isTest) return;

        const log = this.format(object, message);
        this.winstonLogger.error(log, undefined, this.makeContextString(detailedContext));
    }
}
