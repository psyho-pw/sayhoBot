import {HttpException, HttpStatus} from '@nestjs/common'

export class GeneralException extends HttpException {
    private readonly callClass: string
    private callMethod: string

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

    set CallMethod(value: string) {
        this.callMethod = value
    }

    getCalledFrom(): string {
        return `${this.callClass}.${this.callMethod}`
    }
}
