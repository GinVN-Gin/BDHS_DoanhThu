/**
 * BDHS Sync Server V2 - Account Login + Password Recovery
 * Replace the current Code.gs with this file, run setupAuthV2() once,
 * then run seedInitialAccounts() once and deploy a new version.
 */

const SHEETS = Object.freeze({
  BRANCHES: "BRANCHES",
  DATA: "DATA",
  BACKUP: "BACKUP",
  LOG: "LOG",
  USERS: "USERS",
  RESET_CODES: "RESET_CODES",
});

const PROP = Object.freeze({
  SPREADSHEET_ID: "BDHS_SPREADSHEET_ID",
  ROOT_FOLDER_ID: "BDHS_ROOT_FOLDER_ID",
  AUTH_SECRET: "BDHS_AUTH_SECRET_V2",
});

const SESSION_HOURS = 168; // 7 days
const RESET_MINUTES = 10;
const RECOVERY_EMAIL = "tiennguyen8001@gmail.com";

function setupAuthV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Không tìm thấy Google Sheet liên kết.");

  PropertiesService.getScriptProperties().setProperty(PROP.SPREADSHEET_ID, ss.getId());
  ensureHeaders_(ss, SHEETS.BRANCHES, ["branchId","branchName","accessTokenHash","isActive","createdAt","updatedAt"]);
  ensureHeaders_(ss, SHEETS.DATA, ["branchId","revision","updatedAt","updatedBy","deviceId","checksum","fileId","bytes"]);
  ensureHeaders_(ss, SHEETS.BACKUP, ["branchId","revision","createdAt","deviceId","checksum","fileId","bytes"]);
  ensureHeaders_(ss, SHEETS.LOG, ["time","branchId","deviceId","action","revision","status","message"]);
  ensureHeaders_(ss, SHEETS.USERS, ["username","branchId","passwordHash","recoveryEmail","isActive","authVersion","createdAt","updatedAt"]);
  ensureHeaders_(ss, SHEETS.RESET_CODES, ["username","codeHash","expiresAt","usedAt","attempts","createdAt"]);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.AUTH_SECRET)) {
    props.setProperty(PROP.AUTH_SECRET, generateToken_());
  }
  if (!props.getProperty(PROP.ROOT_FOLDER_ID)) {
    props.setProperty(PROP.ROOT_FOLDER_ID, DriveApp.createFolder("BDHS Cloud Storage").getId());
  }

  return { ok: true, message: "Đã thiết lập Account Login V2." };
}

/** Run once, then you may delete this function from Code.gs. */
function seedInitialAccounts() {
  upsertUser_("socxoai", "SOC_XOAI", "Gin12345", RECOVERY_EMAIL);
  upsertUser_("rachgia", "RACH_GIA", "Suong12345", RECOVERY_EMAIL);
  return { ok: true, users: ["socxoai", "rachgia"] };
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "ping").toLowerCase();
  if (action === "ping") {
    return jsonResponse_({ ok: true, service: "BDHS Sync Server V2", serverTime: new Date().toISOString() });
  }
  return jsonResponse_({ ok: false, error: "USE_POST", message: "Vui lòng dùng POST." });
}

function doPost(e) {
  try {
    const raw = e && e.postData ? String(e.postData.contents || "") : "";
    if (!raw) throw apiError_("EMPTY_BODY", "Không nhận được dữ liệu.");
    const payload = JSON.parse(raw);
    const action = String(payload.action || "").toLowerCase();

    if (action === "login") return jsonResponse_(login_(payload));
    if (action === "session") return jsonResponse_(session_(payload));
    if (action === "forgotpassword") return jsonResponse_(forgotPassword_(payload));
    if (action === "resetpassword") return jsonResponse_(resetPassword_(payload));
    if (action === "changepassword") return jsonResponse_(changePassword_(payload));
    if (action === "pull") return jsonResponse_(pull_(payload));
    if (action === "push") return jsonResponse_(push_(payload));

    throw apiError_("UNKNOWN_ACTION", "Action không hợp lệ.");
  } catch (error) {
    return errorResponse_(error);
  }
}

