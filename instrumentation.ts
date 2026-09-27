// Runs once when the Next.js server starts: validate config (refuse to start without APP_SECRET), then seed the demo user.
// The `if` block (not an early return) lets webpack drop the Node-only imports from the Edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getConfig } = await import('./lib/server/config');
    try {
      getConfig();
    } catch (e) {
      console.error(`\n[safespend] ${(e as Error).message}\n`);
      process.exit(1);
    }
    const { seedDemoIfEmpty } = await import('./lib/server/services/demo');
    if (await seedDemoIfEmpty()) console.log('[safespend] Created demo user aisha@demo.com / demo1234 with demo data.');
  }
}
