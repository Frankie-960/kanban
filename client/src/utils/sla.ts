import dayjs from 'dayjs';
import type { Item } from '../types';

export function isStale(item: Item, days = 3): boolean {
  if (item.status === 'COMPLETED') return false;
  if (item.priority !== 'URGENT' && item.priority !== 'HIGH') return false;
  if (!item.updatedAt) return false;
  return dayjs().diff(dayjs(item.updatedAt), 'day') >= days;
}

export function staleDays(item: Item): number {
  if (!item.updatedAt) return 0;
  return dayjs().diff(dayjs(item.updatedAt), 'day');
}
