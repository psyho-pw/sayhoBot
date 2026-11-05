# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Discord music bot built with NestJS that plays music from YouTube in voice channels. Uses a hexagonal architecture with clear domain/application/infrastructure separation.

## Common Commands

### Development

```bash
# Install dependencies
pnpm install

# Development with watch mode (default: development env)
pnpm start:dev

# Development with specific environment
pnpm start:dev --env=production

# Build
pnpm build

# Production
pnpm start:prod

# Production with env file
pnpm start:prod:env
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:cov

# Debug tests
pnpm test:debug

# E2E tests
pnpm test:e2e
```

### Code Quality

```bash
# Lint and auto-fix
pnpm lint

# Format code
pnpm format
```

### Docker

```bash
# Run with Docker Compose (development mode)
docker-compose up
```

### Environment Management

```bash
# Upload environment files to OCI Object Storage
pnpm env:up

# Download environment files from OCI Object Storage
pnpm env:down
```

## Architecture

### Hexagonal Architecture (Ports & Adapters)

The codebase follows a strict layered architecture:

```text
src/
├── discord/                    # Core domain module
│   ├── domain/                # Business entities & port interfaces
│   │   ├── entities/          # Pure domain models (QueueState, Song)
│   │   └── ports/             # Abstraction boundaries (IYoutubeSearch, IStreamProvider, etc.)
│   ├── application/           # Use cases & orchestration
│   │   ├── play-music.usecase.ts
│   │   ├── search-video.usecase.ts
│   │   └── queue-state.manager.ts
│   ├── infrastructure/        # External integrations (adapters)
│   │   ├── discord-client/    # Discord.js wrapper
│   │   ├── voice/             # Voice connection & streaming
│   │   ├── youtube/           # YouTube API & auth
│   │   └── notification/      # Error reporting webhook
│   └── presentation/          # User-facing layer
│       ├── commands/          # Slash & prefix commands
│       └── events/            # Discord event handlers
├── song/                      # Persistence module
├── common/                    # Cross-cutting concerns
│   ├── aop/                   # Aspect-oriented programming
│   ├── modules/               # Config, Logger, CLS
│   └── exceptions/
```

**Key Pattern**: Domain layer defines port interfaces, infrastructure layer provides adapter implementations. All injected via NestJS DI with Symbol-based tokens.

### State Management

**Per-Guild Isolation**: Each Discord server (guild) has independent state stored in maps keyed by `guildId`:

- `ChannelStateAdapter`: Manages `ChannelState` per guild containing:
  - `queueState`: Domain entity with song queue
  - `player`: Discord audio player
  - `connection`: Voice channel connection
  - `currentInfoMsg`: UI message reference
  - `deleteQueue`: Message cleanup tracking

**QueueState Entity** (`discord/domain/entities/queue-state.entity.ts`): Encapsulates queue operations with private fields and public methods (addSong, skip, reset, etc.)

### Command System

Supports dual command inputs:

1. **Slash commands**: Native Discord commands registered via REST API
2. **Prefix commands**: Text-based with configurable prefix (default: `$`)

Commands are defined in `discord/presentation/commands/` and registered in a `Collection<string, CommandFunction>` that handles both interaction types.

Available commands: `play`/`p`, `skip`/`s`, `queue`/`q`, `empty`/`eq`, `leave`/`l`, `shuffle`/`sh`, `help`/`h`

### Music Playback Flow

1. User runs `play` command → `PlayMusicUseCase.execute()`
2. Song added to `QueueState` for the guild
3. If not already playing:
   - Creates/retrieves voice connection
   - Creates audio stream via `StreamProviderAdapter` (YouTube download)
   - Subscribes `AudioPlayer` to connection
   - Sets `isPlaying = true`
4. When song ends:
   - `AudioPlayer` emits `idle` event
   - `onIdle` callback removes song, calls `playNext()`
   - Continues until queue empty

**Stream Provider** spawns the `yt-dlp` binary (must be on `PATH`; installed in the Dockerfile) and pipes its stdout as the audio stream. yt-dlp failures reject the promise, so the caller skips the song instead of crashing.

### Aspect-Oriented Programming

Uses `@toss/nestjs-aop` decorators for cross-cutting concerns:

- **`@WithDiscordContext()`**: Generates UUID v7 request ID, stores in CLS for tracing
- **`@HandleDiscordError(options?)`**: Wraps methods with error handling, logging, and production webhook notifications
  - `bubble: true`: Re-throws exception
  - `bubble: false`: Silent handling with logging

