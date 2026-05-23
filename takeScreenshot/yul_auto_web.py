"""
yul_auto.py  —  versi final (terintegrasi penuh)
=================================================
Cara run:
  1. Taruh file ini + cctv_picker.py + config.ini di satu folder
  2. Pastikan template_XX.xlsx, gudang_XX.txt, kode_XX.txt ada di folder yang sama
  3. Edit config.ini sesuai kebutuhan
  4. Buka CMD di folder tersebut, jalankan: python yul_auto.py

Fitur:
  - GUI tombol Pause/Resume (muncul otomatis, always on top)
  - Baca konfigurasi dari config.ini (tidak ada input manual)
  - Auto-detect tablet via ADB
  - Pilih 2 feed CCTV terbaik otomatis via cctv_picker.py
  - Simpan screenshot ke kolom E (feed terbaik) dan F (feed kedua)
  - Checkpoint setiap 5 gudang
  - Estimasi waktu selesai (ETA) real-time
"""

import subprocess
import time
import os
import re
import tkinter as tk
import threading
import configparser
from datetime import datetime, timedelta
from openpyxl import load_workbook
from openpyxl.drawing.image import Image
from PIL import Image as PILImage, ImageFile

from cctv_picker import pick_best_feeds   # ← modul deteksi feed terbaik

# ================================================================
# KONFIGURASI — sesuaikan path ADB jika berbeda
# ================================================================
ADB_EXE     = r"C:\Users\achmad.farhan\Downloads\scrcpy-win64-v3.3.3\adb.exe"
CONFIG_FILE = "config.ini"

# Koordinat tap di layar tablet (piksel)
FIRST_RESULT  = "300 300"    # tap hasil pencarian pertama
CLEAR_SEARCH  = "1380 110"   # tombol hapus teks di search bar
BACK_BUTTON   = "50 120"     # tombol back
LAYOUT_BUTTON = "1120 1100"  # tombol ganti layout kamera
SINGLE_CAM    = "800 1880"   # opsi single-camera view
NINE_CAM    = "800 2080"   # opsi 9-camera view

# Timing (detik)
SLEEP_SHORT        = 1
SLEEP_AFTER_TYPING = 4
SLEEP_UI           = 2.5
SLEEP_STREAM       = 10    # tunggu stream terbuka setelah tap feed
# ================================================================


# ----------------------------------------------------------------
# GUI PAUSE / RESUME
# ----------------------------------------------------------------
is_paused  = False
status_label = btn_pause = info_label = None


def toggle_pause():
    global is_paused
    is_paused = not is_paused
    if is_paused:
        status_label.config(text="⏸ PAUSED", fg="#FF6B6B")
        btn_pause.config(text="▶  Resume", bg="#4CAF50", activebackground="#45a049")
        print("\n" + "!"*20)
        print("[PAUSED] Script berhenti. Klik Resume untuk lanjut.")
        print("!"*20 + "\n")
    else:
        status_label.config(text="▶ RUNNING", fg="#69DB7C")
        btn_pause.config(text="⏸  Pause", bg="#E67E22", activebackground="#d35400")
        print("\n" + ">"*20)
        print("[RESUMED] Melanjutkan otomasi...")
        print(">"*20 + "\n")


def update_info(text):
    if info_label:
        info_label.config(text=text)


def launch_gui():
    global status_label, btn_pause, info_label
    root = tk.Tk()
    root.title("Kontrol Script")
    root.geometry("260x160")
    root.resizable(False, False)
    root.attributes("-topmost", True)
    root.configure(bg="#1E1E2E")

    tk.Label(root, text="🤖  Automation Control",
             bg="#1E1E2E", fg="#CDD6F4",
             font=("Consolas", 11, "bold")).pack(pady=(14, 4))

    status_label = tk.Label(root, text="▶ RUNNING",
                             bg="#1E1E2E", fg="#69DB7C",
                             font=("Consolas", 10))
    status_label.pack()

    info_label = tk.Label(root, text="Menunggu proses...",
                           bg="#1E1E2E", fg="#888BA8",
                           font=("Consolas", 8), wraplength=240)
    info_label.pack(pady=2)

    btn_pause = tk.Button(root, text="⏸  Pause",
                           command=toggle_pause,
                           bg="#E67E22", fg="white",
                           font=("Consolas", 10, "bold"),
                           relief="flat", cursor="hand2",
                           activebackground="#d35400", activeforeground="white",
                           padx=20, pady=6)
    btn_pause.pack(pady=8)
    root.mainloop()


def check_pause():
    """Tahan eksekusi selama status paused."""
    while is_paused:
        time.sleep(0.5)


