export type CatalogEntry = {
  firstAt: string;
  lastAt: string;
  firstVersion: string;
  lastVersion: string;
};

export type CatalogRow = {
  name: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSeenVersion: string;
  lastSeenVersion: string;
};

export function recordCatalogObservation(
  map: Map<string, CatalogEntry>,
  obs: { name: string | undefined; timestamp: string; version: string },
): void {
  const { name, timestamp, version } = obs;
  if (!name) {
    return;
  }
  const cur = map.get(name);
  if (!cur) {
    map.set(name, {
      firstAt: timestamp,
      lastAt: timestamp,
      firstVersion: version,
      lastVersion: version,
    });
    return;
  }
  if (timestamp < cur.firstAt) {
    cur.firstAt = timestamp;
    cur.firstVersion = version;
  }
  if (timestamp > cur.lastAt) {
    cur.lastAt = timestamp;
    cur.lastVersion = version;
  }
}

export function catalogMapToRows(map: Map<string, CatalogEntry>): CatalogRow[] {
  return [...map.entries()].map(([name, v]) => ({
    name,
    firstSeenAt: v.firstAt,
    lastSeenAt: v.lastAt,
    firstSeenVersion: v.firstVersion,
    lastSeenVersion: v.lastVersion,
  }));
}
