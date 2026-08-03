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
  const TOMBSTONES_KEY = "bdhs_sync_tombstones_v1";
  const KEY_META_KEY = "bdhs_sync_key_meta_v1";
  const AUTO_SYNC_DELAY = 350;
  const REQUEST_TIMEOUT = 15000;
  const CLOUD_POLL_INTERVAL = 2000;
  const LOGIN_SYNC_GRACE = 3000;
  const REQUEST_RETRY_DELAYS = Object.freeze([0, 1500, 4000]);
  const SYNC_RETRY_DELAYS = Object.freeze([1000, 3000, 10000, 30000]);

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
    TOMBSTONES_KEY,
    KEY_META_KEY,
  ]);

  const $ = (selector) => document.querySelector(selector);
  let busy = false;
  let autoSyncTimer = null;
  let autoSyncRunning = false;
  let pollTimer = null;
  let retryTimer = null;
  let syncFailureCount = 0;
  let syncPausedUntil = 0;
  let syncQueued = false;
  let localChangeVersion = 0;
  let burstCheckTimers = [];


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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function normalizeRequestError(error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Máy chủ phản hồi quá chậm (quá ${Math.round(REQUEST_TIMEOUT / 1000)} giây).`);
      timeoutError.code = "REQUEST_TIMEOUT";
      return timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error("Không kết nối được máy chủ Cloud. Dữ liệu vẫn được giữ trên thiết bị.");
      networkError.code = "NETWORK_ERROR";
      return networkError;
    }
    return error;
  }

  function shouldRetryRequest(error) {
    if (!error) return false;
    if (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT") return true;
    return /^HTTP_(429|5\d\d)$/.test(String(error.code || ""));
  }

  async function post(payload, options = {}) {
    const action = String(payload?.action || "");
    const retries = Number.isInteger(options.retries)
      ? Math.max(0, options.retries)
      : action === "push"
        ? 0
        : 1;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await sleep(REQUEST_RETRY_DELAYS[Math.min(attempt, REQUEST_RETRY_DELAYS.length - 1)]);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT)
        : null;
      try {
        const response = await fetch(SERVER_URL, {
          method: "POST",
          redirect: "follow",
          cache: "no-store",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
          ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response.ok) {
          const httpError = new Error(
            response.status === 404
              ? "Không tìm thấy máy chủ Cloud (HTTP 404). Hãy kiểm tra lại URL Apps Script."
              : `Máy chủ Cloud trả về lỗi HTTP ${response.status}.`,
          );
          httpError.code = `HTTP_${response.status}`;
          throw httpError;
        }
        return await parseResponse(response);
      } catch (rawError) {
        const error = normalizeRequestError(rawError);
        lastError = error;
        if (attempt >= retries || !shouldRetryRequest(error)) throw error;
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    }
    throw lastError || new Error("Không thể kết nối Cloud.");
  }

  function setLoginMessage(type, message) {
    const el = $("#authMessage");
    if (!el) return;
    el.className = `auth-message is-${type}`;
    el.textContent = message || "";
  }

  function showLogin() {
    $("#authGate")?.classList.remove("hidden");
    document.body.classList.add("auth-locked");
    const remembered = localStorage.getItem(USERNAME_KEY) || "";
    if ($("#loginUsername") && !$("#loginUsername").value) $("#loginUsername").value = remembered;
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
      syncPausedUntil = Date.now() + LOGIN_SYNC_GRACE;
      scheduleAutoSync(LOGIN_SYNC_GRACE);
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
      appVersion: "3.3.5-fast-safe-sync",
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
    setBusy(true, "Đang hợp nhất và tải dữ liệu lên Cloud...");
    try {
      const outcome = await pushWithConflictMerge(auth, "manual");
      finishSuccessfulPush(auth, outcome, "Đã đồng bộ Cloud");
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

  function clearSyncRetry() {
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = null;
    syncFailureCount = 0;
  }

  function scheduleSyncRetry() {
    if (!navigator.onLine || !getAuth()?.authToken) return;
    if (retryTimer) window.clearTimeout(retryTimer);
    const index = Math.min(Math.max(0, syncFailureCount - 1), SYNC_RETRY_DELAYS.length - 1);
    const delay = SYNC_RETRY_DELAYS[index];
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      runAutoSync("retry");
    }, delay);
  }

  function markSyncSuccess() {
    clearSyncRetry();
  }

  function scheduleAutoSync(delay = AUTO_SYNC_DELAY) {
    if (autoSyncRunning || busy) {
      syncQueued = true;
      return;
    }
    clearTimeout(autoSyncTimer);
    const graceRemaining = Math.max(0, syncPausedUntil - Date.now());
    autoSyncTimer = window.setTimeout(
      () => runAutoSync("scheduled"),
      Math.max(delay, graceRemaining),
    );
  }

  function clearBurstChecks() {
    for (const timer of burstCheckTimers) window.clearTimeout(timer);
    burstCheckTimers = [];
  }

  function scheduleBurstChecks(delays = [800, 2000, 5000]) {
    clearBurstChecks();
    for (const delay of delays) {
      const timer = window.setTimeout(() => {
        if (
          document.visibilityState === "visible" &&
          navigator.onLine &&
          getAuth()?.authToken
        ) {
          runAutoSync("burst-check");
        }
      }, delay);
      burstCheckTimers.push(timer);
    }
  }

  function startCloudPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    const poll = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine &&
        getAuth()?.authToken &&
        !busy &&
        !autoSyncRunning
      ) {
        runAutoSync("poll");
      }
    };
    pollTimer = window.setInterval(poll, CLOUD_POLL_INTERVAL);
    window.setTimeout(poll, 800);
  }

  function cloudStorageMatchesLocal(data) {
    if (!data?.storage || typeof data.storage !== "object") return false;
    return DATA_KEYS.every((key) => {
      const localValue = localStorage.getItem(key);
      const cloudHasKey = Object.prototype.hasOwnProperty.call(data.storage, key);
      if (localValue === null) return !cloudHasKey;
      return cloudHasKey && String(data.storage[key]) === localValue;
    });
  }

  function parseStorageJson(storage, key, fallback) {
    try {
      const raw = storage && Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      return raw == null ? fallback : JSON.parse(String(raw));
    } catch {
      return fallback;
    }
  }

  function timeValue(value) {
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) ? time : 0;
  }

  function latestIso(a, b) {
    return timeValue(a) >= timeValue(b) ? a : b;
  }

  function mergeTimestampMaps(localMap, cloudMap) {
    const merged = { ...(cloudMap || {}) };
    for (const [key, value] of Object.entries(localMap || {})) {
      if (!merged[key] || timeValue(value) > timeValue(merged[key])) merged[key] = value;
    }
    return merged;
  }

  function mergeTombstoneMaps(localMap, cloudMap) {
    const merged = {};
    const collections = new Set([...Object.keys(localMap || {}), ...Object.keys(cloudMap || {})]);
    for (const collection of collections) {
      const records = mergeTimestampMaps(localMap?.[collection], cloudMap?.[collection]);
      if (Object.keys(records).length) merged[collection] = records;
    }
    return merged;
  }

  function recordIdForKey(key, row) {
    if (key === "bdhs_revenues_v1") return String(row?.date || "");
    if (key === "bdhs_purchases_v1" || key === "bdhs_mtf_orders_v1") return String(row?.id || "");
    if (key === "bdhs_inventories_v2") return String(row?.month || "");
    return "";
  }

  function recordTime(row) {
    return Math.max(timeValue(row?.updatedAt), timeValue(row?.createdAt));
  }

  function mergeRecordCollection(key, localRows, cloudRows, localMeta, cloudMeta, tombstones) {
    const localById = new Map((Array.isArray(localRows) ? localRows : []).map((row) => [recordIdForKey(key, row), row]).filter(([id]) => id));
    const cloudById = new Map((Array.isArray(cloudRows) ? cloudRows : []).map((row) => [recordIdForKey(key, row), row]).filter(([id]) => id));
    const ids = new Set([...localById.keys(), ...cloudById.keys(), ...Object.keys(tombstones?.[key] || {})]);
    const merged = [];

    for (const id of ids) {
      const localRow = localById.get(id);
      const cloudRow = cloudById.get(id);
      const localTime = recordTime(localRow);
      const cloudTime = recordTime(cloudRow);
      const chosen = localRow && (!cloudRow || localTime > cloudTime) ? localRow : cloudRow;
      const chosenTime = Math.max(localTime, cloudTime);
      const deletedAt = timeValue(tombstones?.[key]?.[id]);
      if (chosen && deletedAt < chosenTime) merged.push(chosen);
    }
    return merged;
  }

  function mergeStringLists(localValue, cloudValue) {
    const merged = [];
    const seen = new Set();
    for (const value of [...(Array.isArray(cloudValue) ? cloudValue : []), ...(Array.isArray(localValue) ? localValue : [])]) {
      const text = String(value || "").trim();
      const identity = text.toLocaleLowerCase("vi-VN");
      if (text && !seen.has(identity)) {
        seen.add(identity);
        merged.push(text);
      }
    }
    return merged.sort((a, b) => a.localeCompare(b, "vi"));
  }

  function chooseWholeStorageValue(key, localStorageData, cloudStorageData, localMeta, cloudMeta, localExportedAt, cloudExportedAt) {
    const localHas = Object.prototype.hasOwnProperty.call(localStorageData || {}, key);
    const cloudHas = Object.prototype.hasOwnProperty.call(cloudStorageData || {}, key);
    if (!localHas) return cloudHas ? cloudStorageData[key] : null;
    if (!cloudHas) return localStorageData[key];
    if (String(localStorageData[key]) === String(cloudStorageData[key])) return localStorageData[key];
    const localTime = timeValue(localMeta?.[key]);
    const cloudTime = timeValue(cloudMeta?.[key]);
    if (!localTime && !cloudTime) return cloudStorageData[key];
    return localTime >= cloudTime ? localStorageData[key] : cloudStorageData[key];
  }

  function resolveDuplicateOrderCodes(orders, purchases) {
    const orderRows = Array.isArray(orders) ? orders.map((row) => ({ ...row })) : [];
    const purchaseRows = Array.isArray(purchases) ? purchases.map((row) => ({ ...row })) : [];
    const nextByBase = new Map();
    for (const order of orderRows) {
      const match = String(order.code || "").match(/^(.*_\d{4}_\d{2}_)(\d+)$/);
      if (!match) continue;
      nextByBase.set(match[1], Math.max(nextByBase.get(match[1]) || 0, Number(match[2]) || 0));
    }

    const used = new Set();
    let changed = false;
    orderRows.sort((a, b) => String(a.createdAt || a.updatedAt || a.id || "").localeCompare(String(b.createdAt || b.updatedAt || b.id || "")));
    for (const order of orderRows) {
      const oldCode = String(order.code || "");
      if (!oldCode || !used.has(oldCode)) {
        if (oldCode) used.add(oldCode);
        continue;
      }
      const match = oldCode.match(/^(.*_\d{4}_\d{2}_)(\d+)$/);
      if (!match) continue;
      const base = match[1];
      let next = nextByBase.get(base) || 0;
      let newCode;
      do {
        next += 1;
        newCode = `${base}${String(next).padStart(3, "0")}`;
      } while (used.has(newCode));
      nextByBase.set(base, next);
      used.add(newCode);
      order.code = newCode;
      order.updatedAt = new Date().toISOString();
      for (const purchase of purchaseRows) {
        if (purchase.orderId !== order.id) continue;
        purchase.orderCode = newCode;
        purchase.content = String(purchase.content || "").includes(oldCode)
          ? String(purchase.content).replace(oldCode, newCode)
          : `${purchase.purchaseType === "MTF_VAT" ? "MTF VAT" : "MTF"} · ${newCode}`;
        purchase.updatedAt = order.updatedAt;
      }
      changed = true;
    }
    return { orders: orderRows, purchases: purchaseRows, changed };
  }

  function mergeDataSnapshots(localData, cloudData) {
    const localStorageData = localData?.storage || {};
    const cloudStorageData = cloudData?.storage || {};
    const localMeta = parseStorageJson(localStorageData, KEY_META_KEY, {});
    const cloudMeta = parseStorageJson(cloudStorageData, KEY_META_KEY, {});
    const mergedMeta = mergeTimestampMaps(localMeta, cloudMeta);
    const localTombstones = parseStorageJson(localStorageData, TOMBSTONES_KEY, {});
    const cloudTombstones = parseStorageJson(cloudStorageData, TOMBSTONES_KEY, {});
    const mergedTombstones = mergeTombstoneMaps(localTombstones, cloudTombstones);
    const mergedStorage = {};
    const recordKeys = new Set(["bdhs_revenues_v1", "bdhs_purchases_v1", "bdhs_mtf_orders_v1", "bdhs_inventories_v2"]);

    for (const key of DATA_KEYS) {
      if (key === KEY_META_KEY || key === TOMBSTONES_KEY) continue;
      if (recordKeys.has(key)) {
        const localRows = parseStorageJson(localStorageData, key, []);
        const cloudRows = parseStorageJson(cloudStorageData, key, []);
        mergedStorage[key] = JSON.stringify(mergeRecordCollection(key, localRows, cloudRows, localMeta, cloudMeta, mergedTombstones));
        continue;
      }
      if (key === "bdhs_purchase_contents_v1") {
        mergedStorage[key] = JSON.stringify(mergeStringLists(
          parseStorageJson(localStorageData, key, []),
          parseStorageJson(cloudStorageData, key, []),
        ));
        continue;
      }
      const value = chooseWholeStorageValue(
        key,
        localStorageData,
        cloudStorageData,
        localMeta,
        cloudMeta,
        localData?.exportedAt,
        cloudData?.exportedAt,
      );
      if (value !== null) mergedStorage[key] = String(value);
    }

    const normalizedOrders = resolveDuplicateOrderCodes(
      parseStorageJson(mergedStorage, "bdhs_mtf_orders_v1", []),
      parseStorageJson(mergedStorage, "bdhs_purchases_v1", []),
    );
    if (normalizedOrders.changed) {
      const normalizedAt = new Date().toISOString();
      mergedStorage["bdhs_mtf_orders_v1"] = JSON.stringify(normalizedOrders.orders);
      mergedStorage["bdhs_purchases_v1"] = JSON.stringify(normalizedOrders.purchases);
      mergedMeta["bdhs_mtf_orders_v1"] = normalizedAt;
      mergedMeta["bdhs_purchases_v1"] = normalizedAt;
    }
    mergedStorage[KEY_META_KEY] = JSON.stringify(mergedMeta);
    mergedStorage[TOMBSTONES_KEY] = JSON.stringify(mergedTombstones);
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion: "3.3.5-fast-safe-sync",
      storage: mergedStorage,
    };
  }

  function storageSnapshotsMatch(a, b) {
    const aStorage = a?.storage || {};
    const bStorage = b?.storage || {};
    return DATA_KEYS.every((key) => {
      const aHas = Object.prototype.hasOwnProperty.call(aStorage, key);
      const bHas = Object.prototype.hasOwnProperty.call(bStorage, key);
      return aHas === bHas && (!aHas || String(aStorage[key]) === String(bStorage[key]));
    });
  }

  async function pushWithConflictMerge(auth, reason = "auto") {
    let payload = collectData();
    let baseRevision = getLocalRevision(auth.branchId);
    let sentChangeVersion = localChangeVersion;
    let didMerge = false;
    let backupCreated = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      sentChangeVersion = localChangeVersion;
      const result = await post({
        action: "push",
        authToken: auth.authToken,
        deviceId: getDeviceId(),
        deviceName: deviceName(),
        baseRevision,
        force: false,
        data: payload,
      }, { retries: 0 });

      if (!result.conflict) return { result, payload, didMerge, sentChangeVersion };

      const cloud = await fetchCloudSnapshot(auth);
      if (!cloud.empty && cloud.data && storageSnapshotsMatch(cloud.data, payload)) {
        return {
          result: { revision: cloud.revision, updatedAt: cloud.updatedAt || new Date().toISOString() },
          payload,
          didMerge,
          sentChangeVersion,
        };
      }

      if (!backupCreated) {
        createLocalBackup(`Trước khi hợp nhất xung đột Cloud revision ${cloud.revision || result.cloudRevision || 0}`);
        backupCreated = true;
      }
      const latestLocal = collectData();
      payload = cloud.empty || !cloud.data ? latestLocal : mergeDataSnapshots(latestLocal, cloud.data);
      baseRevision = Number(cloud.revision || result.cloudRevision || 0);
      didMerge = true;
      setCloudStatus("busy", "Đang hợp nhất dữ liệu từ hai thiết bị...", `Lần thử ${attempt + 1}/4`);
    }

    const error = new Error("Cloud thay đổi liên tục nên chưa thể hợp nhất an toàn. Dữ liệu vẫn còn trên thiết bị và ứng dụng sẽ thử lại.");
    error.code = "SYNC_CONFLICT_BUSY";
    throw error;
  }

  function finishSuccessfulPush(auth, outcome, title = "Đã đồng bộ") {
    const { result, payload, didMerge, sentChangeVersion } = outcome;
    const changedAfterSend = localChangeVersion !== sentChangeVersion;
    if (didMerge) {
      const finalLocal = changedAfterSend ? mergeDataSnapshots(collectData(), payload) : payload;
      applyCloudData(finalLocal);
    }
    setLocalRevision(auth.branchId, result.revision);
    setLastSync(auth.branchId, result.updatedAt || new Date().toISOString());
    setPendingChanges(changedAfterSend);
    saveBranchCache(auth.branchId);
    if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(result.revision || 0);
    updateSyncUI(auth);
    setCloudStatus(
      "success",
      didMerge ? "Đã hợp nhất dữ liệu hai thiết bị" : title,
      `Revision ${result.revision} • ${formatTime(result.updatedAt)}`,
    );
    markSyncSuccess();
    if (changedAfterSend) scheduleAutoSync(150);
    else scheduleBurstChecks([800, 2000, 5000]);
    if (didMerge) window.setTimeout(() => window.location.reload(), 500);
    return true;
  }

  async function fetchCloudSnapshot(auth) {
    return post({ action: "pull", authToken: auth.authToken, deviceId: getDeviceId() });
  }

  async function autoPush(auth, reason = "auto") {
    const outcome = await pushWithConflictMerge(auth, reason);
    return finishSuccessfulPush(auth, outcome, "Đã đồng bộ");
  }

  async function runAutoSync(reason = "auto") {
    if (autoSyncRunning || busy) return;
    const auth = getAuth();
    if (!auth?.authToken) return;
    if (!navigator.onLine) {
      if (hasPendingChanges()) {
        setCloudStatus("warning", "Đã lưu trên thiết bị", "Sẽ tự đồng bộ khi có Internet.");
      }
      return;
    }
    const graceRemaining = syncPausedUntil - Date.now();
    if (graceRemaining > 0 && reason !== "manual") {
      scheduleAutoSync(graceRemaining);
      return;
    }

    autoSyncRunning = true;
    try {
      if (hasPendingChanges()) {
        await autoPush(auth, reason);
        return;
      }

      // Chỉ kiểm tra revision trước; chỉ tải toàn bộ dữ liệu khi Cloud mới hơn.
      const session = await post({
        action: "session",
        authToken: auth.authToken,
        deviceId: getDeviceId(),
      });
      const remoteRevision = Number(session.revision || 0);
      if ($("#cloudRemoteRevision")) $("#cloudRemoteRevision").textContent = String(remoteRevision);
      const localRevision = getLocalRevision(auth.branchId);

      if (remoteRevision > localRevision) {
        const cloud = await fetchCloudSnapshot(auth);
        if (hasPendingChanges()) {
          await autoPush(auth, reason);
          return;
        }
        if (!cloud.empty && cloud.data) {
          createLocalBackup(`Tự động nhận Cloud revision ${cloud.revision}`);
          applyCloudData(cloud.data);
          setLocalRevision(auth.branchId, cloud.revision);
          setLastSync(auth.branchId, cloud.updatedAt || new Date().toISOString());
          saveBranchCache(auth.branchId);
          setCloudStatus("success", "Đã cập nhật dữ liệu mới", "Ứng dụng đang áp dụng dữ liệu Cloud.");
          markSyncSuccess();
          window.setTimeout(() => window.location.reload(), 400);
          return;
        }
      } else if (remoteRevision < localRevision) {
        setCloudStatus("warning", "Cần kiểm tra đồng bộ", "Phiên bản trên thiết bị đang cao hơn Cloud. Bấm Đồng bộ ngay trước khi dùng thiết bị khác.");
        return;
      }

      setLastSync(auth.branchId, new Date().toISOString());
      updateSyncUI(auth);
      if (reason === "manual") {
        setCloudStatus("success", "Dữ liệu đã cập nhật", "Đồng bộ thủ công hoàn tất.");
      }
      markSyncSuccess();
    } catch (error) {
      console.warn("Auto sync chưa hoàn tất:", error);
      if (error.code === "AUTH_EXPIRED" || error.code === "AUTH_FAILED") {
        clearAuth();
        showLogin();
        return;
      }

      syncFailureCount += 1;
      scheduleSyncRetry();
      if (hasPendingChanges()) {
        setCloudStatus("warning", "Đã lưu trên thiết bị", `Đang chờ gửi lên Cloud; sẽ tự thử lại. ${error.message || ""}`.trim());
      } else if (reason === "manual" || syncFailureCount >= 2) {
        setCloudStatus("warning", "Cloud đang phản hồi chậm", `Ứng dụng sẽ tự thử lại. ${error.message || ""}`.trim());
      }
    } finally {
      autoSyncRunning = false;
      if (syncQueued && !retryTimer) {
        syncQueued = false;
        scheduleAutoSync(150);
      }
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
    $("#toggleLoginPassword")?.addEventListener("click", () => {
      const input=$("#loginPassword");
      if(!input)return;
      input.type=input.type==="password"?"text":"password";
      $("#toggleLoginPassword").setAttribute("aria-label",input.type==="password"?"Hiện mật khẩu":"Ẩn mật khẩu");
    });
    document.querySelectorAll(".auth-quick-login").forEach(button=>button.addEventListener("click",()=>{
      const input=$("#loginUsername");
      if(input){input.value=button.dataset.username||"";input.focus();}
      $("#loginPassword")?.focus();
    }));
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

    $("#cloudPush")?.addEventListener("click", () => run(pushData));
    $("#cloudPull")?.addEventListener("click", () => run(pullData));
    $("#cloudSyncNow")?.addEventListener("click", () => runAutoSync("manual"));
    $("#cloudLogout")?.addEventListener("click", logout);
    $("#cloudChangePassword")?.addEventListener("click", () => run(changePassword));

    window.addEventListener("bdhs:data-saved", () => {
      localChangeVersion += 1;
      const auth = getAuth();
      if (auth?.branchId) saveBranchCache(auth.branchId);
      setPendingChanges(true);
      updateSyncUI();
      scheduleAutoSync();
    });
    window.addEventListener("online", () => {
      clearSyncRetry();
      scheduleAutoSync(100);
      scheduleBurstChecks([1000, 2500, 5000]);
    });
    window.addEventListener("offline", () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;
      updateSyncUI();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && hasPendingChanges()) scheduleAutoSync(100);
      if (document.visibilityState === "visible" && navigator.onLine) {
        scheduleAutoSync(50);
        scheduleBurstChecks([1000, 2500]);
      }
    });
    startCloudPolling();
    updateSyncUI();
  }

  async function boot() {
    bind();
    const auth = getAuth();
    if (auth?.branchId) ensureBranchContext(auth.branchId);
    if (!auth?.authToken) {
      showLogin();
      if (!navigator.onLine) setLoginMessage("warning", "Lần đăng nhập đầu tiên cần có Internet. Sau khi đăng nhập thành công, ứng dụng vẫn dùng được khi mất mạng.");
      return;
    }
    setLoginMessage("busy", "Đang kiểm tra phiên đăng nhập...");
    const valid = await validateSession(auth);
    if (valid) {
      hideLogin();
      syncPausedUntil = Date.now() + LOGIN_SYNC_GRACE;
      scheduleAutoSync(LOGIN_SYNC_GRACE);
    } else showLogin();
  }

  document.addEventListener("DOMContentLoaded", () => run(boot, true));
  window.BDHSCloudSync = {
    collectData,
    createLocalBackup,
    hasPendingChanges,
    showLogin,
    syncNow: () => runAutoSync("manual"),
    mergeDataSnapshots,
  };
})();
