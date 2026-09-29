"""
Jalankan sekali untuk membuat tabel indigo_reports & indigo_do_records.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine
from app.models.models import Base, IndigoReport, IndigoDO  # noqa: F401

def migrate():
    print("Creating tables indigo_reports & indigo_do_records ...")
    Base.metadata.create_all(bind=engine, tables=[
        Base.metadata.tables["indigo_reports"],
        Base.metadata.tables["indigo_do_records"],
    ])
    print("Done.")

if __name__ == "__main__":
    migrate()