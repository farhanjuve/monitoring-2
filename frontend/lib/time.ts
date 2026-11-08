const JAKARTA_TIME_ZONE = "Asia/Jakarta";

export function formatJakartaDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: JAKARTA_TIME_ZONE,
  });
}

/** Tanggal hari ini (YYYY-MM-DD) menurut zona waktu Jakarta, bukan UTC. */
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
