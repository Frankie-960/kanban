import { Prisma } from '@prisma/client';
import { AuthUser } from '../middleware/auth';

/**
 * Item 可见性过滤的唯一来源。
 *
 * ⚠ 历史遗留的不一致（P0 阶段刻意保留、不改行为）：
 *   - 列表（itemListVisibility）：个人视图只看自己；部门视图看 自己 + 本部门 DEPARTMENT，
 *     **不含 SHARED**。
 *   - 单条读取（itemReadVisibility）：看 自己 + 本部门 DEPARTMENT + **SHARED**。
 *   即「知道 id 能读到的 SHARED 任务，在列表里看不到」。
 *   P1 拆 items 时再决定是否统一（产品决策），届时只改这一个文件。
 */

/** 列表可见性。复刻 items.ts buildItemWhere() 的可见性子句，行为不变。 */
export function itemListVisibility(
  user: Pick<AuthUser, 'id' | 'departmentId'>,
  view: unknown,
): Prisma.ItemWhereInput {
  if (view === 'department' && user.departmentId) {
    return {
      OR: [
        { userId: user.id },
        {
          visibility: 'DEPARTMENT',
          OR: [{ departmentId: user.departmentId }, { departmentId: null }],
        },
      ],
    };
  }
  // 个人视图（默认）：严格仅自己
  return { userId: user.id };
}

/** 单条读取可见性。复刻 items.ts GET /:id 与 /:id/history 的 deptFilter，行为不变。 */
export function itemReadVisibility(
  user: Pick<AuthUser, 'id' | 'departmentId'>,
): Prisma.ItemWhereInput {
  const deptFilter: Prisma.ItemWhereInput[] = user.departmentId
    ? [
        { visibility: 'DEPARTMENT', departmentId: user.departmentId },
        { visibility: 'DEPARTMENT', departmentId: null },
        { visibility: 'SHARED' },
      ]
    : [{ visibility: 'SHARED' }];

  return { OR: [{ userId: user.id }, ...deptFilter] };
}
