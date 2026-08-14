import sys
from datetime import date

# Add backend directory to path
sys.path.append("c:\\Users\\achmad.farhan\\Documents\\monitoring-2\\backend")

from app.core.database import SessionLocal
from app.models.models import SAPStock, SAPOutstandingDO, StockCalculation
from app.services.stock_calculator import recalculate_all_for_date

def restore_data():
    db = SessionLocal()
    try:
        # Get all distinct dates in SAPStock and SAPOutstandingDO
        mb52_dates = {r[0] for r in db.query(SAPStock.tanggal).distinct().all()}
        do_dates = {r[0] for r in db.query(SAPOutstandingDO.tanggal).distinct().all()}
        all_sap_dates = sorted(list(mb52_dates.union(do_dates)))
        
        missing_dates = []
        for d in all_sap_dates:
            calc_cnt = db.query(StockCalculation).filter(StockCalculation.tanggal == d).count()
            if calc_cnt == 0:
                missing_dates.append(d)
                
        print(f"Found {len(missing_dates)} dates with SAP data but 0 StockCalculation records: {missing_dates}")
        
        if not missing_dates:
            print("No missing calculations found!")
            return
            
        for i, d in enumerate(missing_dates, 1):
            print(f"[{i}/{len(missing_dates)}] Recalculating all for date {d.isoformat()}...")
            results = recalculate_all_for_date(db, d)
            print(f"   -> Generated {len(results)} calculations.")
            
        print("Restoration complete!")
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    restore_data()