function login_(payload) {
  const username = normalizeUsername_(payload.username);
  const user = getUser_(username);
  if (!user || !user.isActive || user.passwordHash !== sha256_(String(payload.password || ""))) {
    throw apiError_("AUTH_FAILED", "Tài khoản hoặc mật khẩu không đúng.");
  }

  const branch = getBranch_(user.branchId);
  if (!branch || !branch.isActive) throw apiError_("BRANCH_DISABLED", "Chi nhánh chưa hoạt động.");

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  const authToken = signToken_({
    username,
    branchId: user.branchId,
    authVersion: user.authVersion,
    exp: expiresAt.getTime(),
  });
  const meta = getDataMeta_(user.branchId);
  appendLog_({ branchId: user.branchId, deviceId: payload.deviceId, action: "LOGIN", revision: meta ? meta.revision : 0, status: "SUCCESS", message: username });

  return {
    ok: true,
    username,
    branchId: user.branchId,
    branchName: branch.branchName,
    authToken,
    expiresAt: expiresAt.toISOString(),
    revision: meta ? Number(meta.revision || 0) : 0,
  };
}

function session_(payload) {
  const auth = verifyToken_(payload.authToken);
  const branch = getBranch_(auth.branchId);
  const meta = getDataMeta_(auth.branchId);
  return {
    ok: true,
    username: auth.username,
    branchId: auth.branchId,
    branchName: branch ? branch.branchName : auth.branchId,
    expiresAt: new Date(auth.exp).toISOString(),
    revision: meta ? Number(meta.revision || 0) : 0,
  };
}

function forgotPassword_(payload) {
  const username = normalizeUsername_(payload.username);
  const user = getUser_(username);
  // Same generic reply if account does not exist.
  if (!user || !user.isActive) return { ok: true, maskedEmail: "***@***" };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.RESET_CODES);
  sheet.appendRow([username, sha256_(code), new Date(Date.now() + RESET_MINUTES * 60000), "", 0, new Date()]);

  MailApp.sendEmail({
    to: user.recoveryEmail,
    subject: "Mã đặt lại mật khẩu BDHS",
    htmlBody: `<p>Mã xác minh cho tài khoản <b>${username}</b> là:</p><p style="font-size:26px;font-weight:bold;letter-spacing:4px">${code}</p><p>Mã hết hạn sau ${RESET_MINUTES} phút.</p>`,
  });

  appendLog_({ branchId: user.branchId, deviceId: "RECOVERY", action: "FORGOT_PASSWORD", revision: 0, status: "SUCCESS", message: username });
  return { ok: true, maskedEmail: maskEmail_(user.recoveryEmail) };
}

function resetPassword_(payload) {
  const username = normalizeUsername_(payload.username);
  const newPassword = validatePassword_(payload.newPassword);
  const code = String(payload.code || "").trim();
  const user = getUser_(username);
  if (!user) throw apiError_("AUTH_FAILED", "Không thể đặt lại mật khẩu.");

  const reset = getLatestResetCode_(username);
  if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() < Date.now()) {
    throw apiError_("RESET_EXPIRED", "Mã xác minh đã hết hạn. Hãy yêu cầu mã mới.");
  }
  if (Number(reset.attempts || 0) >= 5) throw apiError_("RESET_LOCKED", "Đã nhập sai quá nhiều lần.");
  if (reset.codeHash !== sha256_(code)) {
    getSpreadsheet_().getSheetByName(SHEETS.RESET_CODES).getRange(reset.row, 5).setValue(Number(reset.attempts || 0) + 1);
    throw apiError_("RESET_CODE_INVALID", "Mã xác minh không đúng.");
  }

  updateUserPassword_(user, newPassword);
  getSpreadsheet_().getSheetByName(SHEETS.RESET_CODES).getRange(reset.row, 4).setValue(new Date());
  appendLog_({ branchId: user.branchId, deviceId: "RECOVERY", action: "RESET_PASSWORD", revision: 0, status: "SUCCESS", message: username });
  return { ok: true };
}