# ----------------------------------------------------------------
# BACA CONFIG.INI
# ----------------------------------------------------------------
def load_config():
    cfg = configparser.ConfigParser()

    if not os.path.exists(CONFIG_FILE):
        cfg["SETTINGS"] = {"laporan": "1", "device_id": ""}
        with open(CONFIG_FILE, "w") as f:
            cfg.write(f)
        print(f"[CONFIG] File '{CONFIG_FILE}' dibuat otomatis.")
        print("[CONFIG] Edit file tersebut lalu jalankan ulang script ini.")
        exit()

    cfg.read(CONFIG_FILE, encoding="utf-8")
    laporan   = cfg.get("SETTINGS", "laporan",   fallback="1").strip()
    device_id = cfg.get("SETTINGS", "device_id", fallback="").strip()
    return laporan, device_id


# ----------------------------------------------------------------
# ADB HELPERS
# ----------------------------------------------------------------
def get_adb_devices():
    result = subprocess.run(f'"{ADB_EXE}" devices',
                            shell=True, capture_output=True, text=True)
    lines = result.stdout.strip().split('\n')[1:]
    return [line.split('\t')[0] for line in lines if "device" in line]


def resolve_device(device_id_cfg):
    devices = get_adb_devices()
    if not devices:
        print("[ERROR] Tidak ada perangkat ADB terdeteksi.")
        print("[ERROR] Pastikan tablet konek via USB dan ADB diaktifkan.")
        exit()

    if device_id_cfg and device_id_cfg in devices:
        print(f"[ADB] Device dari config : {device_id_cfg}")
        return f'"{ADB_EXE}" -s {device_id_cfg}'

    if device_id_cfg:
        print(f"[WARNING] Device '{device_id_cfg}' tidak ditemukan. Pakai auto-detect.")

    print(f"[ADB] Auto-detect device  : {devices[0]}")
    return f'"{ADB_EXE}" -s {devices[0]}'


def resolve_profile(rep_choice):
    today = datetime.now()
    tanggal = today.strftime("%d%m")

    profiles = {
        '1': {"template": "template_39.xlsx",  "gudang": "gudang_39.txt",
              "kode": "kode_39.txt",  "out": f"Laporan_39_Final_{tanggal}.xlsx"},
        '2': {"template": "template_149.xlsx", "gudang": "gudang_149.txt",
              "kode": "kode_149.txt", "out": f"Laporan_149_Final_{tanggal}.xlsx"},
        '3': {"template": "template_301.xlsx", "gudang": "gudang_301.txt",
              "kode": "kode_301.txt", "out": f"Laporan_301_Final_{tanggal}.xlsx"},
        '4': {"template": "template_50.xlsx",  "gudang": "gudang_50.txt",
              "kode": "kode_50.txt",  "out": f"Laporan_50Gudang_{tanggal}.xlsx"},
        '5': {"template": "template_80.xlsx",  "gudang": "gudang_80.txt",
              "kode": "kode_80.txt",  "out": f"Laporan_80Gudang_{tanggal}.xlsx"},
        '6': {"template": "template_70.xlsx",  "gudang": "gudang_70.txt",
              "kode": "kode_70.txt",  "out": f"Laporan_70Gudang_{tanggal}.xlsx"}
    }
    
    profile = profiles.get(rep_choice)
    
    if not profile:
        print(f"[ERROR] Pilihan laporan '{rep_choice}' tidak valid (isi 1–6 di config.ini).")
        exit()
        
    return profile


# ----------------------------------------------------------------
# HELPER: DOUBLE TAP
# ----------------------------------------------------------------
def double_tap(adb_path, x, y, delay=0.08):
    """Double tap pada koordinat (x, y) — membuka feed dari grid."""
    subprocess.run(f'{adb_path} shell input tap {x} {y}', shell=True)
    time.sleep(delay)
    subprocess.run(f'{adb_path} shell input tap {x} {y}', shell=True)


# ----------------------------------------------------------------
# HELPER: AMBIL SCREENSHOT DARI TABLET
# ----------------------------------------------------------------
def take_screenshot(adb_path, local_path):
    subprocess.run(f'{adb_path} shell screencap -p /sdcard/s.png',
                   shell=True, capture_output=True)
    subprocess.run(f'{adb_path} pull /sdcard/s.png "{local_path}"',
                   shell=True, capture_output=True)
    subprocess.run(f'{adb_path} shell rm /sdcard/s.png',
                   shell=True, capture_output=True)


