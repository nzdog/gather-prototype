/**
 * [[GTC-274]] — THE DEPLOY CHECK FOR THE LIVE SWITCH. The first step of `npm run build`.
 *
 * Founder ruling, 2026-09-29: production sends only where the live setting is on, "checked at
 * deploy (without it production sends nothing)". So a production build without
 * `GATHER_LIVE_SENDS=on` FAILS HERE, loudly, before migrations run or anything is built — rather
 * than deploying a Gather that quietly sends nothing.
 *
 * ⚠ ONE LINE IN THE BUILD LOG, EITHER WAY, whenever `RAILWAY_ENVIRONMENT_NAME` is set: the
 * environment's name and whether live sending is on. The deploy step is to confirm that line, so
 * the check does not rest on the environment being named `production` — it shows what it saw.
 * Outside Railway (a local build) it prints nothing and passes.
 *
 * Plain node, no dependencies: it runs before anything else in the build.
 * It prints the setting's STATE (on/off), never its value.
 */
const environment = process.env.RAILWAY_ENVIRONMENT_NAME;

if (environment) {
  const live = process.env.GATHER_LIVE_SENDS === 'on';
  console.log(
    `[check-live-sends] Railway environment "${environment}": live sending is ${live ? 'on' : 'off'}`
  );
  if (environment === 'production' && !live) {
    console.error(
      '[check-live-sends] REFUSED: this is production and GATHER_LIVE_SENDS is not "on", so this ' +
        'Gather would send no text and no email. Set GATHER_LIVE_SENDS=on on the production ' +
        'service and deploy again (GTC-274).'
    );
    process.exit(1);
  }
}
