import cv2
import numpy as np

def validate_cctv_image(image_path):
    # 1. Baca gambar dalam mode Grayscale
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return False, "File gambar rusak / tidak dapat dibaca"

    # 2. Hitung Standar Deviasi (Mengukur keragaman tingkat kecerahan piksel)
    std_dev = np.std(img)

    # 3. Hitung Laplacian Variance (Mengukur kerapatan detail/tepi/tekstur)
    laplacian_var = cv2.Laplacian(img, cv2.CV_64F).var()

    # --- AMBANG BATAS (THRESHOLD) ---
    STD_DEV_THRESHOLD = 38.0       # Batas minimum variasi piksel (dinaikkan dari 30)
    LAPLACIAN_THRESHOLD = 45.0     # Batas minimum tekstur/detail tepi (dinaikkan dari 40)

    # Evaluasi logika menggunakan 'or'
    if std_dev < STD_DEV_THRESHOLD or laplacian_var < LAPLACIAN_THRESHOLD:
        return False, f"Ditolak: Gambar terdeteksi blank/offline (StdDev: {std_dev:.2f}, Laplacian: {laplacian_var:.2f})"

    return True, f"Diterima: Gambar CCTV valid (StdDev: {std_dev:.2f}, Laplacian: {laplacian_var:.2f})"


# --- PENGUJIAN ---
# print(validate_cctv_image("GPP_Bondowoso_f2.jpg"))  # Hasil: False (Ditolak)
# print(validate_cctv_image("Sumberejo_f2.jpg"))       # Hasil: False (Ditolak)
# print(validate_cctv_image("Sumberejo_f1.jpg"))       # Hasil: True (Diterima)