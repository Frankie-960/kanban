import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Global default categories (userId = null means shared by all users)
  const categoryCount = await prisma.category.count({ where: { userId: null } });
  if (categoryCount === 0) {
    await prisma.category.createMany({
      data: [
        { key: 'PROCUREMENT_SOURCING', name: '招标寻源', order: 1 },
        { key: 'PAYMENT', name: '供应商付款', order: 2 },
        { key: 'OTHER', name: '其他', order: 3 },
      ],
    });
    console.log('Seeded default categories');
  }

  // Global default sub-statuses
  const subStatusCount = await prisma.subStatus.count({ where: { userId: null } });
  if (subStatusCount === 0) {
    await prisma.subStatus.createMany({
      data: [
        { category: 'PROCUREMENT_SOURCING', name: '供应商报价中', order: 1 },
        { category: 'PROCUREMENT_SOURCING', name: '待发起采购评审', order: 2 },
        { category: 'PROCUREMENT_SOURCING', name: '采购评审中', order: 3 },
        { category: 'PAYMENT', name: '待供应商发起请款申请', order: 1 },
        { category: 'PAYMENT', name: '内部验收确认中', order: 2 },
        { category: 'PAYMENT', name: '付款流程已发起', order: 3 },
      ],
    });
    console.log('Seeded default sub-statuses');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
