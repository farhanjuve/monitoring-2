from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Drop foreign keys first
    try:
        conn.execute(text("ALTER TABLE area_grouping DROP FOREIGN KEY area_grouping_ibfk_1")) # might be different name
    except: pass
    try:
        conn.execute(text("ALTER TABLE photos DROP FOREIGN KEY photos_ibfk_1"))
    except: pass
    try:
        conn.execute(text("ALTER TABLE stock_calculations DROP FOREIGN KEY stock_calculations_ibfk_1"))
    except: pass
    
    # Drop columns
    try:
        conn.execute(text("ALTER TABLE area_grouping DROP COLUMN gudang_id"))
    except: pass
    try:
        conn.execute(text("ALTER TABLE photos DROP COLUMN gudang_id"))
    except: pass
    try:
        conn.execute(text("ALTER TABLE stock_calculations DROP COLUMN gudang_id"))
    except: pass
    
    # Drop tables
    try:
        conn.execute(text("DROP TABLE IF EXISTS warehouse_plants"))
    except: pass
    try:
        conn.execute(text("DROP TABLE IF EXISTS warehouses"))
    except: pass
    
    conn.commit()
print("Cleanup done.")
