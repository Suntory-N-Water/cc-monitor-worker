import { sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { sessions } from '../db/schema';

type SessionObservation = {
  sessionId: string;
  userEmail: string;
  appVersion: string;
  timestamp: string;
};

export async function upsertSession(
  db: DrizzleD1Database,
  observation: SessionObservation,
): Promise<void> {
  const { sessionId, userEmail, appVersion, timestamp } = observation;
  if (!sessionId) {
    return;
  }

  await db
    .insert(sessions)
    .values({
      id: sessionId,
      userEmail,
      appVersion,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        userEmail,
        appVersion,
        firstSeenAt: sql`CASE WHEN excluded.first_seen_at < ${sessions.firstSeenAt} THEN excluded.first_seen_at ELSE ${sessions.firstSeenAt} END`,
        lastSeenAt: sql`CASE WHEN excluded.last_seen_at > ${sessions.lastSeenAt} THEN excluded.last_seen_at ELSE ${sessions.lastSeenAt} END`,
      },
    });
}
