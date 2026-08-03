(() => {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Không tự reload giữa lúc nhập liệu. Bản mới sẽ áp dụng ở lần mở/tải lại kế tiếp.
    console.info("BDHS: phiên bản PWA mới đã sẵn sàng.");
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      await registration.update().catch(() => {});
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch (error) {
      console.warn("Không đăng ký được chế độ PWA:", error);
    }
  });
})();
