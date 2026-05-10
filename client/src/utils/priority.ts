const WEIGHTS: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const getPriorityWeight = (priority: string): number => WEIGHTS[priority] ?? 4;
