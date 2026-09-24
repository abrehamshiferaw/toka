import { EventEmitter } from 'events';
import { UsageEvent } from './types';
import { BudgetWarning } from '../budgets/types';
import { TokaBudgetExceededError } from '../errors';
import { RoutingDecision } from '../routing/types';

export interface TokaEventMap {
  usage: UsageEvent;
  budgetWarning: BudgetWarning;
  budgetExceeded: TokaBudgetExceededError;
  cacheHit: { key: string; savedCost: number; savedTokens?: number };
  fallback: { originalModel: string; fallbackModel: string; reason: string };
  routing: RoutingDecision;
}

export class TokaEventEmitter {
  private readonly emitter = new EventEmitter();
  private readonly events: UsageEvent[] = [];
  private readonly maxStoredEvents: number;

  constructor(maxStoredEvents = 10000) {
    this.maxStoredEvents = maxStoredEvents;
    // Set higher max listeners to prevent memory leak warnings in complex pipelines
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  once<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.emitter.once(event, listener);
    return this;
  }

  off<K extends keyof TokaEventMap>(
    event: K,
    listener: (data: TokaEventMap[K]) => void
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  emit<K extends keyof TokaEventMap>(event: K, data: TokaEventMap[K]): boolean {
    if (event === 'usage') {
      const usageEv = data as unknown as UsageEvent;
      this.events.push(usageEv);
      if (this.events.length > this.maxStoredEvents) {
        this.events.shift();
      }
    }
    return this.emitter.emit(event, data);
  }

  getEvents(): readonly UsageEvent[] {
    return this.events;
  }

  clearEvents(): void {
    this.events.length = 0;
  }
}
