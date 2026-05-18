from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("Dropping constraints and indexes...")
    try: conn.execute(text("ALTER TABLE area_grouping DROP INDEX uq_area_grouping_kab_gudang"))
    except: pass
    try: conn.execute(text("ALTER TABLE area_grouping DROP INDEX ix_area_grouping_gudang_id"))
    except: pass
    
    try: conn.execute(text("ALTER TABLE photos DROP INDEX ix_photos_tanggal_gudang"))
    except: pass
    try: conn.execute(text("ALTER TABLE photos DROP INDEX ix_photos_gudang_id"))
    except: pass
    
    try: conn.execute(text("ALTER TABLE stock_calculations DROP INDEX uq_stock_calc_tanggal_gudang_tipe"))
    except: pass
    try: conn.execute(text("ALTER TABLE stock_calculations DROP INDEX ix_stock_calculations_gudang_id"))
    except: pass

    print("Dropping columns...")
    for table in ["area_grouping", "photos", "stock_calculations"]:
        try: conn.execute(text(f"ALTER TABLE {table} DROP COLUMN gudang_id"))
        except: pass

    print("Dropping tables...")
    try: conn.execute(text("DROP TABLE IF EXISTS warehouse_plants"))
    except: pass
    try: conn.execute(text("DROP TABLE IF EXISTS warehouses"))
    except: pass

    conn.commit()
print("Done.")
