"use strict";

(() => {
  const SERVER_URL = "https://script.google.com/macros/s/AKfycbzzIWdvvh6Q33FOWLtpV8UFXmlWG4-03xY2XbLSRKYYb1FZC03W_rWmK_P-1iIX1o9B/exec";
  const AUTH_KEY = "bdhs_cloud_auth_v3";
  const USERNAME_KEY = "bdhs_cloud_username_v3";
  const REVISION_PREFIX = "bdhs_cloud_revision_v1_";
  const LAST_SYNC_PREFIX = "bdhs_cloud_last_sync_v1_";
  const PRE_PULL_BACKUP_PREFIX = "bdhs_pre_cloud_restore_backup_v1_";
  const BRANCH_CACHE_PREFIX = "bdhs_branch_cache_v1_";
  const ACTIVE_BRANCH_KEY = "bdhs_active_branch_v1";
  const DEVICE_ID_KEY = "bdhs_cloud_device_id_v1";
  const PENDING_PREFIX = "bdhs_cloud_pending_v1_";
  const AUTO_SYNC_DELAY = 5000;

  const DATA_KEYS = Object.freeze([
    "bdhs_revenues_v1",
    "bdhs_purchases_v1",
    "bdhs_purchase_contents_v1",
    "bdhs_settings_v1",
    "bdhs_mtf_orders_v1",
    "bdhs_mtf_products_v1",
    "bdhs_buyer_profile_v1",
    "bdhs_inventories_v2",
    "bdhs_inventory_catalog_v2",
  ]);

  const $ = (selector) => document.querySelector(selector);
  let busy = false;
  let offlineMode = false;
  let autoSyncTimer = null;
  let autoSyncRunning = false;


  function branchCacheKey(branchId) {
    return `${BRANCH_CACHE_PREFIX}${branchId || "UNKNOWN"}`;
  }

  function pendingKey(branchId) {
    return `${PENDING_PREFIX}${branchId || "UNKNOWN"}`;
  }

  function prePullBackupKey(branchId) {
    return `${PRE_PULL_BACKUP_PREFIX}${branchId || "UNKNOWN"}`;
  }

  function snapshotDataKeys() {
    const storage = {};
    for (const key of DATA_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw !== null) storage[key] = raw;
    }
    return storage;
  }

  function clearDataKeys() {
    for (const key of DATA_KEYS) localStorage.removeItem(key);
  }

  function saveBranchCache(branchId) {
    if (!branchId) return;
    writeJson(branchCacheKey(branchId), {
      branchId,
      savedAt: new Date().toISOString(),
      storage: snapshotDataKeys(),
    });
  }

  function restoreBranchCache(branchId) {
    const cache = readJson(branchCacheKey(branchId), null);
    if (!cache?.storage) return false;
    clearDataKeys();
    for (const [key, value] of Object.entries(cache.storage)) {
      if (DATA_KEYS.includes(key)) localStorage.setItem(key, String(value));
    }
    return true;
  }

  function ensureBranchContext(branchId) {
    if (!branchId) return false;
    const current = localStorage.getItem(ACTIVE_BRANCH_KEY);
    if (current === branchId) return false;

    if (current) saveBranchCache(current);

    const hadTargetCache = Boolean(readJson(branchCacheKey(branchId), null)?.storage);
    if (hadTargetCache) {
      restoreBranchCache(branchId);
    } else if (current) {
      clearDataKeys();
    } else {
      // Nâng cấp từ bản cũ: dữ liệu local hiện có được gắn cho tài khoản đang đăng nhập.
      saveBranchCache(branchId);
    }

    localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    return Boolean(current || hadTargetCache);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getAuth() {
    return readJson(AUTH_KEY, null);
  }

  function saveAuth(auth) {
    writeJson(AUTH_KEY, auth);
    if (auth?.username) localStorage.setItem(USERNAME_KEY, auth.username);
    updateSyncUI(auth);
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
    updateSyncUI(null);
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function deviceName() {
    const platform = navigator.userAgentData?.platform || navigator.platform || "Thiết bị";
    return `${platform} • ${getDeviceId().slice(0, 8)}`;
  }

  function revisionKey(branchId) {
    return `${REVISION_PREFIX}${branchId || "UNKNOWN"}`;
  }

  function lastSyncKey(branchId) {
    return `${LAST_SYNC_PREFIX}${branchId || "UNKNOWN"}`;
  }

  function getLocalRevision(branchId) {
    return Math.max(0, Number(localStorage.getItem(revisionKey(branchId))) || 0);
  }

  function setLocalRevision(branchId, revision) {
    localStorage.setItem(revisionKey(branchId), String(Math.max(0, Number(revision) || 0)));
  }

  function setLastSync(branchId, iso) {
    localStorage.setItem(lastSyncKey(branchId), iso || new Date().toISOString());
  }

  function formatTime(iso) {
    if (!iso) return "Chưa đồng bộ";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "Chưa đồng bộ" : date.toLocaleString("vi-VN");
  }

  async function parseResponse(response) {
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Máy chủ trả về nội dung không hợp lệ (${response.status}).`);
    }
    if (!json.ok && !json.conflict) {
      const error = new Error(json.message || json.error || "Máy chủ từ chối yêu cầu.");
      error.code = json.error || "SERVER_ERROR";
      throw error;
    }
    return json;
  }

  async function post(payload) {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return parseResponse(response);
  }

  function setLoginMessage(type, message) {
    const el = $("#authMessage");
    if (!el) return;
    el.className = `auth-message is-${type}`;
    el.textContent = message || "";
  }

  function showLogin() {
    offlineMode = false;
    $("#authGate")?.classList.remove("hidden");
    document.body.classList.add("auth-locked");
    const remembered = localStorage.getItem(USERNAME_KEY) || "";
    if ($("#loginUsername") && !$ ("#loginUsername").value) $("#loginUsername").value = remembered;
    setTimeout(() => $("#loginPassword")?.focus(), 50);
  }

  function hideLogin() {
    $("#authGate")?.classList.add("hidden");
    document.body.classList.remove("auth-locked");
  }

  function showLoginPanel(panel) {
    ["login", "forgot", "reset"].forEach((name) => {
      $("#authPanel" + name[0].toUpperCase() + name.slice(1))?.classList.toggle("hidden", name !== panel);
    });
    setLoginMessage("idle", "");
  }

  function setAuthBusy(value) {
    ["#loginSubmit", "#forgotSend", "#resetSubmit"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = value;
    });
  }

  async function login() {
    const username = String($("#loginUsername")?.value || "").trim().toLowerCase();
    const password = String($("#loginPassword")?.value || "");
    if (!username || !password) throw new Error("Nhập tài khoản và mật khẩu.");

    setAuthBusy(true);
    setLoginMessage("busy", "Đang đăng nhập...");
    try {
      const result = await post({
        action: "login",
        username,
        password,
        deviceId: getDeviceId(),
        deviceName: deviceName(),
      });
      const branchChanged = ensureBranchContext(result.branchId);
      saveAuth({
        username: result.username,
        branchId: result.branchId,
        branchName: result.branchName,
        authToken: result.authToken,
        expiresAt: result.expiresAt,
      });
      $("#loginPassword").value = "";
      if (branchChanged) {
        window.location.reload();
        return;
      }
      hideLogin();
      if (Number(result.revision || 0) === 0) setPendingChanges(true);
      scheduleAutoSync(500);
      setCloudStatus("success", "Đã đăng nhập", `${result.branchName} • Cloud revision ${result.revision || 0}`);
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision || 0);
    } finally {
      setAuthBusy(false);
    }
  }

  async function requestResetCode() {
    const username = String($("#forgotUsername")?.value || "").trim().toLowerCase();
    if (!username) throw new Error("Nhập tài khoản cần khôi phục.");
    setAuthBusy(true);
    setLoginMessage("busy", "Đang gửi mã xác minh...");
    try {
      const result = await post({ action: "forgotPassword", username });
      $("#resetUsername").value = username;
      showLoginPanel("reset");
      setLoginMessage("success", `Đã gửi mã đến ${result.maskedEmail}. Mã có hiệu lực 10 phút.`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword() {
    const username = String($("#resetUsername")?.value || "").trim().toLowerCase();
    const code = String($("#resetCode")?.value || "").trim();
    const newPassword = String($("#resetPassword")?.value || "");
    const confirmPassword = String($("#resetPasswordConfirm")?.value || "");
    if (!username || !code) throw new Error("Thiếu tài khoản hoặc mã xác minh.");
    if (newPassword.length < 8) throw new Error("Mật khẩu mới phải có ít nhất 8 ký tự.");
    if (newPassword !== confirmPassword) throw new Error("Hai mật khẩu mới chưa trùng nhau.");

    setAuthBusy(true);
    setLoginMessage("busy", "Đang đặt lại mật khẩu...");
    try {
      await post({ action: "resetPassword", username, code, newPassword });
      clearAuth();
      showLoginPanel("login");
      $("#loginUsername").value = username;
      setLoginMessage("success", "Đã đổi mật khẩu. Hãy đăng nhập lại.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function validateSession(auth) {
    if (!auth?.authToken) return false;
    if (!navigator.onLine) {
      setCloudStatus("warning", "Đang dùng ngoại tuyến", "Phiên đăng nhập đã được ghi nhớ trên thiết bị.");
      return true;
    }
    try {
      const result = await post({ action: "session", authToken: auth.authToken, deviceId: getDeviceId() });
      const branchChanged = ensureBranchContext(result.branchId);
      saveAuth({ ...auth, branchId: result.branchId, branchName: result.branchName, expiresAt: result.expiresAt });
      if (branchChanged) {
        window.location.reload();
        return true;
      }
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision || 0);
      return true;
    } catch (error) {
      console.warn("Không kiểm tra được phiên đăng nhập:", error);
      if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_FAILED") {
        clearAuth();
        return false;
      }
      setCloudStatus("warning", "Chưa kết nối Cloud", "Ứng dụng vẫn dùng dữ liệu trên thiết bị và sẽ tự thử lại.");
      return true;
    }
  }

  function collectData() {
    const storage = {};
    for (const key of DATA_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw !== null) storage[key] = raw;
    }
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: "2.7-auto-sync-excel",
      storage,
    };
  }

  function validateCloudData(data) {
    if (!data || typeof data !== "object" || !data.storage || typeof data.storage !== "object") {
      throw new Error("Dữ liệu Cloud không đúng cấu trúc BDHS.");
    }
    const recognized = DATA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data.storage, key));
    if (!recognized) throw new Error("Dữ liệu Cloud không chứa dữ liệu BDHS hợp lệ.");
  }

  function createLocalBackup(reason) {
    const backup = { reason, createdAt: new Date().toISOString(), data: collectData() };
    const auth = getAuth();
    writeJson(prePullBackupKey(auth?.branchId), backup);
    return backup;
  }

  function applyCloudData(data) {
    validateCloudData(data);
    for (const key of DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data.storage, key)) {
        localStorage.setItem(key, String(data.storage[key]));
      } else {
        localStorage.removeItem(key);
      }
    }
    const auth = getAuth();
    if (auth?.branchId) saveBranchCache(auth.branchId);
  }

  function requireAuth() {
    const auth = getAuth();
    if (!auth?.authToken) throw new Error("Chưa đăng nhập Cloud.");
    return auth;
  }

  function setCloudStatus(type, title, detail) {
    const box = $("#cloudStatus");
    if (!box) return;
    box.className = `sync-status cloud-status is-${type}`;
    const strong = box.querySelector("strong");
    const small = box.querySelector("small");
    if (strong) strong.textContent = title;
    if (small) small.textContent = detail || "";
  }

  function setBusy(value, message = "Đang xử lý...") {
    busy = value;
    ["#cloudPush", "#cloudPull", "#cloudLogout", "#cloudChangePassword"].forEach((selector) => {
      const button = $(selector);
      if (button) button.disabled = value;
    });
    if (value) setCloudStatus("busy", message, "Không đóng trang trong lúc đồng bộ.");
  }

  function updateSyncUI(auth = getAuth()) {
    const connected = Boolean(auth?.authToken);
    if ($("#cloudAccountName")) $("#cloudAccountName").textContent = connected ? auth.username : "Chưa đăng nhập";
    if ($("#cloudBranchName")) $("#cloudBranchName").textContent = connected ? auth.branchName : "—";
    if ($("#cloudLocalRevision")) $("#cloudLocalRevision").textContent = connected ? String(getLocalRevision(auth.branchId)) : "0";
    if ($("#cloudLastSync")) $("#cloudLastSync").textContent = connected ? formatTime(localStorage.getItem(lastSyncKey(auth.branchId))) : "Chưa đồng bộ";
    ["#cloudPush", "#cloudPull", "#cloudLogout", "#cloudChangePassword"].forEach((selector) => {
      const el = $(selector);
      if (el) el.disabled = !connected;
    });
    if (connected) {
      if (!navigator.onLine) setCloudStatus("warning", "Đang dùng ngoại tuyến", "Dữ liệu vẫn được lưu trên thiết bị.");
      else if (hasPendingChanges()) setCloudStatus("warning", "Chờ đồng bộ", "Ứng dụng sẽ tự gửi dữ liệu lên Cloud.");
      else setCloudStatus("success", "Đã kết nối", auth.branchName);
    }
    else setCloudStatus("idle", "Chưa đăng nhập", "Đăng nhập ở màn hình mở ứng dụng.");
  }

  async function pushData() {
    const auth = requireAuth();
    const baseRevision = getLocalRevision(auth.branchId);
    const payloadData = collectData();
    const size = new Blob([JSON.stringify(payloadData)]).size;
    if (size > 7.5 * 1024 * 1024) throw new Error("Dữ liệu gần vượt giới hạn Cloud 8 MB. Hãy giảm dung lượng hình nền.");

    setBusy(true, "Đang tải dữ liệu lên Cloud...");
    try {
      const result = await post({
        action: "push",
        authToken: auth.authToken,
        deviceId: getDeviceId(),
        deviceName: deviceName(),
        baseRevision,
        force: false,
        data: payloadData,
      });
      if (result.conflict) {
        if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.cloudRevision || "—");
        setCloudStatus("warning", "Cloud có dữ liệu mới hơn", "Hãy tải xuống trước, kiểm tra dữ liệu rồi tải lên lại.");
        return;
      }
      setLocalRevision(auth.branchId, result.revision);
      setLastSync(auth.branchId, result.updatedAt);
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision);
      updateSyncUI(auth);
      setCloudStatus("success", "Đã tải lên Cloud", `Revision ${result.revision} • ${formatTime(result.updatedAt)}`);
    } finally {
      setBusy(false);
    }
  }

  async function pullData() {
    const auth = requireAuth();
    setBusy(true, "Đang tải dữ liệu từ Cloud...");
    try {
      const result = await post({
        action: "pull",
        authToken: auth.authToken,
        deviceId: getDeviceId(),
      });
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision || 0);
      if (result.empty || !result.data) {
        setCloudStatus("warning", "Cloud chưa có dữ liệu", "Hãy dùng thiết bị đang có dữ liệu và bấm Tải lên Cloud trước.");
        return;
      }
      const accepted = window.confirm(`Tải revision ${result.revision} từ Cloud về?\n\nDữ liệu hiện tại sẽ được sao lưu cục bộ rồi thay thế.`);
      if (!accepted) {
        setCloudStatus("idle", "Đã hủy tải xuống", "Dữ liệu trên thiết bị không thay đổi.");
        return;
      }
      createLocalBackup(`Trước khi tải Cloud revision ${result.revision}`);
      applyCloudData(result.data);
      setLocalRevision(auth.branchId, result.revision);
      setLastSync(auth.branchId, result.updatedAt || new Date().toISOString());
      setCloudStatus("success", "Tải xuống thành công", "Ứng dụng sẽ tải lại để áp dụng dữ liệu Cloud.");
      window.setTimeout(() => window.location.reload(), 700);
    } finally {
      setBusy(false);
    }
  }

  function hasPendingChanges() {
    const auth = getAuth();
    const branchId = auth?.branchId || localStorage.getItem(ACTIVE_BRANCH_KEY);
    return localStorage.getItem(pendingKey(branchId)) === "1";
  }

  function setPendingChanges(value) {
    const auth = getAuth();
    const branchId = auth?.branchId || localStorage.getItem(ACTIVE_BRANCH_KEY);
    if (!branchId) return;
    if (value) localStorage.setItem(pendingKey(branchId), "1");
    else localStorage.removeItem(pendingKey(branchId));
  }

  function scheduleAutoSync(delay = AUTO_SYNC_DELAY) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = window.setTimeout(() => runAutoSync("scheduled"), delay);
  }

  async function fetchCloudSnapshot(auth) {
    return post({ action: "pull", authToken: auth.authToken, deviceId: getDeviceId() });
  }

  async function autoPush(auth) {
    const baseRevision = getLocalRevision(auth.branchId);
    const payloadData = collectData();
    const result = await post({
      action: "push",
      authToken: auth.authToken,
      deviceId: getDeviceId(),
      deviceName: deviceName(),
      baseRevision,
      force: false,
      data: payloadData,
    });
    if (result.conflict) {
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.cloudRevision || "—");
      setCloudStatus("warning", "Có dữ liệu mới trên Cloud", "Dữ liệu trên máy vẫn an toàn. Bấm Đồng bộ ngay để kiểm tra.");
      return false;
    }
    setLocalRevision(auth.branchId, result.revision);
    setLastSync(auth.branchId, result.updatedAt || new Date().toISOString());
    setPendingChanges(false);
    if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision || 0);
    updateSyncUI(auth);
    setCloudStatus("success", "Đã đồng bộ", formatTime(result.updatedAt));
    return true;
  }

  async function runAutoSync(reason = "auto") {
    if (autoSyncRunning || busy) return;
    const auth = getAuth();
    if (!auth?.authToken) return;
    if (!navigator.onLine) {
      setCloudStatus("warning", "Đã lưu trên thiết bị", "Sẽ tự đồng bộ khi có Internet.");
      return;
    }
    autoSyncRunning = true;
    try {
      if (hasPendingChanges()) {
        await autoPush(auth);
        return;
      }
      const cloud = await fetchCloudSnapshot(auth);
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(cloud.revision || 0);
      const localRevision = getLocalRevision(auth.branchId);
      if (!cloud.empty && cloud.data && Number(cloud.revision || 0) > localRevision) {
        createLocalBackup(`Tự động nhận Cloud revision ${cloud.revision}`);
        applyCloudData(cloud.data);
        setLocalRevision(auth.branchId, cloud.revision);
        setLastSync(auth.branchId, cloud.updatedAt || new Date().toISOString());
        setCloudStatus("success", "Đã cập nhật dữ liệu mới", "Ứng dụng đang áp dụng dữ liệu Cloud.");
        window.setTimeout(() => window.location.reload(), 400);
        return;
      }
      setLastSync(auth.branchId, new Date().toISOString());
      updateSyncUI(auth);
      setCloudStatus("success", "Dữ liệu đã cập nhật", reason === "manual" ? "Đồng bộ thủ công hoàn tất." : "Cloud và thiết bị đang cùng phiên bản.");
    } catch (error) {
      console.warn("Auto sync chưa hoàn tất:", error);
      if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_FAILED") {
        clearAuth();
        showLogin();
      } else {
        setCloudStatus("warning", "Đã lưu trên thiết bị", "Cloud chưa truy cập được; ứng dụng sẽ tự thử lại khi có mạng.");
      }
    } finally {
      autoSyncRunning = false;
    }
  }

  async function changePassword() {
    const auth = requireAuth();
    const currentPassword = window.prompt("Nhập mật khẩu hiện tại:");
    if (currentPassword === null) return;
    const newPassword = window.prompt("Nhập mật khẩu mới (ít nhất 8 ký tự):");
    if (newPassword === null) return;
    if (newPassword.length < 8) throw new Error("Mật khẩu mới phải có ít nhất 8 ký tự.");
    const confirmPassword = window.prompt("Nhập lại mật khẩu mới:");
    if (confirmPassword !== newPassword) throw new Error("Hai mật khẩu mới chưa trùng nhau.");

    setBusy(true, "Đang đổi mật khẩu...");
    try {
      await post({
        action: "changePassword",
        authToken: auth.authToken,
        currentPassword,
        newPassword,
      });
      clearAuth();
      showLoginPanel("login");
      showLogin();
      setLoginMessage("success", "Đã đổi mật khẩu. Hãy đăng nhập lại.");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    if (!window.confirm("Đăng xuất khỏi chi nhánh này? Dữ liệu riêng của chi nhánh vẫn được giữ trên thiết bị.")) return;
    const auth = getAuth();
    if (auth?.branchId) saveBranchCache(auth.branchId);
    clearDataKeys();
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
    clearAuth();
    window.location.reload();
  }

  async function run(task, loginContext = false) {
    if (busy && !loginContext) return;
    try {
      await task();
    } catch (error) {
      console.error(error);
      if (loginContext) setLoginMessage("error", error.message || "Lỗi không xác định.");
      else {
        if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_FAILED") {
          clearAuth();
          showLogin();
        }
        setCloudStatus("error", "Thao tác thất bại", error.message || "Lỗi không xác định.");
        setBusy(false);
      }
    }
  }

  function bind() {
    $("#loginSubmit")?.addEventListener("click", () => run(login, true));
    $("#loginPassword")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") run(login, true);
    });
    $("#showForgotPassword")?.addEventListener("click", () => {
      $("#forgotUsername").value = $("#loginUsername").value || localStorage.getItem(USERNAME_KEY) || "";
      showLoginPanel("forgot");
    });
    $("#backToLoginFromForgot")?.addEventListener("click", () => showLoginPanel("login"));
    $("#backToLoginFromReset")?.addEventListener("click", () => showLoginPanel("login"));
    $("#forgotSend")?.addEventListener("click", () => run(requestResetCode, true));
    $("#resetSubmit")?.addEventListener("click", () => run(resetPassword, true));
    $("#useOffline")?.addEventListener("click", () => {
      offlineMode = true;
      hideLogin();
    });

    $("#cloudPush")?.addEventListener("click", () => run(pushData));
    $("#cloudPull")?.addEventListener("click", () => run(pullData));
    $("#cloudSyncNow")?.addEventListener("click", () => runAutoSync("manual"));
    $("#cloudLogout")?.addEventListener("click", logout);
    $("#cloudChangePassword")?.addEventListener("click", () => run(changePassword));

    window.addEventListener("bdhs:data-saved", () => {
      const auth = getAuth();
      if (auth?.branchId) saveBranchCache(auth.branchId);
      setPendingChanges(true);
      updateSyncUI();
      scheduleAutoSync();
    });
    window.addEventListener("online", () => scheduleAutoSync(800));
    window.addEventListener("offline", () => updateSyncUI());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && hasPendingChanges()) scheduleAutoSync(100);
    });
    updateSyncUI();
  }

  async function boot() {
    bind();
    const auth = getAuth();
    if (auth?.branchId) ensureBranchContext(auth.branchId);
    if (!auth?.authToken) {
      showLogin();
      return;
    }
    setLoginMessage("busy", "Đang kiểm tra phiên đăng nhập...");
    const valid = await validateSession(auth);
    if (valid) {
      hideLogin();
      scheduleAutoSync(500);
    } else showLogin();
  }

  document.addEventListener("DOMContentLoaded", () => run(boot, true));
  window.BDHSCloudSync = { collectData, createLocalBackup, showLogin, syncNow: () => runAutoSync("manual") };
})();
