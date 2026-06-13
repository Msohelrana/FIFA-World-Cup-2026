import { Client, Databases, Query } from 'node-appwrite';
import webpush from 'web-push';

const DATABASE_ID          = process.env.APPWRITE_DATABASE_ID;
const PUSH_COLLECTION      = process.env.PUSH_COLLECTION_ID      || 'pushsubscriptions';
const KICKOFF_LOG          = process.env.KICKOFF_LOG_COLLECTION_ID || 'kickofflog';
const VAPID_PUBLIC_KEY     = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY    = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT        = process.env.VAPID_SUBJECT            || 'mailto:admin@example.com';

export default async ({ req, res, log, error }) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    error('VAPID keys not configured');
    return res.json({ success: false, error: 'VAPID keys missing' }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
  const db = new Databases(client);

  // ── Determine notification content ──────────────────────────────────────────
  const isEventTrigger = (req.headers['x-appwrite-trigger'] || '').includes('event')
    || (req.headers['x-appwrite-event'] || '') !== '';

  let notification;

  if (isEventTrigger) {
    // Triggered by matchresults document create/update
    let doc = {};
    try { doc = JSON.parse(req.body || '{}'); } catch { /* ok */ }

    const s1 = doc.score1, s2 = doc.score2;
    if (s1 === null || s1 === undefined || s2 === null || s2 === undefined) {
      log('Skipping: incomplete result (scores not set yet)');
      return res.json({ skipped: true });
    }

    // matchId format: "2026-06-14_Mexico_Canada"
    const parts = (doc.matchId || '').split('_');
    const team1 = parts[1] || 'Team 1';
    const team2 = parts[2] || 'Team 2';
    const pen = (doc.pen1 !== null && doc.pen1 !== undefined && doc.pen1 !== doc.pen2)
      ? ` (PK ${doc.pen1}–${doc.pen2})`
      : '';

    notification = {
      title: '⚽ Result Entered',
      body: `${team1} ${s1}–${s2}${pen} ${team2}`,
      tag: `result-${doc.matchId || Date.now()}`,
    };
  } else {
    // HTTP call from frontend (kickoff notification)
    let data = {};
    try { data = JSON.parse(req.body || '{}'); } catch { /* ok */ }

    const matchId = (data.matchId || '').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (data.type === 'kickoff' && matchId) {
      // Deduplicate: try to create a kickoff log entry; 409 = already sent
      try {
        await db.createDocument(DATABASE_ID, KICKOFF_LOG, matchId, { sentAt: new Date().toISOString() });
      } catch (e) {
        if (e.code === 409) {
          log(`Kickoff already notified for ${matchId}`);
          return res.json({ skipped: true, reason: 'already sent' });
        }
        error(`Kickoff log write failed: ${e.message}`);
        // Continue anyway — better to send duplicate than miss
      }

      const team1 = data.team1 || 'TBD';
      const team2 = data.team2 || 'TBD';
      notification = {
        title: '🔴 Match Kicking Off',
        body: `${team1} vs ${team2} is starting now!`,
        tag: `kickoff-${matchId}`,
      };
    } else {
      error('Unknown request type');
      return res.json({ success: false, error: 'Unknown type' }, 400);
    }
  }

  // ── Fetch all push subscriptions ─────────────────────────────────────────────
  const subscriptions = [];
  try {
    let offset = 0;
    while (true) {
      const page = await db.listDocuments(DATABASE_ID, PUSH_COLLECTION, [
        Query.limit(100),
        Query.offset(offset),
      ]);
      subscriptions.push(...page.documents);
      if (subscriptions.length >= page.total) break;
      offset += 100;
    }
  } catch (e) {
    error(`Failed to fetch subscriptions: ${e.message}`);
    return res.json({ success: false, error: e.message }, 500);
  }

  if (!subscriptions.length) {
    log('No subscribers — nothing to send');
    return res.json({ success: true, sent: 0 });
  }

  log(`Sending "${notification.title}" to ${subscriptions.length} subscriber(s)`);

  // ── Send notifications ────────────────────────────────────────────────────────
  const payload = JSON.stringify(notification);
  const expired = [];

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 86400 }
      ).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.$id);
        throw err;
      })
    )
  );

  // Remove expired (unsubscribed) push endpoints
  await Promise.allSettled(
    expired.map(id => db.deleteDocument(DATABASE_ID, PUSH_COLLECTION, id).catch(() => {}))
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  log(`Sent: ${sent} | Failed: ${results.length - sent} | Expired removed: ${expired.length}`);

  return res.json({ success: true, sent, total: subscriptions.length });
};
