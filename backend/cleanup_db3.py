from app.core.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    print("Dropping foreign keys...")
    
    # We need to find the actual foreign key names
    for table in ["area_grouping", "photos", "stock_calculations"]:
        try:
            res = conn.execute(text(f"SHOW CREATE TABLE {table}")).fetchone()[1]
            for line in res.split('\n'):
                if 'CONSTRAINT' in line and 'FOREIGN KEY' in line and 'gudang_id' in line:
                    # extract constraint name
                    # CONSTRAINT `area_grouping_ibfk_1` FOREIGN KEY (`gudang_id`) ...
                    fk_name = line.split('`')[1]
                    print(f"Dropping {fk_name} from {table}")
                    conn.execute(text(f"ALTER TABLE {table} DROP FOREIGN KEY {fk_name}"))
        except Exception as e:
            print(f"Error checking/dropping FK for {table}: {e}")

    print("Dropping columns...")
    for table in ["area_grouping", "photos", "stock_calculations"]:
        try:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN gudang_id"))
        except Exception as e:
            print(f"Error dropping col for {table}: {e}")

    print("Dropping tables...")
    try:
        conn.execute(text("DROP TABLE IF EXISTS warehouse_plants"))
    except Exception as e: print(e)
    try:
        conn.execute(text("DROP TABLE IF EXISTS warehouses"))
    except Exception as e: print(e)

    conn.commit()
print("Done.")
