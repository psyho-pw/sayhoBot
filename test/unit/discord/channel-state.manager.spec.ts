import { Song } from '../../../src/discord/discord.model';
import { ChannelState } from '../../../src/discord/state/channel-state';
import { ChannelStateManager } from '../../../src/discord/state/channel-state.manager';

describe('ChannelStateManager', () => {
  let manager: ChannelStateManager;

  beforeEach(() => {
    manager = new ChannelStateManager();
  });

  describe('get', () => {
    it('should create new state if not exists', () => {
      const state = manager.get('guild-1');
      expect(state).toBeInstanceOf(ChannelState);
    });

    it('should return existing state', () => {
      const state1 = manager.get('guild-1');
      const state2 = manager.get('guild-1');
      expect(state1).toBe(state2);
    });

    it('should create separate states for different guilds', () => {
      const state1 = manager.get('guild-1');
      const state2 = manager.get('guild-2');
      expect(state1).not.toBe(state2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent guild', () => {
      expect(manager.has('guild-1')).toBe(false);
    });

    it('should return true after state is created', () => {
      manager.get('guild-1');
      expect(manager.has('guild-1')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should remove state', () => {
      manager.get('guild-1');
      manager.delete('guild-1');
      expect(manager.has('guild-1')).toBe(false);
    });
  });

  describe('musicQueue operations', () => {
    const guildId = 'guild-1';

    it('should set and get music queue', () => {
      const song = new Song();
      song.title = 'Test Song';
      song.url = 'https://youtube.com/watch?v=test';

      manager.setMusicQueue(guildId, [song]);
      const queue = manager.getMusicQueue(guildId);

      expect(queue).toHaveLength(1);
      expect(queue[0].title).toBe('Test Song');
    });

    it('should shuffle queue keeping first item', () => {
      const songs = Array.from({ length: 5 }, (_, i) => {
        const song = new Song();
        song.title = `Song ${i}`;
        return song;
      });

      manager.setMusicQueue(guildId, songs);
      const firstSong = manager.getMusicQueue(guildId)[0];

      manager.shuffleMusicQueue(guildId);
      const shuffledQueue = manager.getMusicQueue(guildId);

      expect(shuffledQueue[0]).toBe(firstSong);
      expect(shuffledQueue).toHaveLength(5);
    });

    it('should not shuffle queue with single item', () => {
      const song = new Song();
      song.title = 'Only Song';

      manager.setMusicQueue(guildId, [song]);
      manager.shuffleMusicQueue(guildId);

      expect(manager.getMusicQueue(guildId)).toHaveLength(1);
    });
  });

  describe('playing state', () => {
    const guildId = 'guild-1';

    it('should default to false', () => {
      expect(manager.getIsPlaying(guildId)).toBe(false);
    });

    it('should set playing state', () => {
      manager.setIsPlaying(guildId, true);
      expect(manager.getIsPlaying(guildId)).toBe(true);
    });
  });

  describe('volume', () => {
    const guildId = 'guild-1';

    it('should default to 1', () => {
      expect(manager.getVolume(guildId)).toBe(1);
    });

    it('should set volume', () => {
      manager.setVolume(guildId, 0.5);
      expect(manager.getVolume(guildId)).toBe(0.5);
    });
  });

  describe('player operations', () => {
    const guildId = 'guild-1';

    it('should return null when no player', () => {
      expect(manager.getPlayer(guildId)).toBeNull();
    });

    it('should set and get player', () => {
      const mockPlayer = { play: jest.fn() } as any;
      manager.setPlayer(guildId, mockPlayer);
      expect(manager.getPlayer(guildId)).toBe(mockPlayer);
    });

    it('should delete player', () => {
      const mockPlayer = { play: jest.fn() } as any;
      manager.setPlayer(guildId, mockPlayer);
      manager.deletePlayer(guildId);
      expect(manager.getPlayer(guildId)).toBeNull();
    });
  });

  describe('connection operations', () => {
    const guildId = 'guild-1';

    it('should return null when no connection', () => {
      expect(manager.getConnection(guildId)).toBeNull();
    });

    it('should set and get connection', () => {
      const mockConnection = { destroy: jest.fn() } as any;
      manager.setConnection(guildId, mockConnection);
      expect(manager.getConnection(guildId)).toBe(mockConnection);
    });

    it('should delete connection', () => {
      const mockConnection = { destroy: jest.fn() } as any;
      manager.setConnection(guildId, mockConnection);
      manager.deleteConnection(guildId);
      expect(manager.getConnection(guildId)).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should reset all state and destroy connection', () => {
      const guildId = 'guild-1';
      const mockConnection = { destroy: jest.fn() } as any;
      const mockMessage = { delete: jest.fn().mockResolvedValue(undefined) } as any;

      manager.setConnection(guildId, mockConnection);
      manager.setIsPlaying(guildId, true);
      manager.setVolume(guildId, 0.5);
      manager.addToDeleteQueue(guildId, mockMessage);

      manager.cleanup(guildId);

      expect(mockConnection.destroy).toHaveBeenCalled();
      expect(manager.getIsPlaying(guildId)).toBe(false);
      expect(manager.getVolume(guildId)).toBe(1);
      expect(manager.getConnection(guildId)).toBeNull();
    });
  });
});
