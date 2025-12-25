import { Song } from '../../../src/discord/domain/entities/song.entity';
import {
  ChannelState,
  ChannelStateAdapter,
} from '../../../src/discord/infrastructure/discord-client/channel-state.adapter';

describe('ChannelStateAdapter', () => {
  let adapter: ChannelStateAdapter;

  beforeEach(() => {
    adapter = new ChannelStateAdapter();
  });

  const createTestSong = (title: string): Song => {
    return Song.create({
      videoId: `video-${title}`,
      title,
      url: `https://youtube.com/watch?v=${title}`,
      thumbnail: 'https://example.com/thumb.jpg',
      duration: '3:45',
      voiceChannel: { id: 'channel-1', guildId: 'guild-1', name: 'General' },
    });
  };

  describe('get', () => {
    it('should create new state if not exists', () => {
      const state = adapter.get('guild-1');
      expect(state).toBeInstanceOf(ChannelState);
    });

    it('should return existing state', () => {
      const state1 = adapter.get('guild-1');
      const state2 = adapter.get('guild-1');
      expect(state1).toBe(state2);
    });

    it('should create separate states for different guilds', () => {
      const state1 = adapter.get('guild-1');
      const state2 = adapter.get('guild-2');
      expect(state1).not.toBe(state2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent guild', () => {
      expect(adapter.has('guild-1')).toBe(false);
    });

    it('should return true after state is created', () => {
      adapter.get('guild-1');
      expect(adapter.has('guild-1')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should remove state', () => {
      adapter.get('guild-1');
      adapter.delete('guild-1');
      expect(adapter.has('guild-1')).toBe(false);
    });
  });

  describe('musicQueue operations', () => {
    const guildId = 'guild-1';

    it('should add and get music queue', () => {
      const song = createTestSong('Test Song');

      adapter.addToQueue(guildId, song);
      const queue = adapter.getMusicQueue(guildId);

      expect(queue).toHaveLength(1);
      expect(queue[0].title).toBe('Test Song');
    });

    it('should add multiple songs to queue', () => {
      const songs = [createTestSong('Song 1'), createTestSong('Song 2')];

      adapter.addSongsToQueue(guildId, songs);
      const queue = adapter.getMusicQueue(guildId);

      expect(queue).toHaveLength(2);
    });

    it('should clear queue', () => {
      adapter.addToQueue(guildId, createTestSong('Test Song'));
      adapter.clearQueue(guildId);

      expect(adapter.getMusicQueue(guildId)).toHaveLength(0);
    });

    it('should shuffle queue keeping first item', () => {
      const songs = Array.from({ length: 5 }, (_, i) => createTestSong(`Song ${i}`));

      adapter.addSongsToQueue(guildId, songs);
      const firstSong = adapter.getMusicQueue(guildId)[0];

      adapter.shuffleMusicQueue(guildId);
      const shuffledQueue = adapter.getMusicQueue(guildId);

      expect(shuffledQueue[0]).toBe(firstSong);
      expect(shuffledQueue).toHaveLength(5);
    });

    it('should not shuffle queue with single item', () => {
      adapter.addToQueue(guildId, createTestSong('Only Song'));
      adapter.shuffleMusicQueue(guildId);

      expect(adapter.getMusicQueue(guildId)).toHaveLength(1);
    });
  });

  describe('playing state', () => {
    const guildId = 'guild-1';

    it('should default to false', () => {
      expect(adapter.getIsPlaying(guildId)).toBe(false);
    });

    it('should set playing state', () => {
      adapter.setIsPlaying(guildId, true);
      expect(adapter.getIsPlaying(guildId)).toBe(true);
    });
  });

  describe('volume', () => {
    const guildId = 'guild-1';

    it('should default to 1', () => {
      expect(adapter.getVolume(guildId)).toBe(1);
    });

    it('should set volume', () => {
      adapter.setVolume(guildId, 0.5);
      expect(adapter.getVolume(guildId)).toBe(0.5);
    });
  });

  describe('player operations', () => {
    const guildId = 'guild-1';

    it('should return null when no player', () => {
      expect(adapter.getPlayer(guildId)).toBeNull();
    });

    it('should set and get player', () => {
      const mockPlayer = { play: jest.fn() } as any;
      adapter.setPlayer(guildId, mockPlayer);
      expect(adapter.getPlayer(guildId)).toBe(mockPlayer);
    });

    it('should delete player', () => {
      const mockPlayer = { play: jest.fn() } as any;
      adapter.setPlayer(guildId, mockPlayer);
      adapter.deletePlayer(guildId);
      expect(adapter.getPlayer(guildId)).toBeNull();
    });
  });

  describe('connection operations', () => {
    const guildId = 'guild-1';

    it('should return null when no connection', () => {
      expect(adapter.getConnection(guildId)).toBeNull();
    });

    it('should set and get connection', () => {
      const mockConnection = { destroy: jest.fn() } as any;
      adapter.setConnection(guildId, mockConnection);
      expect(adapter.getConnection(guildId)).toBe(mockConnection);
    });

    it('should delete connection', () => {
      const mockConnection = { destroy: jest.fn() } as any;
      adapter.setConnection(guildId, mockConnection);
      adapter.deleteConnection(guildId);
      expect(adapter.getConnection(guildId)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should reset all state and destroy connection', () => {
      const guildId = 'guild-1';
      const mockConnection = { destroy: jest.fn() } as any;
      const mockMessage = { id: 'msg-1', delete: jest.fn().mockResolvedValue(undefined) } as any;

      adapter.setConnection(guildId, mockConnection);
      adapter.setIsPlaying(guildId, true);
      adapter.setVolume(guildId, 0.5);
      adapter.addToDeleteQueue(guildId, mockMessage);

      adapter.cleanup(guildId);

      expect(mockConnection.destroy).toHaveBeenCalled();
      expect(adapter.getIsPlaying(guildId)).toBe(false);
      expect(adapter.getVolume(guildId)).toBe(1);
      expect(adapter.getConnection(guildId)).toBeNull();
    });
  });
});
