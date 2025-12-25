import { Request as ExpressRequest } from 'express';

declare module 'express' {
  interface Request {
    startTime: number;
    requestId: string;
  }
}

export type Request = ExpressRequest;
