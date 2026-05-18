from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text("SHOW TABLES")).fetchall()
    print("Tables:", [r[0] for r in res])
    try:
        res = conn.execute(text("DESCRIBE stock_calculations")).fetchall()
        print("stock_calculations schema:", [r[0] for r in res])
    except Exception as e:
        print(e)
    try:
        res = conn.execute(text("DESCRIBE master_plant")).fetchall()
        print("master_plant schema:", [r[0] for r in res])
    except Exception as e:
        print(e)
