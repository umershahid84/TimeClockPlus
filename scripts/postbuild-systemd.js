#!/usr/bin/env node
// Runs automatically after `npm run build` (npm's pre/post script convention -
// see package.json's "postbuild"). Its job is to make "npm run build" the
// only manual step before "sudo systemctl start timeclockplus" - so it
// installs/refreshes the systemd unit, fixes file ownership, and enables
// the service, but ONLY when invoked as root on Linux. A normal
// `npm run build` (a developer's laptop, CI, `npm run dev` prerequisites,
// non-Linux) must never touch /etc/systemd/system, so every other case is
// a silent no-op - this script never fails the build.
//
// Deliberately does NOT run database migrations or touch .env: those need
// a live, correctly-configured database and should stay an explicit,
// reviewable step (see docs/SYSTEMD.md), not something that fires on
// every build.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const UNIT_SRC = path.join(ROOT, "deploy", "systemd", "timeclockplus.service");
const UNIT_DEST = "/etc/systemd/system/timeclockplus.service";

function log(msg) {
  console.log(`[postbuild:systemd] ${msg}`);
}

if (process.platform !== "linux" || !fs.existsSync(UNIT_SRC)) {
  process.exit(0);
}

if (typeof process.getuid !== "function" || process.getuid() !== 0) {
  log("Skipping systemd install (not running as root) - build output is ready.");
  log("To install/refresh the service in one step, re-run: sudo npm run build");
  log(`(or manually: sudo cp ${UNIT_SRC} ${UNIT_DEST} && sudo systemctl daemon-reload)`);
  process.exit(0);
}

// Override these if your service account isn't named "timeclockplus" -
// see docs/SYSTEMD.md.
const serviceUser = process.env.TIMECLOCKPLUS_SERVICE_USER || "timeclockplus";
const serviceGroup = process.env.TIMECLOCKPLUS_SERVICE_GROUP || serviceUser;
const workingDirectory = ROOT;
const nodeBin = process.execPath;

let unit = fs.readFileSync(UNIT_SRC, "utf8");
unit = unit
  .replace(/^User=.*$/m, `User=${serviceUser}`)
  .replace(/^Group=.*$/m, `Group=${serviceGroup}`)
  .replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${workingDirectory}`)
  .replace(/^ExecStart=.*$/m, `ExecStart=${nodeBin} dist/server/index.js`);

fs.writeFileSync(UNIT_DEST, unit, { mode: 0o644 });
log(`Installed ${UNIT_DEST}`);

// `npm run build` just ran as root - make sure the unprivileged service
// user can actually read what was built (systemd will run the process as
// that user, not root).
for (const rel of ["dist", "node_modules", "package.json", "package-lock.json", "prisma", ".env"]) {
  const target = path.join(workingDirectory, rel);
  if (fs.existsSync(target)) {
    try {
      execFileSync("chown", ["-R", `${serviceUser}:${serviceGroup}`, target]);
    } catch (err) {
      log(`Warning: could not chown ${target}: ${err.message}`);
    }
  }
}

try {
  execFileSync("systemctl", ["daemon-reload"]);
  execFileSync("systemctl", ["enable", "timeclockplus"]);
  log("Ran systemctl daemon-reload and enabled timeclockplus (starts on boot).");
} catch (err) {
  log(`Warning: systemctl step failed: ${err.message}`);
}

log("Done. Start (or restart) the app with: sudo systemctl start timeclockplus");
