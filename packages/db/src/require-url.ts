export function requireMigrationsUrl(): string {
  const url = process.env.DATABASE_URL_MIGRATIONS;
  if (!url) {
    console.error('DATABASE_URL_MIGRATIONS is required (direct connection, migrations only).');
    process.exit(1);
  }
  return url;
}
