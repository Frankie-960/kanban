import dayjs from 'dayjs';
import type { Item } from '../types';

export const isOverdue = (item: Item): boolean =>
  !!item.dueDate && dayjs(item.dueDate).isBefore(dayjs()) && item.status !== 'COMPLETED';
