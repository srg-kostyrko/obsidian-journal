interface JournalCollisionFields {
  readonly name: string;
  readonly nameTemplate: string;
  readonly folder: string;
  readonly dateFormat: string;
}

// Two journals collide when, for the same date, they resolve to the same note path. The
// journal-name variable individualizes the path, so it is substituted before comparing.
export function findCollidingJournals<T extends JournalCollisionFields>(configs: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const config of configs) {
    const key = [
      config.nameTemplate.replaceAll("{{journal_name}}", config.name),
      config.folder,
      config.dateFormat,
    ].join("\0");
    const list = groups.get(key) ?? [];
    list.push(config);
    groups.set(key, list);
  }
  return [...groups.values()].filter((list) => list.length > 1);
}
