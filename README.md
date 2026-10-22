# EcoTek Auto Next Slide - Edge Extension (Manifest V3)

Tiện ích mở rộng dành cho Microsoft Edge (Manifest V3) giúp tự động hóa quá trình học lý thuyết lái xe trên hệ thống **EcoTek** (`https://hoclythuyetlaixe.eco-tek.com.vn/`).

---

## 🌟 TÍNH NĂNG CHẠY NGẦM HOÀN HẢO (MULTITASKING)

Khi bạn chuyển sang tab khác, thu nhỏ trình duyệt, hoặc làm các công việc khác (như soạn thảo Word, Excel, xem phim, chơi game...), website học thường có các cơ chế chống gian lận:
1. **Phát hiện chuyển tab (`visibilitychange`):** Website tự động tạm dừng đồng hồ đếm ngược và ngắt kết nối điểm danh (`_handleExit`).
2. **Cảnh báo không tương tác (`#inactivity-popup`):** Nếu không rê chuột hay gõ phím sau vài phút, website sẽ đóng băng buổi học và yêu cầu bấm xác nhận.
3. **Trình duyệt bóp hiệu năng (Timer Throttling):** Chromium giảm tần suất chạy code của các tab đang ẩn.

**Tiện ích này đã được tích hợp đầy đủ các giải pháp để giải quyết triệt để 100%:**
- 🛡️ **Vượt rào phát hiện tab ẩn:** Ghi đè `document.visibilityState = 'visible'` và chặn sự kiện `visibilitychange` ở Capture Phase, khiến website tin rằng bạn luôn mở và nhìn màn hình học 24/7.
- 💓 **Nhịp tim tương tác giả lập (Anti-AFK):** Tự động phát sự kiện tương tác chuột mỗi 8 giây để hệ thống không bao giờ kích hoạt popup cảnh báo treo máy.
- ⏱️ **Tính toán theo mốc thời gian tuyệt đối (Deadline):** Tính thời điểm kết thúc bằng `Date.now()`, đảm bảo đúng thời gian thực tế bất kể trình duyệt có làm chậm `setInterval`.
- 📡 **Bắt sự kiện mạng dự phòng:** Lắng nghe API kết thúc bài học `/slide/countdown-end/` qua `fetch` và `XMLHttpRequest`.

---

## 📌 Hướng dẫn tối ưu Microsoft Edge để chạy nền trơn tru

Để trình duyệt Edge không tự động "đóng băng" (Sleep) tab học nhằm tiết kiệm RAM, bạn nên thêm trang học vào danh sách loại trừ:

1. Mở **Microsoft Edge**, vào thanh địa chỉ:
   ```
   edge://settings/system
   ```
2. Tìm mục **Tối ưu hóa hiệu suất** (Performance / Sleeping tabs).
3. Tại dòng **Không bao giờ đưa các trang web này vào chế độ ngủ** (*Never put these sites to sleep*), nhấn nút **Thêm** (*Add*).
4. Nhập đường dẫn:
   ```
   https://hoclythuyetlaixe.eco-tek.com.vn
   ```
   *(hoặc bấm Thêm cả `https://daotaoltx.eco-tek.com.vn` nếu có học trên hệ thống này)*.

> **Mẹo hữu ích:** Bạn có thể kéo tab học ra thành một cửa sổ Edge riêng biệt và để nó ở chế độ nền (hoặc thu nhỏ một nửa góc màn hình).

---

## 🚀 Hướng dẫn cài đặt vào Microsoft Edge

1. Mở trình duyệt **Microsoft Edge**.
2. Nhập vào thanh địa chỉ: `edge://extensions/` và nhấn **Enter**.
3. Bật công tắc **Chế độ dành cho nhà phát triển** (*Developer Mode*) ở menu bên trái.
4. Bấm nút **Tải phần mở rộng đã giải nén** (*Load unpacked / Load packed*).
5. Trỏ tới thư mục chứa mã nguồn:
   ```
   Ví dụ: D:\auto-next-ecotek hoặc D:\auto-next-ecotek.zip
   ```
6. Bấm **Select Folder** (Chọn thư mục). Tiện ích **EcoTek Auto Next Slide** sẽ xuất hiện trong danh sách.
7. Tải lại trang bài học (`F5`) để tiện ích bắt đầu hoạt động.
