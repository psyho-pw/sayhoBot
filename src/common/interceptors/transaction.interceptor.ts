import {catchError, tap} from 'rxjs/operators'
import {CallHandler, ExecutionContext, HttpException, Injectable, InternalServerErrorException, NestInterceptor} from '@nestjs/common'
import {Observable} from 'rxjs'
import {DataSource, QueryRunner} from 'typeorm'

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
    constructor(private readonly dataSource: DataSource) {}

    private async dbInit(): Promise<QueryRunner> {
        const queryRunner = this.dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.startTransaction()

        return queryRunner
    }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const req = context.switchToHttp().getRequest()
        const queryRunner: QueryRunner = await this.dbInit()

        req.queryRunnerManager = queryRunner.manager

        return next.handle().pipe(
            catchError(async e => {
                await queryRunner.rollbackTransaction()
                await queryRunner.release()

                if (e instanceof HttpException) throw new HttpException(e.message, e.getStatus())
                throw new InternalServerErrorException(e.message)
            }),
            tap(async () => {
                await queryRunner.commitTransaction()
                await queryRunner.release()
            }),
        )
    }
}
