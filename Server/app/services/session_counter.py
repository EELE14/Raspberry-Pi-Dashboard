class SessionCounter:


    __slots__ = ("_count", "_max")

    def __init__(self, *, max_sessions: int | None = None) -> None:
        if max_sessions is not None and max_sessions < 1:
            raise ValueError(f"max_sessions must be ≥ 1, got {max_sessions}")
        self._count: int = 0
        self._max: int | None = max_sessions



    @property
    def count(self) -> int:
        return self._count

    @property
    def max_sessions(self) -> int | None:
        return self._max


    def at_limit(self) -> bool:
        return self._max is not None and self._count >= self._max



    def increment(self) -> None:
        self._count += 1

    def decrement(self) -> None:
        """Decrement the counter by one (clamped to zero)."""
        self._count = max(0, self._count - 1)


    def __repr__(self) -> str:
        limit = f"/{self._max}" if self._max is not None else ""
        return f"SessionCounter({self._count}{limit})"
