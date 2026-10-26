from datetime import datetime


def now() -> datetime:
    """Business-local timestamp. Serialized without a timezone suffix so the UI reads it as local time."""
    return datetime.now().replace(microsecond=0)
