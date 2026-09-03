import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BackfillKind,
  BackfillRoute,
  planRouteRegionBackfill,
} from '../src/region/route-region-backfill';
import { XINJIANG_REGION_DATA_VERSION, XINJIANG_CITIES } from '../src/region/xinjiang-regions';

const SCHEMA = 2;
const prisma = new PrismaClient();
const include = { points: { orderBy: { order: 'asc' as const } }, regions: true };
type Database = Prisma.TransactionClient;
type Checkpoint = {
  schema: number;
  catalog: string;
  database: string;
  mode: 'preview' | 'apply';
  completed: Record<string, string>;
};

export function validateCheckpoint(previous: Checkpoint, expected: Checkpoint) {
  if (
    !previous ||
    previous.schema !== expected.schema ||
    previous.catalog !== expected.catalog ||
    previous.database !== expected.database ||
    previous.mode !== expected.mode ||
    !previous.completed ||
    typeof previous.completed !== 'object' ||
    Array.isArray(previous.completed) ||
    !Object.entries(previous.completed).every(
      ([key, hash]) =>
        /^(official|user):[1-9]\d*$/.test(key) &&
        typeof hash === 'string' &&
        /^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw new Error('checkpoint_mismatch');
  return previous;
}

export function options(args: string[]) {
  let apply = false;
  let reportRoot = resolve('logs/v23-region-backfill');
  let resume: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply' && args[i + 1] === 'V23-BACKFILL') {
      apply = true;
      i++;
    } else if (args[i] === '--report-dir' && args[i + 1] && !args[i + 1].startsWith('--'))
      reportRoot = resolve(args[++i]);
    else if (args[i] === '--resume' && args[i + 1] && !args[i + 1].startsWith('--'))
      resume = resolve(args[++i]);
    else throw new Error('invalid_arguments');
  }
  return { apply, reportRoot, resume };
}

function databaseFingerprint() {
  // Bind to the database without storing its URL or credentials.
  const url = new URL(process.env.DATABASE_URL ?? '');
  return createHash('sha256')
    .update(`${url.hostname}:${url.port || '3306'}${url.pathname}`)
    .digest('hex');
}

function saveCheckpoint(directory: string, value: Checkpoint) {
  const temporary = join(directory, 'checkpoint.tmp');
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, join(directory, 'checkpoint.json'));
}

async function readRoute(
  db: Database,
  kind: BackfillKind,
  id: bigint,
): Promise<BackfillRoute | null> {
  return kind === 'official'
    ? db.route.findFirst({ where: { id, deleted_at: null }, include })
    : db.userRoute.findFirst({ where: { id, status: 1 }, include });
}

export async function writePlan(
  tx: Database,
  kind: BackfillKind,
  id: bigint,
  plan: ReturnType<typeof planRouteRegionBackfill>,
) {
  if (plan.issues.length) throw new Error('unresolved_regions');
  if (kind === 'official') {
    for (const patch of plan.pointPatches)
      await tx.routePoint.update({ where: { id: patch.id }, data: patch.data });
    if (plan.coverageChanged) {
      await tx.routeRegion.deleteMany({ where: { route_id: id } });
      if (plan.coverage.length)
        await tx.routeRegion.createMany({
          data: plan.coverage.map((item) => ({ route_id: id, ...item })),
        });
    }
    if (plan.primaryChanged)
      await tx.route.update({
        where: { id },
        data: {
          ...plan.primary,
          city_name:
            XINJIANG_CITIES.find((city) => city.code === plan.primary.city_code)?.name ?? null,
        },
      });
  } else {
    if (plan.createPoints)
      await tx.userRoutePoint.createMany({
        data: plan.points.map((point) => ({
          user_route_id: id,
          order: point.order,
          type: point.type,
          name: point.name,
          address: point.address,
          latitude: point.latitude,
          longitude: point.longitude,
          province_code: point.province_code,
          city_code: point.city_code,
          district_code: point.district_code,
        })),
      });
    else
      for (const patch of plan.pointPatches)
        await tx.userRoutePoint.update({ where: { id: patch.id }, data: patch.data });
    if (plan.coverageChanged) {
      await tx.userRouteRegion.deleteMany({ where: { user_route_id: id } });
      if (plan.coverage.length)
        await tx.userRouteRegion.createMany({
          data: plan.coverage.map((item) => ({ user_route_id: id, ...item })),
        });
    }
    if (plan.primaryChanged) await tx.userRoute.update({ where: { id }, data: plan.primary });
  }
  // Preserve point IDs, polylines, external URLs, visibility and user information.
}

