from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("Adding back kode_plant...")
    try: conn.execute(text("ALTER TABLE area_grouping ADD COLUMN kode_plant VARCHAR(10) NOT NULL"))
    except: pass
    try: conn.execute(text("ALTER TABLE photos ADD COLUMN kode_plant VARCHAR(10) NOT NULL"))
    except: pass
    try: conn.execute(text("ALTER TABLE photos ADD COLUMN kode_plant2 VARCHAR(10)"))
    except: pass
    try: conn.execute(text("ALTER TABLE stock_calculations ADD COLUMN kode_plant VARCHAR(10) NOT NULL"))
    except: pass

    # Restore alembic version pointer
    # The previous successful migration before my edits was 3a7b06ef4865
    conn.execute(text("UPDATE alembic_version SET version_num = '3a7b06ef4865'"))
    conn.commit()
print("Done.")
