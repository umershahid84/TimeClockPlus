import { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface AppConfig {
  timezone: string;
}

const DEFAULT_CONFIG: AppConfig = { timezone: "UTC" };

const AppConfigContext = createContext<AppConfig>(DEFAULT_CONFIG);

/**
 * Fetches the organization's configured timezone (APP_TIMEZONE) once at
 * startup. This is a public, unauthenticated endpoint (/api/config) since
 * it's needed by the kiosk page, which has no logged-in user. Used
 * wherever a REAL instant (kiosk punches, audit log timestamps) needs to
 * be converted to local time - see utils/time.ts's formatInstant, and the
 * server-side convention note in utils/timezone.ts.
 */
export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    fetch(`${base}/api/config`)
      .then((res) => res.json())
      .then((data) => setConfig({ timezone: data.timezone ?? DEFAULT_CONFIG.timezone }))
      .catch(() => {
        /* keep default; non-critical */
      });
  }, []);

  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext);
}
