from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

JAKARTA_TIME_ZONE = ZoneInfo("Asia/Jakarta")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def jakarta_today() -> date:
    """Tanggal hari ini menurut WIB, bukan UTC."""
    return datetime.now(JAKARTA_TIME_ZONE).date()


def to_utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()
