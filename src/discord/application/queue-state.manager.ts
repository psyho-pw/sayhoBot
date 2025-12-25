import { Injectable } from '@nestjs/common';
import { QueueState } from '../domain/entities/queue-state.entity';

@Injectable()
export class QueueStateManager {
  private readonly states = new Map<string, QueueState>();

  getOrCreate(guildId: string): QueueState {
    let state = this.states.get(guildId);
    if (!state) {
      state = new QueueState();
      this.states.set(guildId, state);
    }
    return state;
  }

  get(guildId: string): QueueState | undefined {
    return this.states.get(guildId);
  }

  reset(guildId: string): void {
    const state = this.states.get(guildId);
    if (state) {
      state.reset();
    }
  }

  delete(guildId: string): void {
    this.states.delete(guildId);
  }
}
