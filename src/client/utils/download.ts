/** Downloads a file from an authenticated API endpoint (e.g. a CSV export) as an attachment. */
export async function downloadAuthenticated(path: string, filename: string) {
  const token = localStorage.getItem("tcp_token");
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${base}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
