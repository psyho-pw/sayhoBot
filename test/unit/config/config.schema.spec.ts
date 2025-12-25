import {
  validateConfig,
  DiscordConfigSchema,
  YoutubeConfigSchema,
  DBConfigSchema,
} from '../../../src/config/config.schema';

describe('Config Schema Validation', () => {
  describe('DiscordConfigSchema', () => {
    it('should pass with valid config', () => {
      const config = {
        TOKEN: 'valid-token',
        CLIENT_ID: 'valid-client-id',
        GUILD_ID: 'valid-guild-id',
        COMMAND_PREFIX: '!',
        MESSAGE_DELETE_TIMEOUT: 7000,
      };

      expect(() => validateConfig(DiscordConfigSchema, config)).not.toThrow();
    });

    it('should fail without TOKEN', () => {
      const config = {
        CLIENT_ID: 'valid-client-id',
      };

      expect(() => validateConfig(DiscordConfigSchema, config)).toThrow(
        /DISCORD_TOKEN is required/,
      );
    });

    it('should fail without CLIENT_ID', () => {
      const config = {
        TOKEN: 'valid-token',
      };

      expect(() => validateConfig(DiscordConfigSchema, config)).toThrow(
        /DISCORD_CLIENT_ID is required/,
      );
    });

    it('should fail with empty TOKEN', () => {
      const config = {
        TOKEN: '',
        CLIENT_ID: 'valid-client-id',
      };

      expect(() => validateConfig(DiscordConfigSchema, config)).toThrow();
    });
  });

  describe('YoutubeConfigSchema', () => {
    it('should pass with valid config', () => {
      const config = {
        YOUTUBE_API_KEY: 'valid-api-key',
        COOKIE: 'some-cookie',
      };

      expect(() => validateConfig(YoutubeConfigSchema, config)).not.toThrow();
    });

    it('should fail without YOUTUBE_API_KEY', () => {
      const config = {
        COOKIE: 'some-cookie',
      };

      expect(() => validateConfig(YoutubeConfigSchema, config)).toThrow(
        /YOUTUBE_API_KEY is required/,
      );
    });

    it('should pass without optional fields', () => {
      const config = {
        YOUTUBE_API_KEY: 'valid-api-key',
      };

      expect(() => validateConfig(YoutubeConfigSchema, config)).not.toThrow();
    });
  });

  describe('DBConfigSchema', () => {
    it('should pass with valid config', () => {
      const config = {
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
        database: 'test_db',
      };

      expect(() => validateConfig(DBConfigSchema, config)).not.toThrow();
    });

    it('should fail without host', () => {
      const config = {
        port: 3306,
        username: 'root',
        password: 'password',
        database: 'test_db',
      };

      expect(() => validateConfig(DBConfigSchema, config)).toThrow(/DB_HOST is required/);
    });

    it('should fail without username', () => {
      const config = {
        host: 'localhost',
        port: 3306,
        password: 'password',
        database: 'test_db',
      };

      expect(() => validateConfig(DBConfigSchema, config)).toThrow(/DB_USERNAME is required/);
    });

    it('should fail without password', () => {
      const config = {
        host: 'localhost',
        port: 3306,
        username: 'root',
        database: 'test_db',
      };

      expect(() => validateConfig(DBConfigSchema, config)).toThrow(/DB_PASSWORD is required/);
    });

    it('should fail without database', () => {
      const config = {
        host: 'localhost',
        port: 3306,
        username: 'root',
        password: 'password',
      };

      expect(() => validateConfig(DBConfigSchema, config)).toThrow(/DB_DATABASE is required/);
    });

    it('should work without optional port', () => {
      const config = {
        host: 'localhost',
        username: 'root',
        password: 'password',
        database: 'test_db',
      };

      expect(() => validateConfig(DBConfigSchema, config)).not.toThrow();
    });
  });
});
