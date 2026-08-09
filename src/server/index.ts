import cors from "cors";
import express from "express";
import helmet from "helmet";
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

// This is a single integrated application: in production the same Express
// process that serves /api also serves the built React app (dist/client),
// so there is nothing separate to host or deploy. In development the
// client is served instead by the Vite dev server (see `npm run dev`),
// which proxies /api to this process.
if (env.isProduction) {
  const clientDist = path.join(__dirname, "../client");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
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
