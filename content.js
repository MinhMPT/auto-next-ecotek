/**
 * EcoTek Auto Next Slide - Edge Extension (Manifest V3)
 * Tự động theo dõi bộ đếm ngược canvas trên hoclythuyetlaixe.eco-tek.com.vn
 * Khi về 00:00:00 -> chờ 1 giây -> tự động bấm nút "Trang sau" (#next-slide-button).
 * 
 * ĐẶC BIỆT: Hỗ trợ chạy ngầm 100% khi người dùng chuyển tab hoặc làm việc khác:
 * - Chặn sự kiện visibilitychange (ngăn website phát hiện tab ẩn và dừng đếm).
 * - Giả lập thuộc tính document.visibilityState = 'visible' và document.hidden = false.
 * - Nhịp tim tương tác giả lập (Anti-AFK) để website không hiện popup tạm dừng do không tương tác.
 * - Tính toán thời gian theo mốc thời gian tuyệt đối (Date.now()) chống bóp nhịp timer của trình duyệt.
 */

(() => {
  "use strict";

  // Tránh inject script lặp lại
  if (window.__ecotekAutoNextLoaded) return;
  window.__ecotekAutoNextLoaded = true;

  const LOG_PREFIX = "[EcoTek Auto Next]";
  const NEXT_BUTTON_SELECTOR = "#next-slide-button";
  const COUNTDOWN_WRAPPER_SELECTOR = ".ect_countdown_canvas_wrapper";
  const ENDPOINT_COUNTDOWN_END = "/slide/countdown-end/";

  // Trạng thái chu kỳ
  let currentSlideUrl = location.href;
  let isTriggeredForCurrentCycle = false;
  let isStopped = false;
  let clickTimeoutId = null;
  let lastLoggedSeconds = null;
  let uiBadge = null;

  // Mốc thời gian tuyệt đối (Unix timestamp) khi bài học sẽ kết thúc
  let cycleDeadlineTimestamp = null;

  console.log(
    `%c${LOG_PREFIX} Tiện ích đã khởi chạy với chế độ HỖ TRỢ CHẠY NGẦM HOÀN HẢO!`,
    "color: #2563eb; font-weight: bold; font-size: 13px;"
  );

  // =========================================================================
  // 1. CƠ CHẾ VƯỢT RÀO CHẠY NGẦM (CHỐNG DỪNG ĐẾM KHI SỬ DỤNG MÁY TÍNH LÀM VIỆC KHÁC)
  // =========================================================================
  function setupBackgroundBypass() {
    try {
      // 1. Giả lập luôn ở trạng thái 'visible' và 'hidden = false'
      Object.defineProperty(document, "visibilityState", {
        get: () => "visible",
        configurable: true,
      });

      Object.defineProperty(document, "hidden", {
        get: () => false,
        configurable: true,
      });
    } catch (_e) {}

    // 2. Chặn toàn bộ sự kiện 'visibilitychange' từ gốc (Capture Phase)
    // Ngăn chặn đoạn code của website:
    // `if (document.visibilityState === "hidden") { clearInterval(self.setInterval); self._handleExit(); }`
    const stopVisibilityEvent = (e) => {
      e.stopImmediatePropagation();
    };

    window.addEventListener("visibilitychange", stopVisibilityEvent, true);
    document.addEventListener("visibilitychange", stopVisibilityEvent, true);

    // 3. Nhịp tim giả lập tương tác người dùng (Anti-AFK heartbeat) mỗi 8 giây
    // Website theo dõi ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    // Nếu quá alert_time_no_interaction không tương tác sẽ dừng đếm và hiện #inactivity-popup.
    setInterval(() => {
      try {
        window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }));
      } catch (_e) {}
    }, 8000);

    console.log(
      `${LOG_PREFIX} Đã kích hoạt cơ chế chống tạm dừng khi chuyển tab/ẩn trình duyệt (Bypass Visibility & Anti-AFK).`
    );
  }

  // =========================================================================
  // 2. UI BADGE HIỂN THỊ TRẠNG THÁI TRỰC QUAN TRÊN GIAO DIỆN
  // =========================================================================
  function createOrGetBadge() {
    if (uiBadge && document.body.contains(uiBadge)) return uiBadge;

    uiBadge = document.createElement("div");
    uiBadge.id = "ecotek-auto-next-badge";
    uiBadge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.94);
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 10px;
      user-select: none;
      backdrop-filter: blur(8px);
      transition: all 0.25s ease;
    `;

    uiBadge.innerHTML = `
      <div id="ecotek-badge-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; flex-shrink: 0;"></div>
      <div style="display: flex; flex-direction: column;">
        <span style="font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">EcoTek Auto Next</span>
        <span id="ecotek-badge-status" style="font-weight: 500; color: #e2e8f0;">Đang khởi tạo theo dõi...</span>
      </div>
      <button id="ecotek-badge-toggle" title="Thu nhỏ / Phóng to" style="background: none; border: none; color: #64748b; cursor: pointer; margin-left: 6px; padding: 2px 6px; font-size: 14px; border-radius: 4px;">–</button>
    `;

    document.documentElement.appendChild(uiBadge);

    const toggleBtn = uiBadge.querySelector("#ecotek-badge-toggle");
    let isMinimized = false;
    toggleBtn.addEventListener("click", () => {
      isMinimized = !isMinimized;
      const statusText = uiBadge.querySelector("#ecotek-badge-status");
      const titleText = uiBadge.querySelector("span");
      if (isMinimized) {
        statusText.style.display = "none";
        titleText.style.display = "none";
        toggleBtn.textContent = "+";
        uiBadge.style.padding = "8px 10px";
      } else {
        statusText.style.display = "block";
        titleText.style.display = "block";
        toggleBtn.textContent = "–";
        uiBadge.style.padding = "10px 16px";
      }
    });

    return uiBadge;
  }

  function updateBadge(message, type = "normal") {
    try {
      const badge = createOrGetBadge();
      const statusEl = badge.querySelector("#ecotek-badge-status");
      const dotEl = badge.querySelector("#ecotek-badge-dot");
      if (!statusEl || !dotEl) return;

      statusEl.textContent = message;

      if (type === "warning") {
        dotEl.style.background = "#eab308";
        dotEl.style.boxShadow = "0 0 8px #eab308";
      } else if (type === "success") {
        dotEl.style.background = "#3b82f6";
        dotEl.style.boxShadow = "0 0 8px #3b82f6";
      } else if (type === "danger") {
        dotEl.style.background = "#ef4444";
        dotEl.style.boxShadow = "0 0 8px #ef4444";
      } else {
        dotEl.style.background = "#22c55e";
        dotEl.style.boxShadow = "0 0 8px #22c55e";
      }
    } catch (_e) {}
  }

  // =========================================================================
  // 3. CANVASHHOOK: ĐỌC GIÁ TRỊ ĐẾM NGƯỢC TỪ VẼ CANVAS (HOURS, MINS, SECS)
  // =========================================================================
  function setupCanvasHook() {
    const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!proto || proto.__ecotekCanvasHooked) return;
    proto.__ecotekCanvasHooked = true;

    const originalFillText = proto.fillText;
    proto.fillText = function (text, x, y, maxWidth) {
      try {
        const canvas = this.canvas;
        if (canvas) {
          const wrapper = canvas.closest(COUNTDOWN_WRAPPER_SELECTOR);
          if (wrapper) {
            handleCanvasText(canvas, wrapper, text);
          }
        }
      } catch (_e) {}
      return originalFillText.apply(this, arguments);
    };

    console.log(`${LOG_PREFIX} Đã cài đặt CanvasRenderingContext2D hook để theo dõi bộ đếm.`);
  }

  function handleCanvasText(canvas, wrapper, text) {
    if (isStopped) return;

    const textStr = String(text).trim();

    // Kiểm tra nếu text là số nguyên (giờ, phút hoặc giây)
    if (/^\d+$/.test(textStr)) {
      const num = parseInt(textStr, 10);
      canvas.setAttribute("data-canvas-val", String(num));
      canvas.setAttribute("data-canvas-val-ts", String(Date.now()));

      processCountdownWrapper(wrapper);
    }
  }

  function processCountdownWrapper(wrapper) {
    if (isStopped) return;

    const canvases = Array.from(wrapper.querySelectorAll("canvas"));
    if (canvases.length === 0) return;

    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    let hasAllValues = true;

    if (canvases.length === 3) {
      // 3 canvas chuẩn: [0] = Giờ, [1] = Phút, [2] = Giây
      const hStr = canvases[0].getAttribute("data-canvas-val");
      const mStr = canvases[1].getAttribute("data-canvas-val");
      const sStr = canvases[2].getAttribute("data-canvas-val");

      if (hStr === null || mStr === null || sStr === null) {
        hasAllValues = false;
      } else {
        hours = parseInt(hStr, 10);
        minutes = parseInt(mStr, 10);
        seconds = parseInt(sStr, 10);
      }
    } else if (canvases.length === 2) {
      // 2 canvas: [0] = Phút, [1] = Giây
      const mStr = canvases[0].getAttribute("data-canvas-val");
      const sStr = canvases[1].getAttribute("data-canvas-val");

      if (mStr === null || sStr === null) {
        hasAllValues = false;
      } else {
        minutes = parseInt(mStr, 10);
        seconds = parseInt(sStr, 10);
      }
    } else if (canvases.length === 1) {
      // 1 canvas đơn vị: Giây
      const sStr = canvases[0].getAttribute("data-canvas-val");
      if (sStr === null) hasAllValues = false;
      else seconds = parseInt(sStr, 10);
    }

    if (!hasAllValues) return;

    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // Cập nhật mốc deadline tuyệt đối để đảm bảo độ chính xác ngay cả khi tab ở nền
    if (cycleDeadlineTimestamp === null || Math.abs(Date.now() + totalSeconds * 1000 - cycleDeadlineTimestamp) > 3000) {
      cycleDeadlineTimestamp = Date.now() + totalSeconds * 1000;
    }

    // Chỉ cập nhật DOM attribute khi có sự thay đổi để kích hoạt MutationObserver
    const prevSecondsStr = wrapper.getAttribute("data-countdown-remaining");
    if (prevSecondsStr !== String(totalSeconds)) {
      wrapper.setAttribute("data-countdown-remaining", String(totalSeconds));
      wrapper.setAttribute("data-countdown-formatted", formatted);
    }
  }

  // =========================================================================
  // 4. MUTATION OBSERVER: TỐI ƯU HIỆU NĂNG THEO DÕI THAY ĐỔI DOM
  // =========================================================================
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // A. Thay đổi attribute trên bộ đếm: data-countdown-remaining
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-countdown-remaining"
        ) {
          const targetEl = mutation.target;
          const valStr = targetEl.getAttribute("data-countdown-remaining");
          if (valStr !== null) {
            const remaining = parseInt(valStr, 10);
            const formatted = targetEl.getAttribute("data-countdown-formatted") || `${remaining}s`;
            onCountdownTick(remaining, formatted);
          }
        }

        // B. Thay đổi cấu trúc DOM (chuyển slide mới, thêm popup cảnh báo, ...)
        if (mutation.type === "childList") {
          // 1. Tự động xử lý popup cảnh báo treo máy (#inactivity-popup) nếu xuất hiện
          const resumeBtn = document.querySelector("#resume-activity-button");
          if (resumeBtn) {
            console.log(
              `%c${LOG_PREFIX} ⚡ Phát hiện popup cảnh báo không tương tác! Tự động nhấn nút tiếp tục học...`,
              "color: #f59e0b; font-weight: bold;"
            );
            resumeBtn.click();
          }

          // 2. Phát hiện wrapper đếm ngược mới được nạp vào trang
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (
                node.matches &&
                (node.matches(COUNTDOWN_WRAPPER_SELECTOR) ||
                  node.querySelector(COUNTDOWN_WRAPPER_SELECTOR))
              ) {
                checkNewSlideState();
              }
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-countdown-remaining",
        "data-countdown-formatted",
        "class",
        "disabled",
      ],
    });

    console.log(`${LOG_PREFIX} MutationObserver đã bắt đầu quan sát các thay đổi DOM.`);
  }

  // =========================================================================
  // 5. LOGIC XỬ LÝ ĐẾM NGƯỢC VÀ KÍCH HOẠT SỰ KIỆN CLICK
  // =========================================================================
  function onCountdownTick(remainingSeconds, formattedTime) {
    if (isStopped) return;

    // Log định kỳ qua console để người dùng theo dõi mà không làm ngập log:
    // - Khi còn > 10s: log mỗi 10 giây hoặc khi thay đổi phút
    // - Khi còn <= 10s: log từng giây (10s, 9s, ..., 0s)
    const shouldLog =
      lastLoggedSeconds === null ||
      remainingSeconds <= 10 ||
      Math.abs(lastLoggedSeconds - remainingSeconds) >= 10;

    if (shouldLog) {
      lastLoggedSeconds = remainingSeconds;
      console.log(
        `${LOG_PREFIX} [ĐANG CHỜ] Bộ đếm còn: %c${formattedTime}%c (${remainingSeconds} giây)`,
        "color: #0284c7; font-weight: bold;",
        "color: inherit;"
      );
      updateBadge(`Đang chờ: ${formattedTime} (${remainingSeconds}s)`, "normal");
    }

    // Khi bộ đếm về 0 giờ 0 phút 0 giây (00:00:00)
    if (remainingSeconds === 0) {
      handleCountdownReachedZero();
    }
  }

  function handleCountdownReachedZero() {
    if (isTriggeredForCurrentCycle || isStopped) return;
    isTriggeredForCurrentCycle = true;

    console.log(
      `%c${LOG_PREFIX} ⏰ BỘ ĐẾM ĐÃ VỀ 0 GIỜ 0 PHÚT 0 GIÂY (00:00:00)!`,
      "color: #16a34a; font-weight: bold; font-size: 14px;"
    );
    console.log(
      `${LOG_PREFIX} ⏳ Đang chờ 1 giây theo đúng yêu cầu trước khi tự động bấm nút 'Trang sau'...`
    );

    updateBadge("⏳ Đã về 00:00:00 - Chờ 1 giây để bấm...", "warning");

    clearTimeout(clickTimeoutId);
    clickTimeoutId = setTimeout(() => {
      triggerClickNextSlide();
    }, 1000);
  }

  function triggerClickNextSlide() {
    const nextBtn = document.querySelector(NEXT_BUTTON_SELECTOR);

    // =====================================================================
    // KIỂM TRA ĐIỀU KIỆN DỪNG VÒNG LẶP
    // =====================================================================
    if (!nextBtn) {
      console.warn(
        `%c${LOG_PREFIX} 🛑 ĐIỀU KIỆN DỪNG: Không tìm thấy nút 'Trang sau' (#next-slide-button) trong trang! Có thể đã hoàn thành toàn bộ danh sách bài học.`,
        "color: #dc2626; font-weight: bold; font-size: 13px;"
      );
      updateBadge("🛑 Đã dừng: Không tìm thấy nút Trang sau", "danger");
      isStopped = true;
      return;
    }

    // Kiểm tra nút có bị vô hiệu hóa không (class disabled, attribute disabled, aria-disabled)
    const isDisabled =
      nextBtn.disabled ||
      nextBtn.classList.contains("disabled") ||
      nextBtn.getAttribute("aria-disabled") === "true" ||
      nextBtn.hasAttribute("disabled");

    if (isDisabled) {
      console.warn(
        `%c${LOG_PREFIX} 🛑 ĐIỀU KIỆN DỪNG: Nút 'Trang sau' đang bị vô hiệu hóa (disabled). Vòng lặp tự động dừng lại.`,
        "color: #dc2626; font-weight: bold; font-size: 13px;"
      );
      updateBadge("🛑 Đã dừng: Nút Trang sau bị vô hiệu hóa", "danger");
      isStopped = true;
      return;
    }

    // Kiểm tra đường dẫn href của nút
    const href = nextBtn.getAttribute("href");
    if (!href || href === "#" || href.startsWith("javascript:")) {
      console.warn(
        `%c${LOG_PREFIX} 🛑 ĐIỀU KIỆN DỪNG: Nút 'Trang sau' không có đường dẫn hợp lệ (href='${href}'). Có thể bài học hiện tại là bài học cuối cùng.`,
        "color: #dc2626; font-weight: bold; font-size: 13px;"
      );
      updateBadge("🛑 Đã dừng: Đã tới bài học cuối cùng", "danger");
      isStopped = true;
      return;
    }

    // Kiểm tra thông báo kết thúc khóa học nếu có
    const completionEl = document.querySelector(".o_wslides_course_completed, .alert-success");
    if (completionEl && /hoàn thành|chúc mừng/i.test(completionEl.textContent || "")) {
      console.warn(
        `%c${LOG_PREFIX} 🛑 ĐIỀU KIỆN DỪNG: Phát hiện thông báo hoàn thành khóa học! Dừng vòng lặp.`,
        "color: #dc2626; font-weight: bold; font-size: 13px;"
      );
      updateBadge("🎉 Đã hoàn thành khóa học!", "success");
      isStopped = true;
      return;
    }

    // =====================================================================
    // KÍCH HOẠT SỰ KIỆN CLICK
    // =====================================================================
    console.log(
      `%c${LOG_PREFIX} 👉 ĐÃ QUA 1 GIÂY -> ĐANG TỰ ĐỘNG BẤM NÚT 'Trang sau'...`,
      "color: #2563eb; font-weight: bold; font-size: 13px;"
    );
    console.log(`${LOG_PREFIX} Thông tin nút chuyển:`, {
      id: nextBtn.id,
      href: href,
      label: (nextBtn.textContent || "").trim().replace(/\s+/g, " "),
    });

    updateBadge("🚀 Đã bấm Trang sau! Đang nạp bài tiếp theo...", "success");

    try {
      nextBtn.click();
      console.log(
        `%c${LOG_PREFIX} ✅ ĐÃ CLICK THÀNH CÔNG! Đang chờ chu kỳ đếm ngược mới...`,
        "color: #16a34a; font-weight: bold; font-size: 13px;"
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} ❌ Gặp lỗi khi kích hoạt click:`, error);
    }
  }

  // =========================================================================
  // 6. THEO DÕI CHU KỲ BÀI HỌC MỚI (SPA ROUTING / PAGE REFRESH)
  // =========================================================================
  function checkNewSlideState() {
    if (location.href !== currentSlideUrl) {
      currentSlideUrl = location.href;
      resetForNewCycle("URL thay đổi sang slide mới");
    }
  }

  function resetForNewCycle(reason) {
    console.log(
      `%c${LOG_PREFIX} 🔄 Bắt đầu chu kỳ theo dõi mới (${reason}): ${location.href}`,
      "color: #7c3aed; font-weight: bold;"
    );
    isTriggeredForCurrentCycle = false;
    isStopped = false;
    lastLoggedSeconds = null;
    cycleDeadlineTimestamp = null;
    clearTimeout(clickTimeoutId);
    updateBadge("Đang phát hiện bộ đếm...", "normal");
  }

  // Hook History API để bắt sự kiện chuyển slide dạng Single Page App (SPA)
  const originalPushState = history.pushState;
  history.pushState = function () {
    const res = originalPushState.apply(this, arguments);
    checkNewSlideState();
    return res;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    const res = originalReplaceState.apply(this, arguments);
    checkNewSlideState();
    return res;
  };

  window.addEventListener("popstate", checkNewSlideState);

  // =========================================================================
  // 7. DỰ PHÒNG AN TOÀN KHI CHẠY NỀN & BẮT SỰ KIỆN MẠNG
  // =========================================================================
  function setupNetworkAndDeadlineInterceptors() {
    // 1. Kiểm tra định kỳ theo mốc thời gian tuyệt đối (chống bóp nhịp khi tab chạy ngầm)
    setInterval(() => {
      if (isStopped || isTriggeredForCurrentCycle) return;
      if (cycleDeadlineTimestamp !== null && Date.now() >= cycleDeadlineTimestamp) {
        console.log(
          `%c${LOG_PREFIX} ⏰ Mốc thời gian tuyệt đối (Deadline) đã hết hạn trong lúc chạy ngầm!`,
          "color: #16a34a; font-weight: bold;"
        );
        handleCountdownReachedZero();
      }
    }, 1500);

    // 2. XMLHttpRequest Interceptor
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__reqUrl = typeof url === "string" ? url : String(url);
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      this.addEventListener("load", () => {
        if (
          this.status === 200 &&
          this.__reqUrl &&
          this.__reqUrl.includes(ENDPOINT_COUNTDOWN_END)
        ) {
          console.log(
            `%c${LOG_PREFIX} 📡 Máy chủ xác nhận hoàn thành đếm ngược (/slide/countdown-end/) qua XHR!`,
            "color: #0d9488; font-weight: bold;"
          );
          if (!isTriggeredForCurrentCycle && !isStopped) {
            handleCountdownReachedZero();
          }
        }
      });
      return origSend.apply(this, arguments);
    };

    // 3. Fetch Interceptor
    if (window.fetch) {
      const origFetch = window.fetch;
      window.fetch = async function (...args) {
        const response = await origFetch.apply(this, args);
        try {
          const inputUrl = typeof args[0] === "string" ? args[0] : args[0]?.url;
          if (
            response &&
            response.ok &&
            typeof inputUrl === "string" &&
            inputUrl.includes(ENDPOINT_COUNTDOWN_END)
          ) {
            console.log(
              `%c${LOG_PREFIX} 📡 Máy chủ xác nhận hoàn thành đếm ngược (/slide/countdown-end/) qua Fetch!`,
              "color: #0d9488; font-weight: bold;"
            );
            if (!isTriggeredForCurrentCycle && !isStopped) {
              handleCountdownReachedZero();
            }
          }
        } catch (_e) {}
        return response;
      };
    }
  }

  // =========================================================================
  // 8. KHỞI TẠO TIỆN ÍCH
  // =========================================================================
  function init() {
    setupBackgroundBypass();
    setupCanvasHook();
    setupNetworkAndDeadlineInterceptors();
    setupMutationObserver();

    // Khởi tạo UI khi DOM sẵn sàng
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        createOrGetBadge();
        updateBadge("Đang theo dõi bộ đếm...", "normal");
      });
    } else {
      createOrGetBadge();
      updateBadge("Đang theo dõi bộ đếm...", "normal");
    }

    console.log(
      `%c${LOG_PREFIX} Sẵn sàng! Tiện ích hoạt động trơn tru ngay cả khi bạn làm việc khác hoặc ẩn tab.`,
      "color: #16a34a; font-weight: bold;"
    );
  }

  init();
})();
