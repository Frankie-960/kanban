/**
 * Visibility fix verification script
 *
 * Seeds (idempotent) a test department + 2 users in it + 3 items, then verifies
 * that the server's buildItemWhere() correctly isolates personal view from
 * department view.
 *
 * Test entities are all prefixed/labeled so they can be identified later:
 *   - department name:   __viz_test_dept__
 *   - user emails:       viz-test-a@example.com / viz-test-b@example.com
 *   - item titles:       __viz_test_PRIVATE_A__ / __viz_test_DEPT_A__ / __viz_test_OWN_B__
 *
 * Run from server/ directory:
 *   npx tsx scripts/test-visibility.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

const DEPT_NAME = '__viz_test_dept__';
const PASSWORD = 'viz-test-pw-1234';
const USER_A_EMAIL = 'viz-test-a@example.com';
const USER_B_EMAIL = 'viz-test-b@example.com';
const TITLE_PRIVATE_A = '__viz_test_PRIVATE_A__';
const TITLE_DEPT_A = '__viz_test_DEPT_A__';
const TITLE_OWN_B = '__viz_test_OWN_B__';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

async function seed() {
  console.log('--- Seeding test data ---');

  const dept =
    (await prisma.department.findFirst({ where: { name: DEPT_NAME } })) ??
    (await prisma.department.create({
      data: { name: DEPT_NAME, description: 'auto-created for visibility test' },
    }));

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const userA = await prisma.user.upsert({
    where: { email: USER_A_EMAIL },
    update: { departmentId: dept.id, passwordHash },
    create: { email: USER_A_EMAIL, name: 'Viz Test A', passwordHash, departmentId: dept.id },
  });

  const userB = await prisma.user.upsert({
    where: { email: USER_B_EMAIL },
    update: { departmentId: dept.id, passwordHash },
    create: { email: USER_B_EMAIL, name: 'Viz Test B', passwordHash, departmentId: dept.id },
  });

  // Clear any leftover test items from previous runs (across both users)
  await prisma.item.deleteMany({
    where: { title: { in: [TITLE_PRIVATE_A, TITLE_DEPT_A, TITLE_OWN_B] } },
  });

  await prisma.item.create({
    data: {
      title: TITLE_PRIVATE_A,
      userId: userA.id,
      visibility: 'PRIVATE',
      departmentId: dept.id,
      category: 'OTHER',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });

  await prisma.item.create({
    data: {
      title: TITLE_DEPT_A,
      userId: userA.id,
      visibility: 'DEPARTMENT',
      departmentId: dept.id,
      category: 'OTHER',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });

  await prisma.item.create({
    data: {
      title: TITLE_OWN_B,
      userId: userB.id,
      visibility: 'PRIVATE',
      departmentId: dept.id,
      category: 'OTHER',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  });

  console.log(`  dept=${dept.id} userA=${userA.id} userB=${userB.id}`);
  return { dept, userA, userB };
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json() as { token: string };
  return data.token;
}

async function getItems(token: string, view?: string): Promise<{ title: string }[]> {
  const qs = view ? `?view=${view}` : '';
  const res = await fetch(`${BASE_URL}/api/items${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /items failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.items;
}

async function getSummary(token: string, view?: string): Promise<{ totals: { count: number } }> {
  const qs = view ? `?view=${view}` : '';
  const res = await fetch(`${BASE_URL}/api/items/summary${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /summary failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function runTests() {
  await seed();

  console.log('\n--- Logging in as B ---');
  const tokenB = await login(USER_B_EMAIL);

  console.log('\n--- B: personal view (no ?view param) ---');
  const personalItems = await getItems(tokenB);
  const personalTitles = new Set(personalItems.map((i) => i.title));
  assert(
    personalTitles.has(TITLE_OWN_B),
    'personal view contains B\'s own item',
    `titles=${[...personalTitles].join(',')}`,
  );
  assert(
    !personalTitles.has(TITLE_DEPT_A),
    'personal view does NOT contain A\'s DEPARTMENT item (the fix)',
    personalTitles.has(TITLE_DEPT_A) ? 'leak still present' : undefined,
  );
  assert(
    !personalTitles.has(TITLE_PRIVATE_A),
    'personal view does NOT contain A\'s PRIVATE item',
  );

  console.log('\n--- B: department view (?view=department) ---');
  const deptItems = await getItems(tokenB, 'department');
  const deptTitles = new Set(deptItems.map((i) => i.title));
  assert(
    deptTitles.has(TITLE_OWN_B),
    'department view contains B\'s own item',
  );
  assert(
    deptTitles.has(TITLE_DEPT_A),
    'department view contains A\'s DEPARTMENT item',
    `titles=${[...deptTitles].join(',')}`,
  );
  assert(
    !deptTitles.has(TITLE_PRIVATE_A),
    'department view does NOT contain A\'s PRIVATE item',
  );

  console.log('\n--- B: summary, personal view ---');
  const personalSummary = await getSummary(tokenB);
  const personalCount = countTestItems(await getItemsForCount(tokenB));
  assert(
    personalSummary.totals.count === personalCount.total,
    `summary count matches list (${personalSummary.totals.count} === ${personalCount.total})`,
  );
  assert(
    personalCount.testOnly === 1,
    `personal summary shows only 1 viz_test item (got ${personalCount.testOnly})`,
  );

  console.log('\n--- B: summary, department view ---');
  const deptSummary = await getSummary(tokenB, 'department');
  const deptCount = countTestItems(await getItemsForCount(tokenB, 'department'));
  assert(
    deptSummary.totals.count === deptCount.total,
    `summary count matches list (${deptSummary.totals.count} === ${deptCount.total})`,
  );
  assert(
    deptCount.testOnly === 2,
    `department summary shows 2 viz_test items (got ${deptCount.testOnly})`,
  );
}

async function getItemsForCount(token: string, view?: string) {
  return getItems(token, view);
}

function countTestItems(items: { title: string }[]) {
  const testTitles = new Set([TITLE_PRIVATE_A, TITLE_DEPT_A, TITLE_OWN_B]);
  return {
    total: items.length,
    testOnly: items.filter((i) => testTitles.has(i.title)).length,
  };
}

runTests()
  .then(() => {
    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    if (failures.length) {
      console.log('Failures:');
      for (const f of failures) console.log('  - ' + f);
    }
    console.log('\nSeeded entities (kept for inspection):');
    console.log(`  Department: ${DEPT_NAME}`);
    console.log(`  Users:      ${USER_A_EMAIL} / ${USER_B_EMAIL}  (password: ${PASSWORD})`);
    console.log(`  Items:      ${TITLE_PRIVATE_A}, ${TITLE_DEPT_A}, ${TITLE_OWN_B}`);
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error('Test run errored:', e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
