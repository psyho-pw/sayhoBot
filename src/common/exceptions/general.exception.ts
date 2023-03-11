import {HttpException, HttpStatus} from '@nestjs/common'

export class GeneralException extends HttpException {
    private readonly callClass: string
    private readonly callMethod: string

    constructor(callClass: string, callMethod: string, message: string, status?: number) {
        super({callClass, callMethod, message}, status || HttpStatus.INTERNAL_SERVER_ERROR)
        this.callClass = callClass
        this.callMethod = callMethod
    }

    get CallClass(): string {
        return this.callClass
    }

    get CallMethod(): string {
        return this.callMethod
    }

    getCalledFrom(): string {
        return `${this.callClass}.${this.callMethod}`
    }
}