function changePassword_(payload) {
  const auth = verifyToken_(payload.authToken);
  const user = getUser_(auth.username);
  if (!user || user.passwordHash !== sha256_(String(payload.currentPassword || ""))) {
    throw apiError_("AUTH_FAILED", "Mật khẩu hiện tại không đúng.");
  }
  updateUserPassword_(user, validatePassword_(payload.newPassword));
  appendLog_({ branchId: user.branchId, deviceId: "APP", action: "CHANGE_PASSWORD", revision: 0, status: "SUCCESS", message: user.username });
  return { ok: true };
}

function pull_(payload) {
  const auth = verifyToken_(payload.authToken);
  const result = pullBranchData_(auth.branchId);
  appendLog_({ branchId: auth.branchId, deviceId: payload.deviceId, action: "PULL", revision: result.revision, status: "SUCCESS", message: auth.username });
  return result;
}

function push_(payload) {
  const auth = verifyToken_(payload.authToken);
  return pushBranchData_({
    branchId: auth.branchId,
    username: auth.username,
    deviceId: payload.deviceId,
    deviceName: payload.deviceName,
    baseRevision: payload.baseRevision,
    force: payload.force === true,
    data: payload.data,
  });
}

function pushBranchData_(payload) {
  const branchId = payload.branchId;
  const baseRevision = Math.max(0, Number(payload.baseRevision || 0));
  if (!payload.data || typeof payload.data !== "object") throw apiError_("INVALID_DATA", "Dữ liệu không hợp lệ.");

  const dataJson = JSON.stringify(payload.data);
  if (Utilities.newBlob(dataJson).getBytes().length > 8 * 1024 * 1024) throw apiError_("DATA_TOO_LARGE", "Dữ liệu vượt giới hạn 8 MB.");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const current = getDataMeta_(branchId);
    const currentRevision = current ? Number(current.revision || 0) : 0;
    if (!payload.force && baseRevision !== currentRevision) {
      return { ok: false, conflict: true, error: "REVISION_CONFLICT", message: "Cloud đã có dữ liệu mới hơn.", cloudRevision: currentRevision, cloudUpdatedAt: current ? toIso_(current.updatedAt) : null };
    }
    if (current && current.fileId) backupCurrentData_(branchId, current);

    const nextRevision = currentRevision + 1;
    const checksum = sha256_(dataJson);
    const stored = JSON.stringify({ schemaVersion: 2, branchId, revision: nextRevision, updatedAt: new Date().toISOString(), updatedBy: payload.deviceName || payload.username, deviceId: payload.deviceId || "UNKNOWN", checksum, data: payload.data });
    const folder = getOrCreateBranchFolder_(branchId);
    const existing = getFileSafely_(current && current.fileId);
    const file = existing || folder.createFile(`${branchId}_current.json`, stored, MimeType.PLAIN_TEXT);
    if (existing) existing.setContent(stored);

    upsertDataMeta_({ branchId, revision: nextRevision, updatedAt: new Date(), updatedBy: payload.deviceName || payload.username, deviceId: payload.deviceId || "UNKNOWN", checksum, fileId: file.getId(), bytes: Utilities.newBlob(stored).getBytes().length });
    appendLog_({ branchId, deviceId: payload.deviceId, action: "PUSH", revision: nextRevision, status: "SUCCESS", message: payload.username });
    return { ok: true, conflict: false, branchId, revision: nextRevision, checksum, updatedAt: new Date().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function pullBranchData_(branchId) {
  const meta = getDataMeta_(branchId);
  if (!meta || !meta.fileId) return { ok: true, empty: true, branchId, revision: 0, data: null };
  const file = getFileSafely_(meta.fileId);
  if (!file) throw apiError_("DATA_FILE_MISSING", "Không tìm thấy dữ liệu Cloud.");
  const stored = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
  const checksum = sha256_(JSON.stringify(stored.data));
  if (stored.checksum && stored.checksum !== checksum) throw apiError_("CHECKSUM_MISMATCH", "Dữ liệu Cloud bị lỗi toàn vẹn.");
  return { ok: true, empty: false, branchId, revision: Number(stored.revision || meta.revision || 0), updatedAt: stored.updatedAt || toIso_(meta.updatedAt), updatedBy: stored.updatedBy || meta.updatedBy || "", deviceId: stored.deviceId || meta.deviceId || "", checksum, data: stored.data };
}

function verifyToken_(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) throw apiError_("AUTH_FAILED", "Phiên đăng nhập không hợp lệ.");
  const payloadText = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  const expected = hmac_(parts[0]);
  if (!constantTimeEquals_(expected, parts[1])) throw apiError_("AUTH_FAILED", "Phiên đăng nhập không hợp lệ.");
  const payload = JSON.parse(payloadText);
  if (Number(payload.exp || 0) < Date.now()) throw apiError_("AUTH_EXPIRED", "Phiên đăng nhập đã hết hạn.");
  const user = getUser_(payload.username);
  if (!user || !user.isActive || Number(user.authVersion || 1) !== Number(payload.authVersion || 1)) throw apiError_("AUTH_EXPIRED", "Phiên đăng nhập đã hết hiệu lực.");
  return payload;
}

function signToken_(payload) {
  const encoded = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/g, "");
  return `${encoded}.${hmac_(encoded)}`;
}

