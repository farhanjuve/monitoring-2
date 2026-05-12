import ssl
import pymysql
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# TiDB Cloud requires SSL
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Build sync URL from async URL by replacing the driver
sync_url = settings.DATABASE_URL.replace("mysql+aiomysql://", "mysql+pymysql://")
# Remove charset query param if present for clean URL
if "?" in sync_url:
    base_url = sync_url.split("?")[0]
else:
    base_url = sync_url

engine = create_engine(
    base_url,
    echo=False,
    connect_args={"ssl": ssl_context},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
