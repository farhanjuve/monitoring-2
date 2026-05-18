from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS warehouse_plants"))
    conn.execute(text("DROP TABLE IF EXISTS warehouses"))
    conn.commit()
print("Dropped.")
