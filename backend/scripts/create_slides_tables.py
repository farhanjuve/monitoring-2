"""
Jalankan sekali untuk membuat tabel slide_presets & generated_slides.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine
from app.models.models import Base, SlidePreset, GeneratedSlide  # noqa: F401

def migrate():
    print("Creating tables slide_presets & generated_slides ...")
    Base.metadata.create_all(bind=engine, tables=[
        Base.metadata.tables["slide_presets"],
        Base.metadata.tables["generated_slides"],
    ])
    print("Done.")

if __name__ == "__main__":
    migrate()