function hmac_(text) {
  const secret = PropertiesService.getScriptProperties().getProperty(PROP.AUTH_SECRET);
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(text), String(secret))).replace(/=+$/g, "");
}

function upsertUser_(usernameValue, branchId, password, recoveryEmail) {
  const username = normalizeUsername_(usernameValue);
  const branch = getBranch_(branchId);
  if (!branch) throw new Error(`Không tìm thấy chi nhánh ${branchId}. Hãy tạo chi nhánh trước.`);
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.USERS);
  const current = getUser_(username);
  const now = new Date();
  const row = [username, branchId, sha256_(validatePassword_(password)), recoveryEmail, true, current ? Number(current.authVersion || 1) : 1, current ? current.createdAt : now, now];
  if (current) sheet.getRange(current.row, 1, 1, row.length).setValues([row]); else sheet.appendRow(row);
}

function updateUserPassword_(user, newPassword) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.USERS);
  sheet.getRange(user.row, 3).setValue(sha256_(newPassword));
  sheet.getRange(user.row, 6).setValue(Number(user.authVersion || 1) + 1);
  sheet.getRange(user.row, 8).setValue(new Date());
}

function getUser_(usernameValue) {
  const username = normalizeUsername_(usernameValue);
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.USERS);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, 8).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === username) return { row: i + 2, username: values[i][0], branchId: values[i][1], passwordHash: values[i][2], recoveryEmail: values[i][3], isActive: values[i][4] === true || String(values[i][4]).toLowerCase() === "true", authVersion: values[i][5], createdAt: values[i][6], updatedAt: values[i][7] };
  }
  return null;
}

function getBranch_(branchIdValue) {
  const branchId = String(branchIdValue || "").trim().toUpperCase();
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.BRANCHES);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, 6).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toUpperCase() === branchId) return { row: i + 2, branchId: values[i][0], branchName: values[i][1], isActive: values[i][3] === true || String(values[i][3]).toLowerCase() === "true" };
  }
  return null;
}

function getLatestResetCode_(username) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.RESET_CODES);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2, 1, last - 1, 6).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim().toLowerCase() === username) return { row: i + 2, username: values[i][0], codeHash: values[i][1], expiresAt: values[i][2], usedAt: values[i][3], attempts: values[i][4], createdAt: values[i][5] };
  }
  return null;
}

function ensureHeaders_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0 || !String(sheet.getRange(1,1).getValue()).trim()) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,Math.max(headers.length,sheet.getLastColumn())).setFontWeight("bold");
  return sheet;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
  if (!id) throw new Error("Chưa chạy setupAuthV2().");
  return SpreadsheetApp.openById(id);
}