# ----------------------------------------------------------------
# HELPER: CROP & SISIPKAN GAMBAR KE EXCEL
# ----------------------------------------------------------------
def insert_to_excel(ws, local_raw, local_final, excel_cell, row_idx,
                    set_row_height=False):
    """
    Crop screenshot, simpan versi final, sisipkan ke sel Excel.
    Hapus file raw setelah selesai.
    Kembalikan True jika berhasil.
    """
    try:
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        if not os.path.exists(local_raw):
            print(f"   [!] File tidak ditemukan: {local_raw}")
            return False

        with PILImage.open(local_raw) as img:
            w, h = img.size
            img.crop((0, 160, w, min(1055, h))).save(local_final)

        img_ex        = Image(local_final)
        img_ex.width  = 225
        img_ex.height = (925 / w) * 225
        ws.add_image(img_ex, excel_cell)

        if set_row_height:
            ws.row_dimensions[row_idx].height = 145

        os.remove(local_raw)
        return True

    except Exception as e:
        print(f"   [!] Error insert gambar ke {excel_cell}: {e}")
        return False


# ----------------------------------------------------------------
# MAIN AUTOMATION
# ----------------------------------------------------------------
def run_automation():
    laporan_choice, device_id_cfg = load_config()
    adb_path = resolve_device(device_id_cfg)
    config   = resolve_profile(laporan_choice)

    print(f"[INFO] Laporan : {config['out']}")
    print(f"[INFO] ADB     : {adb_path}")

    output_dir = "screenshots"
    os.makedirs(output_dir, exist_ok=True)

    wb = load_workbook(config["template"])
    ws = wb.active

    with open(config["gudang"], "r", encoding="utf-8") as f:
        daftar_nama = [l.strip() for l in f if l.strip()]
    with open(config["kode"], "r", encoding="utf-8") as f:
        daftar_kode = [l.strip() for l in f if l.strip()]

    total          = min(len(daftar_nama), len(daftar_kode))
    start_time_all = time.time()

    print(f"\n[START] Dimulai: {datetime.now().strftime('%H:%M:%S')}")
    print(f"[INFO]  Total gudang: {total}")
    print("[INFO]  Gunakan tombol GUI untuk PAUSE/RESUME.\n")

    for i, (nama, kode_raw) in enumerate(zip(daftar_nama, daftar_kode), 1):

        check_pause()
        current_row = 6 + i - 1
        
        # --- PARSING WHITELIST (Contoh: E332_1;6) ---
        whitelist_indices = None
        kode_gudang = kode_raw.strip()
        if "_" in kode_raw:
            parts = kode_raw.split("_")
            kode_gudang = parts[0]
            # Ambil bagian setelah underscore terakhir jika ada format bertumpuk
            raw_indices = parts[-1] 
            if ";" in raw_indices or raw_indices.isdigit():
                try:
                    whitelist_indices = [int(x) for x in raw_indices.split(";")]
                    print(f"   [WHITELIST] Mengunci sel: {whitelist_indices}")
                except:
                    whitelist_indices = None
        kode_safe = re.sub(r'[^a-zA-Z0-9]', '_', kode_raw).strip('_')
        #kode_safe   = re.sub(r'[^a-zA-Z0-9]', '_', kode_raw).strip('_')

        print(f"\n>>> [{i}/{total}] GUDANG: {kode_safe}")
        update_info(f"[{i}/{total}] {kode_safe}")

        # ── CARI GUDANG ──────────────────────────────────────────
        check_pause()
        print("   [STEP] Bersihkan pencarian...")
        subprocess.run(f'{adb_path} shell input tap {CLEAR_SEARCH}', shell=True)
        time.sleep(SLEEP_SHORT)

        check_pause()
        print(f"   [STEP] Ketik nama: {nama}")
        subprocess.run(
            f'{adb_path} shell input text {nama.replace(" ", "%s")}', shell=True)
        time.sleep(SLEEP_AFTER_TYPING)

        check_pause()
        print("   [STEP] Tutup keyboard...")
        subprocess.run(f'{adb_path} shell input keyevent 111', shell=True)
        time.sleep(SLEEP_UI)

        check_pause()
        print("   [STEP] Buka stream gudang...")
        subprocess.run(f'{adb_path} shell input tap {FIRST_RESULT}', shell=True)
        time.sleep(SLEEP_STREAM)

        # ── SCREENSHOT GRID 3x3 UNTUK ANALISIS ──────────────────
        check_pause()
        print("   [STEP] Screenshot grid untuk deteksi 2 feed terbaik...")
        grid_raw = os.path.join(output_dir, f"{kode_safe}_grid.png")
        take_screenshot(adb_path, grid_raw)
        time.sleep(SLEEP_SHORT)

        # ── PILIH 2 FEED TERBAIK ─────────────────────────────────
        try:
            top2 = pick_best_feeds(grid_raw, top_n=2, whitelist=whitelist_indices)
        except Exception as e:
            print(f"   [!] Error: {e}")
        # try:
            # top2 = pick_best_feeds(grid_raw, top_n=2)
        # except Exception as e:
            # print(f"   [!] Picker error: {e}. Fallback ke cell tengah & kanan.")
            # # Fallback hardcode: cell (1,1) dan (1,2) — posisi tengah grid
            # top2 = [
                # {"rank": 1, "tap_x": 540, "tap_y": 640},
                # {"rank": 2, "tap_x": 900, "tap_y": 640},
            # ]

        if os.path.exists(grid_raw):
            os.remove(grid_raw)

        # ── LOOP 2 FEED: TAP → SCREENSHOT → EXCEL ───────────────
        excel_cols = {1: "E", 2: "F"}

        for feed in top2:
            rank     = feed["rank"]
            col_name = excel_cols[rank]

            check_pause()
            print(f"   [STEP] Double tap feed #{rank} → kolom {col_name}...")
            double_tap(adb_path, feed["tap_x"], feed["tap_y"])
            time.sleep(SLEEP_UI)

            # Switch ke single-camera view
            check_pause()
            subprocess.run(
                f'{adb_path} shell input tap {LAYOUT_BUTTON}', shell=True)
            time.sleep(SLEEP_UI)
            subprocess.run(
                f'{adb_path} shell input tap {SINGLE_CAM}', shell=True)
            time.sleep(SLEEP_AFTER_TYPING)

            # Ambil screenshot
            check_pause()
            raw_path   = os.path.join(output_dir, f"{kode_safe}_feed{rank}_raw.png")
            
            # Format penamaan file baru: [KodePlant]_[FeedKamera]_[Tanggal].png
            tanggal_str = datetime.now().strftime("%Y-%m-%d")
            final_filename = f"{kode_gudang}_{rank}_{tanggal_str}.png"
            final_path = os.path.join(output_dir, final_filename)
            
            take_screenshot(adb_path, raw_path)

            # Crop & sisipkan ke Excel
            ok = insert_to_excel(
                ws, raw_path, final_path,
                excel_cell=f"{col_name}{current_row}",
                row_idx=current_row,
                set_row_height=(col_name == "E"),   # tinggi baris diset di feed #1
            )
            if ok:
                print(f"   [OK] Feed #{rank} → {col_name}{current_row}")

            # Kembali ke grid sebelum memilih feed berikutnya
            if rank < len(top2):
                check_pause()
                print("   [STEP] Kembali ke grid...")
                subprocess.run(
                    f'{adb_path} shell input tap {LAYOUT_BUTTON}', shell=True)
                time.sleep(SLEEP_UI)
                subprocess.run(
                    f'{adb_path} shell input tap {NINE_CAM}', shell=True)
                time.sleep(SLEEP_UI)

        # ── KEMBALI KE MENU UTAMA ────────────────────────────────
        check_pause()
        print("   [STEP] Kembali ke menu utama...")
        subprocess.run(f'{adb_path} shell input tap {BACK_BUTTON}', shell=True)
        time.sleep(SLEEP_UI)

        # ── ETA ──────────────────────────────────────────────────
        elapsed = time.time() - start_time_all
        avg     = elapsed / i
        eta     = datetime.now() + timedelta(seconds=avg * (total - i))
        eta_str = f"ETA: {eta.strftime('%H:%M:%S')} ({int((avg*(total-i))//60)} mnt lagi)"
        print(f"   [{eta_str}]")
        update_info(f"[{i}/{total}] {kode_safe}\n{eta_str}")

        # Checkpoint tiap 5 gudang
        if i % 5 == 0:
            wb.save("Checkpoint.xlsx")
            print("   [SAVE] Checkpoint.xlsx disimpan.")

    # ── SELESAI ──────────────────────────────────────────────────
    wb.save(config["out"])
    update_info(f"✅ Selesai! → {config['out']}")
    print(f"\n{'='*50}")
    print(f"PROSES SELESAI!  File: {config['out']}")
    print(f"{'='*50}")


# ----------------------------------------------------------------
if __name__ == "__main__":
    # Jalankan GUI di thread daemon
    gui_thread = threading.Thread(target=launch_gui, daemon=True)
    gui_thread.start()
    time.sleep(0.6)   # beri GUI waktu muncul sebelum automation mulai

    run_automation()