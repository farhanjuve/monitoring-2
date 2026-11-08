"""Helper untuk membaca file upload dengan batas ukuran.

Semua endpoint upload harus memakai `read_upload` agar file besar tidak
menghabiskan memori proses. Batas default 25 MB, cukup untuk file MB52/ZSD
bulanan (file 0511 berukuran beberapa MB).
"""

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_CHUNK_SIZE = 1024 * 1024


def _pesan_terlalu_besar(max_bytes: int) -> str:
    return (
        f"Ukuran file melebihi batas {max_bytes // (1024 * 1024)} MB. "
        "Pecah file atau hubungi admin bila memang perlu."
    )


async def read_upload(file: UploadFile, max_bytes: int = MAX_UPLOAD_BYTES) -> bytes:
    """Baca isi file upload sambil menolak file yang terlalu besar.

    Membaca per potongan (bukan sekaligus) supaya file besar tidak langsung
    masuk memori. `UploadFile.size` dipakai lebih dulu bila tersedia.
    """
    size = getattr(file, "size", None)
    if size is not None and size > max_bytes:
        raise HTTPException(status_code=413, detail=_pesan_terlalu_besar(max_bytes))

    buf = bytearray()
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(status_code=413, detail=_pesan_terlalu_besar(max_bytes))
    return bytes(buf)