function getDataMeta_(branchId) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.DATA);
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const values = sheet.getRange(2,1,last-1,8).getValues();
  for (let i=0;i<values.length;i++) if (String(values[i][0]).trim().toUpperCase() === branchId) return { row:i+2, branchId:values[i][0], revision:values[i][1], updatedAt:values[i][2], updatedBy:values[i][3], deviceId:values[i][4], checksum:values[i][5], fileId:values[i][6], bytes:values[i][7] };
  return null;
}

function upsertDataMeta_(meta) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.DATA);
  const current = getDataMeta_(meta.branchId);
  const row = [meta.branchId,meta.revision,meta.updatedAt,meta.updatedBy,meta.deviceId,meta.checksum,meta.fileId,meta.bytes];
  if (current) sheet.getRange(current.row,1,1,row.length).setValues([row]); else sheet.appendRow(row);
}

function backupCurrentData_(branchId,current) {
  const source = getFileSafely_(current.fileId);
  if (!source) return;
  const folder = getOrCreateBackupFolder_(branchId);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyyMMdd_HHmmss");
  const copy = source.makeCopy(`${branchId}_rev_${current.revision}_${stamp}.json`, folder);
  getSpreadsheet_().getSheetByName(SHEETS.BACKUP).appendRow([branchId,Number(current.revision||0),new Date(),String(current.deviceId||""),String(current.checksum||""),copy.getId(),Number(current.bytes||0)]);
}

function getRootFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP.ROOT_FOLDER_ID);
  if (!id) throw new Error("Chưa chạy setupAuthV2().");
  return DriveApp.getFolderById(id);
}

function getOrCreateBranchFolder_(branchId) {
  const root = getRootFolder_();
  const name = `branch_${branchId}`;
  const folders = root.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : root.createFolder(name);
}

function getOrCreateBackupFolder_(branchId) {
  const branch = getOrCreateBranchFolder_(branchId);
  const folders = branch.getFoldersByName("backups");
  return folders.hasNext() ? folders.next() : branch.createFolder("backups");
}

function getFileSafely_(id) { try { return id ? DriveApp.getFileById(String(id)) : null; } catch (_) { return null; } }
function appendLog_(e) { try { getSpreadsheet_().getSheetByName(SHEETS.LOG).appendRow([new Date(),String(e.branchId||""),String(e.deviceId||""),String(e.action||""),Number(e.revision||0),String(e.status||""),String(e.message||"")]); } catch (_) {} }
function normalizeUsername_(v) { const x=String(v||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,""); if(x.length<3||x.length>40) throw apiError_("INVALID_USERNAME","Tài khoản không hợp lệ."); return x; }
function validatePassword_(v) { const x=String(v||""); if(x.length<8||x.length>100) throw apiError_("INVALID_PASSWORD","Mật khẩu phải từ 8 đến 100 ký tự."); return x; }
function maskEmail_(email) { const parts=String(email||"").split("@"); if(parts.length!==2) return "***"; return `${parts[0].slice(0,2)}***@${parts[1]}`; }
function generateToken_() { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid()+Date.now()+Math.random(), Utilities.Charset.UTF_8)).replace(/=+$/g,""); }
function sha256_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8).map(b=>{const v=b<0?b+256:b;return v.toString(16).padStart(2,"0")}).join(""); }
function constantTimeEquals_(a,b) { a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0; }
function toIso_(v) { if(!v)return null;const d=v instanceof Date?v:new Date(v);return isNaN(d.getTime())?null:d.toISOString(); }
function apiError_(code,message) { const e=new Error(message);e.apiCode=code;return e; }
function errorResponse_(e) { console.error(e&&e.stack?e.stack:e);return jsonResponse_({ok:false,error:e&&e.apiCode?e.apiCode:"SERVER_ERROR",message:e&&e.message?e.message:"Máy chủ gặp lỗi."}); }
function jsonResponse_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
