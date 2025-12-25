
export const LoggerServiceKey = Symbol('LoggerService');

export type Log = {
  logId: string;
  requestId?: string;
  message: string;
  data?: any;
  stack?: string;
  app?: string;
  env?: string;
};

export type LogParams = {
  ctx: string;
  info: object | string;
  message?: string;
  requestId?: string;
};

export interface ILoggerService {
  setContext(context: string): void;
  verbose(params: LogParams): void;
  debug(params: LogParams): void;
  info(params: LogParams): void;
  warn(params: LogParams): void;
  error(params: LogParams): void;
}
