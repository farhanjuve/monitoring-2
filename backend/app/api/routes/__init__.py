from fastapi import APIRouter
from app.api.routes import auth, stocks

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(stocks.router, prefix="/stocks", tags=["Stocks"])
