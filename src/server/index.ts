import cors from "cors";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { env } from "./config/env";
import { ensureCoreLinesOfBusinessSeeded } from "./config/linesOfBusinessSeed";
import { authRouter } from "./routes/auth";
import { employeesRouter } from "./routes/employees";
import { schedulesRouter } from "./routes/schedules";
import { timesheetsRouter } from "./routes/timesheets";
import { usersRouter } from "./routes/users";
import { linesOfBusinessRouter } from "./routes/linesOfBusiness";
import { reportsRouter } from "./routes/reports";

// Last-resort safety net: every route handler is wrapped in asyncHandler
// (see utils/asyncHandler.ts) so application errors are caught and
// converted to a proper JSON response, but this also guards against any
// error in code that ISN'T an Express handler (background timers, etc.).
// On modern Node, an unhandled rejection defaults to crashing the whole
// process - logging instead of crashing keeps one bad request from taking
// down every other user's session.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("Uncaught exception:", err);
});

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/timesheets", timesheetsRouter);
app.use("/api/users", usersRouter);
app.use("/api/lines-of-business", linesOfBusinessRouter);
app.use("/api/reports", reportsRouter);

// This is a single integrated application: the same Express process that
// serves /api also serves the built React app (dist/client) whenever a
// build is present, so there is nothing separate to host or deploy.
// Deliberately NOT gated on NODE_ENV/env.isProduction - `npm start` runs
// the compiled server directly, and if NODE_ENV isn't explicitly set to
// "production" (easy to forget, and .env.example defaults it to
// "development"), gating on that would silently serve bare 404s for every
// page instead of the app, which is exactly what was happening here.
// During `npm run dev` the Vite dev server on its own port serves the
// client instead - this only matters when dist/client actually exists.
const clientDist = path.join(__dirname, "../client");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else if (env.isProduction) {
  // eslint-disable-next-line no-console
  console.warn(`No built client found at ${clientDist} - run "npm run build" before "npm start". Only /api routes will work.`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

ensureCoreLinesOfBusinessSeeded()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed core lines of business on startup:", err);
  })
  .finally(() => {
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`TimeClockPlus listening on port ${env.port} (${env.nodeEnv})`);
    });
  });