async function main() {
  const config = options(process.argv.slice(2));
  const mode = config.apply ? 'apply' : 'preview';
  const database = databaseFingerprint();
  let checkpoint: Checkpoint = {
    schema: SCHEMA,
    catalog: XINJIANG_REGION_DATA_VERSION,
    database,
    mode,
    completed: {},
  };
  if (config.resume) {
    const previous = JSON.parse(
      readFileSync(join(config.resume, 'checkpoint.json'), 'utf8'),
    ) as Checkpoint;
    checkpoint = validateCheckpoint(previous, checkpoint);
  }
  mkdirSync(config.reportRoot, { recursive: true, mode: 0o700 });
  // Resume creates a new report; never truncates previous evidence.
  const directory = mkdtempSync(join(config.reportRoot, `${mode}-`));
  saveCheckpoint(directory, checkpoint);
  console.log(`Report directory: ${directory}`);
  const counts = {
    examined: 0,
    ready: 0,
    unchanged: 0,
    applied: 0,
    resumed: 0,
    blocked: 0,
    failed: 0,
  };
  let aborted = false;
  try {
    for (const kind of ['official', 'user'] as const) {
      let after = 0n;
      while (true) {
        const rows =
          kind === 'official'
            ? await prisma.route.findMany({
                where: { id: { gt: after }, deleted_at: null },
                select: { id: true },
                orderBy: { id: 'asc' },
                take: 100,
              })
            : await prisma.userRoute.findMany({
                where: { id: { gt: after }, status: 1 },
                select: { id: true },
                orderBy: { id: 'asc' },
                take: 100,
              });
        if (!rows.length) break;
        for (const { id } of rows) {
          const key = `${kind}:${id}`;
          counts.examined++;
          let event: Record<string, unknown>;
          try {
            const route = await readRoute(prisma, kind, id);
            if (!route) throw new Error('resource_changed');
            const plan = planRouteRegionBackfill(kind, route);
            if (plan.issues.length) {
              counts.blocked++;
              delete checkpoint.completed[key];
              event = { status: 'blocked', issues: plan.issues };
            } else if (checkpoint.completed[key] === plan.fingerprint) {
              counts.resumed++;
              event = { status: 'resumed' };
            } else if (!config.apply) {
              counts[plan.changed ? 'ready' : 'unchanged']++;
              checkpoint.completed[key] = plan.fingerprint;
              event = {
                status: plan.changed ? 'ready' : 'unchanged',
                points: plan.points.length,
                coverage: plan.coverage.length,
              };
            } else {
              const saved = await prisma.$transaction(
                async (tx) => {
                  const current = await readRoute(tx, kind, id);
                  if (!current) throw new Error('resource_changed');
                  const currentPlan = planRouteRegionBackfill(kind, current);
                  if (currentPlan.fingerprint !== plan.fingerprint)
                    throw new Error('resource_changed');
                  if (currentPlan.changed) await writePlan(tx, kind, id, currentPlan);
                  const updated = await readRoute(tx, kind, id);
                  if (!updated) throw new Error('resource_changed');
                  const verified = planRouteRegionBackfill(kind, updated);
                  if (verified.issues.length || verified.changed)
                    throw new Error('post_write_verification_failed');
                  return verified;
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
              );
              checkpoint.completed[key] = saved.fingerprint;
              counts[plan.changed ? 'applied' : 'unchanged']++;
              event = { status: plan.changed ? 'applied' : 'unchanged' };
            }
          } catch (error) {
            counts.failed++;
            delete checkpoint.completed[key];
            const reason =
              error instanceof Error &&
              ['resource_changed', 'unresolved_regions', 'post_write_verification_failed'].includes(
                error.message,
              )
                ? error.message
                : 'database_or_validation_failure';
            event = { status: 'failed', reason };
          }
          // Report IDs/orders/machine codes only; never addresses or raw SQL errors.
          appendFileSync(
            join(directory, 'results.jsonl'),
            JSON.stringify({ resource: key, ...event }) + '\n',
            { mode: 0o600 },
          );
          saveCheckpoint(directory, checkpoint);
        }
        after = rows.at(-1)!.id;
      }
    }
  } catch {
    aborted = true;
    counts.failed++;
    appendFileSync(
      join(directory, 'results.jsonl'),
      JSON.stringify({ scope: 'run', status: 'failed', reason: 'scan_or_report_failure' }) + '\n',
      { mode: 0o600 },
    );
  }
  const report = { schema: SCHEMA, catalog: checkpoint.catalog, mode, aborted, ...counts };
  writeFileSync(join(directory, 'summary.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (counts.blocked || counts.failed) process.exitCode = aborted ? 1 : 2;
  if (!config.apply)
    console.log('Preview only; no database writes. Resolve blocked records before planning apply.');
}

if (require.main === module)
  main()
    .catch(() => {
      console.error(
        'Backfill stopped. Check arguments, checkpoint mode/database/catalog and database access; no raw errors are printed.',
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
