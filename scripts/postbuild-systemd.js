#!/usr/bin/env node
// Runs automatically after `npm run build` (npm's pre/post script convention -
// see package.json's "postbuild"). Its job is to make "npm run build" the
// only setup step before "sudo systemctl start timeclockplus" - no
// dedicated service account, no fixed install directory (the app can live
// anywhere - including a zip extracted straight into your home directory),
// no git clone required, no manual unit editing.
//
// Only acts on Linux, and only if the "deploy/systemd/timeclockplus.service"
// template exists (both true for this repo). Everywhere else it's a silent
// no-op that never fails the build.
//
// Deliberately does NOT run database migrations or touch .env: those need
// a live, correctly-configured database and should stay an explicit,
// reviewable step (see docs/SYSTEMD.md), not something that fires on
// every build.
const fs = require("fs");
const os = require("os");
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

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

// Who should the service run as? Prefer an explicit override, then a
// pre-existing dedicated "timeclockplus" system account (if you set one up
// per docs/SYSTEMD.md's hardened path), and otherwise just the person who
// ran the build - so nothing extra has to be created first.
function currentInvokingUser() {
  return process.env.SUDO_USER || process.env.USER || process.env.LOGNAME || os.userInfo().username;
}

function dedicatedAccountExists() {
  try {
    execFileSync("id", ["-u", "timeclockplus"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const serviceUser =
  process.env.TIMECLOCKPLUS_SERVICE_USER ||
  (dedicatedAccountExists() ? "timeclockplus" : currentInvokingUser());
const serviceGroup = process.env.TIMECLOCKPLUS_SERVICE_GROUP || serviceUser;
const workingDirectory = ROOT;
const nodeBin = process.execPath;

let unit = fs.readFileSync(UNIT_SRC, "utf8");
unit = unit
  .replace(/^User=.*$/m, `User=${serviceUser}`)
  .replace(/^Group=.*$/m, `Group=${serviceGroup}`)
  .replace(/^WorkingDirectory=.*$/m, `WorkingDirectory=${workingDirectory}`)
  .replace(/^ExecStart=.*$/m, `ExecStart=${nodeBin} dist/server/index.js`)
  // ProtectHome=true would hide the entire /home tree from the service,
  // including the app itself if it lives under a home directory (e.g. a
  // zip extracted to ~/tcp) - "read-only" keeps the sandboxing benefit
  // without breaking that common case, regardless of install location.
  .replace(/^ProtectHome=.*$/m, "ProtectHome=read-only");

function writeUnit() {
  if (isRoot) {
    fs.writeFileSync(UNIT_DEST, unit, { mode: 0o644 });
    return;
  }
  // Not root (the common case here - `npm run build` was run as yourself,
  // not via sudo): shell out to sudo for just this write. `sudo tee` reads
  // the password prompt from the controlling terminal even with stdin
  // piped, so this works fine from an interactive `npm run build`.
  execFileSync("sudo", ["tee", UNIT_DEST], { input: unit, stdio: ["pipe", "ignore", "inherit"] });
  execFileSync("sudo", ["chmod", "644", UNIT_DEST], { stdio: "inherit" });
}

function runPrivileged(cmd, args) {
  if (isRoot) {
    execFileSync(cmd, args, { stdio: "inherit" });
  } else {
    execFileSync("sudo", [cmd, ...args], { stdio: "inherit" });
  }
}

try {
  writeUnit();
  log(`Installed ${UNIT_DEST} (User=${serviceUser}, WorkingDirectory=${workingDirectory})`);
} catch (err) {
  log(`Could not install the systemd unit: ${err.message}`);
  log(`Install it by hand: sudo cp ${UNIT_SRC} ${UNIT_DEST} && sudo systemctl daemon-reload && sudo systemctl enable timeclockplus`);
  process.exit(0);
}

// Only chown when the service runs as someone other than whoever just
// built it (e.g. the optional dedicated "timeclockplus" account) - in the
// default no-extra-setup case the files are already owned correctly and
// this would just be an unnecessary extra sudo prompt.
if (serviceUser !== currentInvokingUser()) {
  for (const rel of ["dist", "node_modules", "package.json", "package-lock.json", "prisma", ".env"]) {
    const target = path.join(workingDirectory, rel);
    if (fs.existsSync(target)) {
      try {
        runPrivileged("chown", ["-R", `${serviceUser}:${serviceGroup}`, target]);
      } catch (err) {
        log(`Warning: could not chown ${target}: ${err.message}`);
      }
    }
  }
}

try {
  runPrivileged("systemctl", ["daemon-reload"]);
  runPrivileged("systemctl", ["enable", "timeclockplus"]);
  log("Ran systemctl daemon-reload and enabled timeclockplus (starts on boot).");
} catch (err) {
  log(`Warning: systemctl step failed: ${err.message}`);
  log("Run by hand: sudo systemctl daemon-reload && sudo systemctl enable timeclockplus");
}

log("Done. Start (or restart) the app with: sudo systemctl start timeclockplus");