Applied to event handlers and critical operations.

### YouTube Integration

**Authentication**: `PoTokenAdapter` auto-refreshes YouTube auth tokens every 4 hours using `bgutils-js` to bypass bot detection.

**Search**: `YoutubeSearchAdapter` wraps `simple-youtube-api` for video/playlist searches.

**Streaming**: `StreamProviderAdapter` runs `yt-dlp -f bestaudio -o -` with `--js-runtimes node` (player JS challenges) and `--proxy` when `PROXY` is set. Bump `YT_DLP_VERSION` in the Dockerfile when YouTube breaks extraction.

### Database

Uses TypeORM with MySQL.

**Song Entity** (`song/entity/song.entity.ts`):

- `id`, `url`, `title`, `count` (play count)
- Inherits from `AbstractEntity` (id, createdAt, updatedAt, deletedAt)
- Soft delete support via `@DeleteDateColumn`

**Transactions**: Uses `typeorm-transactional` decorators for ACID operations.

## Configuration

Environment files: `.env/.env.development`, `.env/.env.production`

Required variables:

- `PORT`: HTTP server port
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`: Discord bot credentials
- `DISCORD_COMMAND_PREFIX`: Command prefix (e.g., `$`)
- `YOUTUBE_API_KEY`: YouTube Data API key
- `IDENTITY_TOKEN`: YouTube identity token for ytdl-core
- `DISCORD_WEBHOOK_URL`: Error notification webhook
- `PROXY`: HTTP proxy for YouTube requests (optional)
- `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PORT`: MySQL connection

Configuration loaded via `@nestjs/config` and typed interfaces in `common/modules/config/`.

## Test

Tests located in `test/unit/` directory.

Test setup: `test/jest-setup.ts` runs before all tests.

Module path mapping: `src/*` aliased to `<rootDir>/src/*` in Jest config.

When writing tests:

- Use NestJS testing utilities (`@nestjs/testing`)
- Mock port interfaces, not adapters directly
- Test domain entities in isolation
- Test use cases with mocked dependencies

## Development Notes

### Adding New Commands

1. Create command file in `discord/presentation/commands/`
2. Implement `CommandFunction` signature: `(client, message, args) => Promise<void>`
3. Define slash command builder in `getSlashCommands()` (commands.ts)
4. Register in `buildCommandHandlers()` with name and aliases

### Adding Infrastructure Adapters

1. Define port interface in `discord/domain/ports/`
2. Create adapter in `discord/infrastructure/`
3. Register in `DiscordModule` providers: `{ provide: YourPort, useClass: YourAdapter }`
4. Inject via `@Inject(YourPort)` in use cases

### Error Handling

Production errors automatically reported via Discord webhook (configured in `NotificationAdapter`).

Use `@HandleDiscordError({ bubble: false })` for silent error handling with logging.

For recoverable errors in streams/voice, implement retry logic in adapters.

### Voice Connection Cleanup

Auto-cleanup triggers when bot is alone in voice channel:

- 5-second grace period
- Clears queue, stops player, destroys connection
- Implemented in `voiceStateUpdate` event handler

### Logging

Uses Winston logger via `nest-winston`:

- Daily rotating file transport
- Structured logging with context
- Inject: `@Inject(LoggerServiceKey) logger: ILoggerService`
- Set context: `logger.setContext('YourClassName')`
- Log methods: `logger.debug()`, `logger.verbose()`, `logger.log()`, `logger.warn()`, `logger.error()`

## Important Patterns

### Symbol-Based Injection Tokens

Port interfaces use Symbol tokens for DI to avoid string-based collisions:

```typescript
export const YourPort = Symbol('YourPort');
export interface IYourPort { /* ... */ }

// In module
{ provide: YourPort, useClass: YourAdapter }

// In consumer
constructor(@Inject(YourPort) private readonly yourService: IYourPort)
```

### Domain Entity Factories

Create entities via static factory methods:

```typescript
Song.create({ videoId, title, url, thumbnail, durationSeconds })
```

### CLS (Continuation-Local Storage)

Request context stored in CLS for tracing:

- Access via `ClsService` from `nestjs-cls`
- Request ID stored as `REQUEST_ID` key
- Auto-populated by `@WithDiscordContext()` decorator
