import type { Item } from '../types';

export const MILESTONES = ['询比价', '招投标', '合同拟定', '审批中', '签署归档'] as const;
export type MilestoneIndex = 0 | 1 | 2 | 3 | 4;

const SUB_STATUS_TO_STEP: Record<string, MilestoneIndex> = {
  '供应商报价中': 0,
  '待发起采购评审': 1,
  '采购评审中': 2,
  '待供应商发起请款申请': 3,
  '内部验收确认中': 3,
  '付款流程已发起': 4,
};

export function getMilestone(item: Pick<Item, 'subStatus' | 'status'>): MilestoneIndex {
  if (item.subStatus && SUB_STATUS_TO_STEP[item.subStatus] !== undefined) {
    return SUB_STATUS_TO_STEP[item.subStatus];
  }
  if (item.status === 'COMPLETED') return 4;
  if (item.status === 'IN_PROGRESS') return 2;
  return 0;
}
