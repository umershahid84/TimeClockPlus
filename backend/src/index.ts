import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { authRouter } from "./routes/auth";
import { employeesRouter } from "./routes/employees";
import { schedulesRouter } from "./routes/schedules";
import { timesheetsRouter } from "./routes/timesheets";
import { usersRouter } from "./routes/users";
import { linesOfBusinessRouter } from "./routes/linesOfBusiness";
import { reportsRouter } from "./routes/reports";

const app = express();

app.use(helmet());
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`TimeClockPlus API listening on port ${env.port}`);
});
