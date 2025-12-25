import {plainToInstance, Type} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsOptional, IsString, Min, validateSync} from 'class-validator';

export class DiscordConfigSchema {
    @IsString()
    @IsNotEmpty({message: 'DISCORD_TOKEN is required'})
    TOKEN: string;

    @IsString()
    @IsNotEmpty({message: 'DISCORD_CLIENT_ID is required'})
    CLIENT_ID: string;

    @IsString()
    @IsOptional()
    GUILD_ID?: string;

    @IsString()
    @IsOptional()
    COMMAND_PREFIX?: string;

    @IsString()
    @IsOptional()
    WEBHOOK_URL?: string;

    @IsNumber()
    @Min(1000)
    @IsOptional()
    MESSAGE_DELETE_TIMEOUT?: number;
}

export class YoutubeConfigSchema {
    @IsString()
    @IsNotEmpty({message: 'YOUTUBE_API_KEY is required'})
    YOUTUBE_API_KEY: string;

    @IsString()
    @IsOptional()
    COOKIE?: string;

    @IsString()
    @IsOptional()
    IDENTITY_TOKEN?: string;
}

export class DBConfigSchema {
    @IsString()
    @IsNotEmpty({message: 'DB_HOST is required'})
    host: string;

    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    port?: number;

    @IsString()
    @IsNotEmpty({message: 'DB_USERNAME is required'})
    username: string;

    @IsString()
    @IsNotEmpty({message: 'DB_PASSWORD is required'})
    password: string;

    @IsString()
    @IsNotEmpty({message: 'DB_DATABASE is required'})
    database: string;
}

export class AppConfigSchema {
    @IsString()
    @IsNotEmpty()
    NAME: string;

    @IsString()
    @IsNotEmpty()
    VERSION: string;

    @IsString()
    @IsOptional()
    PROXY?: string;
}

export function validateConfig<T extends object>(
    schema: new () => T,
    config: Record<string, any>,
): T {
    const validatedConfig = plainToInstance(schema, config, {
        enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        const errorMessages = errors
            .map(error => Object.values(error.constraints || {}).join(', '))
            .join('; ');
        throw new Error(`Configuration validation failed: ${errorMessages}`);
    }

    return validatedConfig;
}
