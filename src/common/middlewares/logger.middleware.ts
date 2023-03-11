import {Request, Response, NextFunction} from 'express'
import {Injectable, NestMiddleware, Inject} from '@nestjs/common'
import {WINSTON_MODULE_PROVIDER} from 'nest-winston'
import {Logger} from 'winston'

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

    use(request: Request, response: Response, next: NextFunction): void {
        const {ip, method, originalUrl} = request
        const userAgent = request.get('user-agent') || ''
        //request log
        this.logger.http(`REQUEST [${method} ${originalUrl}] ${ip} ${userAgent}`, {
            query: request.query,
            body: request.body,
        })

        const send = response.send
        response.send = exitData => {
            const {statusCode} = response
            try {
                exitData = JSON.parse(exitData)
            } catch (err) {}
            //response log
            this.logger.http(`RESPONSE`, {status: statusCode, data: exitData})

            response.send = send
            return response.send(exitData)
        }
        next()
    }
}
