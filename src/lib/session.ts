import { sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { sessions } from '../db/schema';

type SessionObservation = {
  sessionId: string;
  userEmail: string;
  appVersion: string;
  timestamp: string;
  entrypoint?: string | undefined;
  terminalType?: string | undefined;
};

export async function upsertSession(
  db: DrizzleD1Database,
  observation: SessionObservation,
): Promise<void> {
  const {
    sessionId,
    userEmail,
    appVersion,
    timestamp,
    entrypoint,
    terminalType,
  } = observation;
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
      entrypoint,
      terminalType,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        userEmail,
        appVersion,
        // 属性を持たない経路(メトリクス)からの更新で既存値を消さない
        entrypoint: sql`COALESCE(excluded.entrypoint, ${sessions.entrypoint})`,
        terminalType: sql`COALESCE(excluded.terminal_type, ${sessions.terminalType})`,
        firstSeenAt: sql`CASE WHEN excluded.first_seen_at < ${sessions.firstSeenAt} THEN excluded.first_seen_at ELSE ${sessions.firstSeenAt} END`,
        lastSeenAt: sql`CASE WHEN excluded.last_seen_at > ${sessions.lastSeenAt} THEN excluded.last_seen_at ELSE ${sessions.lastSeenAt} END`,
      },
    });
}
