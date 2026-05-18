/*
 * One-off cleanup for duplicate Google Tasks created by the earlier buggy
 * "Sync all tasks" run (before the legacy-account reconcile fix).
 *
 * After the reconcile fix runs, for any kanban task that had both an original
 * (legacy) Google task and a sync-all duplicate in the same physical account,
 * task_google_links keeps ONE row (the survivor) and the other Google task
 * becomes an untracked orphan. This script finds Google tasks that are NOT
 * referenced by task_google_links but whose title matches a task that IS
 * tracked for the same account, and deletes those orphans — leaving exactly
 * one Google task per tracked kanban task.
 *
 * It never deletes a Google task that is currently tracked in
 * task_google_links, and it is dry-run by default.
 *
 * Usage (run from repo root, with the server's prod env loaded):
 *   node server/scripts/cleanup-google-duplicates.js --email you@example.com
 *   node server/scripts/cleanup-google-duplicates.js --email you@example.com --account you@gmail.com
 *   node server/scripts/cleanup-google-duplicates.js --email you@example.com --apply
 *
 * Without --apply nothing is deleted; it only reports what it would delete.
 */

require('dotenv').config();
const pool = require('../db');
const googleRoutes = require('../routes/google');

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--account') args.account = argv[++i];
  }
  return args;
}

async function listAllGoogleTasks(tasksClient) {
  const items = [];
  let pageToken;
  do {
    const resp = await tasksClient.tasks.list({
      tasklist: '@default',
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      pageToken,
    });
    for (const t of resp.data.items || []) items.push(t);
    pageToken = resp.data.nextPageToken;
  } while (pageToken);
  return items;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.email) {
    console.error('Required: --email <user email>');
    process.exit(1);
  }
  const mode = args.apply ? 'APPLY (will delete)' : 'DRY RUN (no changes)';
  console.log(`Mode: ${mode}`);

  const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [args.email]);
  if (userRes.rows.length === 0) {
    console.error(`No user found with email ${args.email}`);
    process.exit(1);
  }
  const userId = userRes.rows[0].id;

  const accRes = await pool.query(
    'SELECT id, google_email, refresh_token FROM google_accounts WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  let accounts = accRes.rows;
  if (args.account) {
    accounts = accounts.filter((a) => a.google_email === args.account);
  }
  if (accounts.length === 0) {
    console.error('No matching Google accounts for this user.');
    process.exit(1);
  }

  let totalCandidates = 0;
  let totalDeleted = 0;
  let totalFailed = 0;

  for (const acc of accounts) {
    console.log(`\n=== Account: ${acc.google_email} (id ${acc.id}) ===`);
    if (/^legacy-\d+@unknown$/.test(acc.google_email)) {
      console.log('  Skipping unreconciled legacy placeholder row.');
      continue;
    }

    const tasksClient = googleRoutes.getTasksClientForToken(acc.refresh_token);

    let googleTasks;
    try {
      googleTasks = await listAllGoogleTasks(tasksClient);
    } catch (err) {
      console.error(`  Could not list Google tasks (skipping): ${err.message}`);
      continue;
    }

    const linkRes = await pool.query(
      'SELECT google_task_id FROM task_google_links WHERE google_account_id = $1',
      [acc.id]
    );
    const trackedIds = new Set(linkRes.rows.map((r) => r.google_task_id));

    // Titles that have at least one tracked Google task.
    const trackedTitles = new Set();
    for (const g of googleTasks) {
      if (g.id && trackedIds.has(g.id) && g.title) {
        trackedTitles.add(g.title.trim());
      }
    }

    // Candidates: untracked Google tasks whose title duplicates a tracked one.
    const candidates = googleTasks.filter(
      (g) =>
        g.id &&
        !trackedIds.has(g.id) &&
        g.title &&
        trackedTitles.has(g.title.trim())
    );

    console.log(
      `  Google tasks: ${googleTasks.length} | tracked: ${trackedIds.size} | orphan duplicates: ${candidates.length}`
    );
    for (const c of candidates) {
      console.log(`   - "${c.title}" (google id ${c.id}, updated ${c.updated || 'n/a'})`);
    }
    totalCandidates += candidates.length;

    if (args.apply) {
      for (const c of candidates) {
        try {
          await tasksClient.tasks.delete({ tasklist: '@default', task: c.id });
          totalDeleted += 1;
        } catch (err) {
          totalFailed += 1;
          console.error(`   ! Failed to delete ${c.id}: ${err.message}`);
        }
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Orphan duplicates found: ${totalCandidates}`);
  if (args.apply) {
    console.log(`Deleted: ${totalDeleted} | Failed: ${totalFailed}`);
  } else {
    console.log('Dry run — nothing deleted. Re-run with --apply to delete the above.');
  }

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
