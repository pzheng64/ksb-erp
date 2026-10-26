from decimal import Decimal


class DomainError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status
        super().__init__(message)


def money(value) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(Decimal("0.01"))


def qty(value) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(Decimal("0.001"))
