import { BudgetScope } from './types';

export function roundCost(value: number): number {
  return Number(value.toFixed(12));
}

export interface ReservationItem {
  scope: BudgetScope;
  key?: string;
  amount: number;
  limit: number;
}

export interface ReservationResult {
  success: boolean;
  reservationId?: string;
  violation?: {
    scope: BudgetScope;
    limit: number;
    spent: number;
    remaining: number;
    requestedCost: number;
  };
}

export interface BudgetStore {
  getUsage(scope: BudgetScope, key?: string): Promise<number>;
  incrementUsage(
    scope: BudgetScope,
    key: string | undefined,
    amount: number
  ): Promise<number>;
  getRemaining(
    scope: BudgetScope,
    limit: number,
    key?: string
  ): Promise<number>;
  reserve(items: ReservationItem[]): Promise<ReservationResult>;
  commitReservation(
    reservationId: string,
    actualItems: Array<{ scope: BudgetScope; key?: string; amount: number }>
  ): Promise<void>;
  releaseReservation(reservationId: string): Promise<void>;
  reset(scope?: BudgetScope, key?: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryBudgetStore implements BudgetStore {
  private readonly spending = new Map<string, number>();
  private readonly reserved = new Map<string, number>();
  private readonly reservations = new Map<
    string,
    Array<{ storageKey: string; amount: number }>
  >();
  private reservationSeq = 0;

  private makeKey(scope: BudgetScope, key?: string): string {
    return `${scope}:${key ?? 'global'}`;
  }

  async getUsage(scope: BudgetScope, key?: string): Promise<number> {
    const storageKey = this.makeKey(scope, key);
    const spent = this.spending.get(storageKey) ?? 0;
    const pending = this.reserved.get(storageKey) ?? 0;
    return roundCost(spent + pending);
  }

  async getCommittedUsage(scope: BudgetScope, key?: string): Promise<number> {
    const storageKey = this.makeKey(scope, key);
    return roundCost(this.spending.get(storageKey) ?? 0);
  }

  async incrementUsage(
    scope: BudgetScope,
    key: string | undefined,
    amount: number
  ): Promise<number> {
    if (amount <= 0) return this.getUsage(scope, key);
    const storageKey = this.makeKey(scope, key);
    const current = this.spending.get(storageKey) ?? 0;
    const updated = roundCost(current + amount);
    this.spending.set(storageKey, updated);
    return updated;
  }

  async getRemaining(
    scope: BudgetScope,
    limit: number,
    key?: string
  ): Promise<number> {
    const used = await this.getUsage(scope, key);
    return roundCost(Math.max(0, limit - used));
  }

  async reserve(items: ReservationItem[]): Promise<ReservationResult> {
    // Atomically check all limits against current (committed + reserved) spending
    for (const item of items) {
      if (item.amount <= 0) continue;
      const storageKey = this.makeKey(item.scope, item.key);
      const spent = this.spending.get(storageKey) ?? 0;
      const pending = this.reserved.get(storageKey) ?? 0;
      const totalUsed = roundCost(spent + pending);
      const proposedTotal = roundCost(totalUsed + item.amount);

      if (proposedTotal > item.limit) {
        const remaining = roundCost(Math.max(0, item.limit - totalUsed));
        return {
          success: false,
          violation: {
            scope: item.scope,
            limit: item.limit,
            spent: totalUsed,
            remaining,
            requestedCost: item.amount,
          },
        };
      }
    }

    // All fit within limits; allocate reservation
    this.reservationSeq += 1;
    const reservationId = `res_${Date.now()}_${this.reservationSeq}`;
    const reservedItems: Array<{ storageKey: string; amount: number }> = [];

    for (const item of items) {
      if (item.amount <= 0) continue;
      const storageKey = this.makeKey(item.scope, item.key);
      const currentReserved = this.reserved.get(storageKey) ?? 0;
      this.reserved.set(storageKey, roundCost(currentReserved + item.amount));
      reservedItems.push({ storageKey, amount: item.amount });
    }

    this.reservations.set(reservationId, reservedItems);
    return { success: true, reservationId };
  }

  async commitReservation(
    reservationId: string,
    actualItems: Array<{ scope: BudgetScope; key?: string; amount: number }>
  ): Promise<void> {
    const reservedItems = this.reservations.get(reservationId);
    if (reservedItems) {
      for (const item of reservedItems) {
        const currentReserved = this.reserved.get(item.storageKey) ?? 0;
        const updated = roundCost(Math.max(0, currentReserved - item.amount));
        if (updated === 0) {
          this.reserved.delete(item.storageKey);
        } else {
          this.reserved.set(item.storageKey, updated);
        }
      }
      this.reservations.delete(reservationId);
    }

    // Apply actual amounts to committed spending
    for (const item of actualItems) {
      if (item.amount > 0) {
        const storageKey = this.makeKey(item.scope, item.key);
        const current = this.spending.get(storageKey) ?? 0;
        this.spending.set(storageKey, roundCost(current + item.amount));
      }
    }
  }

  async releaseReservation(reservationId: string): Promise<void> {
    const reservedItems = this.reservations.get(reservationId);
    if (!reservedItems) return;

    for (const item of reservedItems) {
      const currentReserved = this.reserved.get(item.storageKey) ?? 0;
      const updated = roundCost(Math.max(0, currentReserved - item.amount));
      if (updated === 0) {
        this.reserved.delete(item.storageKey);
      } else {
        this.reserved.set(item.storageKey, updated);
      }
    }
    this.reservations.delete(reservationId);
  }

  async reset(scope?: BudgetScope, key?: string): Promise<void> {
    if (!scope) {
      await this.clear();
      return;
    }
    const targetPrefix = key ? this.makeKey(scope, key) : `${scope}:`;
    for (const k of Array.from(this.spending.keys())) {
      if (k === targetPrefix || k.startsWith(targetPrefix)) {
        this.spending.delete(k);
      }
    }
    for (const k of Array.from(this.reserved.keys())) {
      if (k === targetPrefix || k.startsWith(targetPrefix)) {
        this.reserved.delete(k);
      }
    }
  }

  async clear(): Promise<void> {
    this.spending.clear();
    this.reserved.clear();
    this.reservations.clear();
  }
}
