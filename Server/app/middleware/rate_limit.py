from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

# module level limiter instance
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
)


def setup_rate_limiting(app: FastAPI) -> None:

    app.state.limiter = limiter
    
    app.add_middleware(SlowAPIMiddleware)

    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
