"use strict";

(() => {
  const KEYS = Object.freeze({
    revenues: "bdhs_revenues_v1",
    purchases: "bdhs_purchases_v1",
    settings: "bdhs_settings_v1",
    orders: "bdhs_mtf_orders_v1",
    inventories: "bdhs_inventories_v2",
    inventoryCatalog: "bdhs_inventory_catalog_v2",
  });

  const TEMPLATE_URL = "BDHS_Excel_Thang_Official_Template.xlsx";
  const TEMPLATE_DB = "bdhs_excel_template_db_v1";
  const TEMPLATE_STORE = "templates";
  const TEMPLATE_KEY = "monthly";

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const xmlEscape = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  function safeFilePart(value) {
    return String(value || "BDHS")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function businessName() {
    return read(KEYS.settings, {}).businessName || "BDHS";
  }

  function excelSerial(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function getMonthlyData(month) {
    const revenues = read(KEYS.revenues, []).filter((item) => String(item.date || "").slice(0, 7) === month);
    const purchases = read(KEYS.purchases, []).filter((item) => String(item.date || "").slice(0, 7) === month);
    const orders = read(KEYS.orders, []).filter((item) => String(item.date || "").slice(0, 7) === month);
    const inventory = read(KEYS.inventories, []).find((item) => item.month === month) || null;
    const rawCatalog = read(KEYS.inventoryCatalog, []);
    const catalog = Array.isArray(rawCatalog)
      ? rawCatalog.flatMap((group) => Array.isArray(group?.items)
        ? group.items.map((item) => ({
            ...item,
            groupName: group.title || group.name || group.id || "",
            carryType: group.carryField === "mtfVat" ? "MTF_VAT" : "WORKING_CAPITAL",
          }))
        : [group])
      : [];

    const revenueByDate = new Map(revenues.map((item) => [item.date, item]));
    return { revenues, purchases, orders, inventory, catalog, revenueByDate };
  }

  function openTemplateDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(TEMPLATE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) db.createObjectStore(TEMPLATE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Không mở được kho mẫu Excel."));
    });
  }

  async function saveCustomTemplate(file) {
    const buffer = await file.arrayBuffer();
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Mẫu phải là file .xlsx.");
    const db = await openTemplateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, "readwrite");
      tx.objectStore(TEMPLATE_STORE).put({ name: file.name, buffer, savedAt: new Date().toISOString() }, TEMPLATE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Không lưu được mẫu Excel."));
    });
    db.close();
    return file.name;
  }

  async function getCustomTemplate() {
    const db = await openTemplateDb();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, "readonly");
      const request = tx.objectStore(TEMPLATE_STORE).get(TEMPLATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Không đọc được mẫu Excel."));
    });
    db.close();
    return result;
  }

  async function removeCustomTemplate() {
    const db = await openTemplateDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, "readwrite");
      tx.objectStore(TEMPLATE_STORE).delete(TEMPLATE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Không xóa được mẫu Excel."));
    });
    db.close();
  }

  async function loadTemplateBuffer() {
    const custom = await getCustomTemplate();
    if (custom?.buffer) return { buffer: custom.buffer, name: custom.name, custom: true };
    const response = await fetch(TEMPLATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Không tải được mẫu Excel mặc định (${response.status}).`);
    return { buffer: await response.arrayBuffer(), name: "Mẫu mặc định", custom: false };
  }

  function cellRegex(ref) {
    return new RegExp(`<x:c\\s+([^>]*\\br="${ref}"[^>]*)\\s*(?:\\/>|>([\\s\\S]*?)<\\/x:c>)`);
  }

  function ensureCell(xml, ref) {
    if (cellRegex(ref).test(xml)) return xml;

    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match) throw new Error(`Địa chỉ ô Excel không hợp lệ: ${ref}.`);
    const rowNumber = match[2];
    const rowRegex = new RegExp(`<x:row\s+([^>]*\br="${rowNumber}"[^>]*)>([\s\S]*?)<\/x:row>`);
    const rowMatch = xml.match(rowRegex);

    if (rowMatch) {
      const replacement = `<x:row ${rowMatch[1]}>${rowMatch[2]}<x:c r="${ref}" /></x:row>`;
      return xml.replace(rowRegex, replacement);
    }

    const newRow = `<x:row r="${rowNumber}"><x:c r="${ref}" /></x:row>`;
    const nextRowRegex = new RegExp(`<x:row\s+[^>]*\br="(\d+)"[^>]*>` , "g");
    let nextMatch;
    while ((nextMatch = nextRowRegex.exec(xml))) {
      if (Number(nextMatch[1]) > Number(rowNumber)) {
        return xml.slice(0, nextMatch.index) + newRow + xml.slice(nextMatch.index);
      }
    }
    return xml.replace("</x:sheetData>", `${newRow}</x:sheetData>`);
  }

  function setCell(xml, ref, value, type = "number") {
    xml = ensureCell(xml, ref);
    const regex = cellRegex(ref);
    const match = xml.match(regex);
    if (!match) throw new Error(`Không thể tạo ô ${ref} trong mẫu Excel.`);
    let attrs = match[1]
      .replace(/\s+t="[^"]*"/g, "")
      .replace(/\s+$/, "");
    let replacement;
    if (value === null || value === undefined || value === "") {
      replacement = `<x:c ${attrs} />`;
    } else if (type === "string") {
      replacement = `<x:c ${attrs} t="inlineStr"><x:is><x:t xml:space="preserve">${xmlEscape(value)}</x:t></x:is></x:c>`;
    } else {
      replacement = `<x:c ${attrs} t="n"><x:v>${safeNumber(value)}</x:v></x:c>`;
    }
    return xml.replace(regex, replacement);
  }

  function setCells(xml, values) {
    for (const [ref, value, type] of values) xml = setCell(xml, ref, value, type);
    return xml;
  }

  function clearRange(xml, columns, startRow, endRow) {
    for (let row = startRow; row <= endRow; row += 1) {
      for (const column of columns) xml = setCell(xml, `${column}${row}`, null, "string");
    }
    return xml;
  }

  function ensureAutoCalculation(workbookXml) {
    if (/<x:calcPr\b/.test(workbookXml)) {
      return workbookXml.replace(/<x:calcPr\b[^>]*\/>/, '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" />');
    }
    return workbookXml.replace("</x:workbook>", '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" /></x:workbook>');
  }

  async function fillTemplate(month) {
    if (!window.JSZip) throw new Error("Thiếu thư viện tạo Excel.");
    const data = getMonthlyData(month);
    const { buffer } = await loadTemplateBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const paths = {
      summary: "xl/worksheets/sheet1.xml",
      revenue: "xl/worksheets/sheet2.xml",
      purchase: "xl/worksheets/sheet3.xml",
      orders: "xl/worksheets/sheet4.xml",
      inventory: "xl/worksheets/sheet5.xml",
      catalog: "xl/worksheets/sheet6.xml",
    };

    for (const path of Object.values(paths)) {
      if (!zip.file(path)) throw new Error(`Mẫu Excel không đúng cấu trúc: thiếu ${path}.`);
    }

    const [year, monthNumber] = month.split("-").map(Number);

    // 01_Tổng hợp: chỉ điền thông tin. Các tổng giữ bằng công thức của mẫu.
    let summaryXml = await zip.file(paths.summary).async("string");
    summaryXml = setCells(summaryXml, [
      ["B5", businessName(), "string"],
      ["B6", excelSerial(new Date(year, monthNumber - 1, 1)), "number"],
      ["B7", excelSerial(new Date()), "number"],
    ]);
    zip.file(paths.summary, summaryXml);

    // 02_Doanh thu: 31 ngày trong một sheet, đúng mục đích báo cáo/đối chiếu.
    let revenueXml = await zip.file(paths.revenue).async("string");
    for (let day = 1; day <= 31; day += 1) {
      const row = day + 4;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const item = data.revenueByDate.get(date) || {};
      const isValidDay = day <= new Date(year, monthNumber, 0).getDate();
      revenueXml = setCells(revenueXml, [
        [`A${row}`, isValidDay ? day : null, "number"],
        [`C${row}`, isValidDay ? safeNumber(item.cash) : null, "number"],
        [`D${row}`, isValidDay ? safeNumber(item.transfer) : null, "number"],
        [`E${row}`, isValidDay ? safeNumber(item.dailyExpense) : null, "number"],
        [`F${row}`, isValidDay ? safeNumber(item.partTimeSalary) : null, "number"],
        [`H${row}`, isValidDay ? (item.note || item.notes || "") : "", "string"],
      ]);
    }
    zip.file(paths.revenue, revenueXml);

    // 03_Chi vốn: một giao dịch một dòng.
    if (data.purchases.length > 496) throw new Error("Số dòng chi vốn vượt giới hạn 496 dòng của mẫu.");
    let purchaseXml = await zip.file(paths.purchase).async("string");
    purchaseXml = clearRange(purchaseXml, ["A", "B", "C", "D", "E", "F", "H", "I"], 5, 500);
    [...data.purchases]
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .forEach((item, index) => {
        const row = index + 5;
        purchaseXml = setCells(purchaseXml, [
          [`A${row}`, item.date || "", "string"],
          [`B${row}`, item.content || item.note || "", "string"],
          [`C${row}`, item.purchaseType || item.type || "WORKING_CAPITAL", "string"],
          [`D${row}`, safeNumber(item.mtfVat), "number"],
          [`E${row}`, safeNumber(item.mtfNone), "number"],
          [`F${row}`, safeNumber(item.otherPurchase), "number"],
          [`H${row}`, item.source || "", "string"],
          [`I${row}`, item.orderId || item.linkedOrderId || item.id || "", "string"],
        ]);
      });
    zip.file(paths.purchase, purchaseXml);

    // 04_Đơn MTF.
    if (data.orders.length > 246) throw new Error("Số đơn MTF vượt giới hạn 246 dòng của mẫu.");
    let orderXml = await zip.file(paths.orders).async("string");
    orderXml = clearRange(orderXml, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], 5, 250);
    data.orders.forEach((order, index) => {
      const row = index + 5;
      const subtotal = safeNumber(order.subtotal || order.goodsTotal || order.beforeVat);
      const vat = safeNumber(order.vat || order.vatAmount);
      const total = safeNumber(order.total || order.grandTotal || subtotal + vat);
      orderXml = setCells(orderXml, [
        [`A${row}`, order.id || order.orderId || "", "string"],
        [`B${row}`, order.date || "", "string"],
        [`C${row}`, order.type === "vat" || order.orderType === "MTF_VAT" ? "MTF VAT" : "MTF", "string"],
        [`D${row}`, order.status || (order.confirmed ? "Đã đặt" : "Nháp"), "string"],
        [`E${row}`, subtotal, "number"],
        [`F${row}`, vat, "number"],
        [`G${row}`, total, "number"],
        [`H${row}`, order.buyer?.contact || order.contact || "", "string"],
        [`I${row}`, order.buyer?.deliveryPlace || order.deliveryPlace || "", "string"],
        [`J${row}`, order.note || order.buyer?.note || "", "string"],
      ]);
    });
    zip.file(paths.orders, orderXml);

    // 05_Kiểm kê: snapshot của tháng.
    const inventoryItems = Array.isArray(data.inventory?.groups)
      ? data.inventory.groups.flatMap((group) => (group.items || []).map((item) => ({
          ...item,
          groupName: group.title || group.name || group.id || "",
          carryType: group.carryField === "mtfVat" ? "MTF_VAT" : "WORKING_CAPITAL",
        })))
      : (data.inventory?.items || []);
    if (inventoryItems.length > 196) throw new Error("Danh sách kiểm kê vượt giới hạn 196 dòng của mẫu.");
    let inventoryXml = await zip.file(paths.inventory).async("string");
    inventoryXml = clearRange(inventoryXml, ["A", "B", "C", "D", "E", "G", "H"], 5, 200);
    inventoryItems.forEach((item, index) => {
      const row = index + 5;
      inventoryXml = setCells(inventoryXml, [
        [`A${row}`, item.groupName || item.group || "", "string"],
        [`B${row}`, item.name || "", "string"],
        [`C${row}`, item.unit || "", "string"],
        [`D${row}`, safeNumber(item.price), "number"],
        [`E${row}`, safeNumber(item.qty), "number"],
        [`G${row}`, item.carryType || (index < 9 ? "MTF_VAT" : "WORKING_CAPITAL"), "string"],
        [`H${row}`, item.note || "", "string"],
      ]);
    });
    zip.file(paths.inventory, inventoryXml);

    // 06_Danh mục.
    if (data.catalog.length > 196) throw new Error("Danh mục vượt giới hạn 196 dòng của mẫu.");
    let catalogXml = await zip.file(paths.catalog).async("string");
    catalogXml = clearRange(catalogXml, ["A", "B", "C", "D", "E", "F"], 5, 200);
    data.catalog.forEach((item, index) => {
      const row = index + 5;
      catalogXml = setCells(catalogXml, [
        [`A${row}`, item.id || item.code || `HH${String(index + 1).padStart(3, "0")}`, "string"],
        [`B${row}`, item.name || "", "string"],
        [`C${row}`, item.groupName || item.group || "", "string"],
        [`D${row}`, item.unit || "", "string"],
        [`E${row}`, safeNumber(item.price), "number"],
        [`F${row}`, safeNumber(item.stock || item.fixedStock || item.targetStock || item.target), "number"],
      ]);
    });
    zip.file(paths.catalog, catalogXml);

    const workbookPath = "xl/workbook.xml";
    const workbookXml = ensureAutoCalculation(await zip.file(workbookPath).async("string"));
    zip.file(workbookPath, workbookXml);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function exportMonth() {
    const button = document.querySelector("#exportExcelMonth");
    const month = document.querySelector("#reportMonth")?.value || new Date().toISOString().slice(0, 7);
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Đang tạo .xlsx…";
      }
      const blob = await fillTemplate(month);
      downloadBlob(blob, `${safeFilePart(businessName())}_${month.replace("-", "_")}.xlsx`);
    } catch (error) {
      console.error(error);
      alert(`Không xuất được Excel: ${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Xuất Excel tháng";
      }
    }
  }

  async function refreshTemplateStatus() {
    const status = document.querySelector("#excelTemplateStatus");
    if (!status) return;
    try {
      const custom = await getCustomTemplate();
      status.textContent = custom
        ? `Đang dùng: ${custom.name} • cập nhật ${new Date(custom.savedAt).toLocaleString("vi-VN")}`
        : "Đang dùng mẫu mặc định đi kèm ứng dụng.";
    } catch {
      status.textContent = "Không đọc được trạng thái mẫu Excel.";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#exportExcelMonth")?.addEventListener("click", exportMonth);

    const fileInput = document.querySelector("#excelTemplateFile");
    document.querySelector("#chooseExcelTemplate")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        await saveCustomTemplate(file);
        await refreshTemplateStatus();
        alert("Đã cập nhật mẫu Excel. Các lần xuất sau sẽ dùng mẫu này.");
      } catch (error) {
        alert(`Không cập nhật được mẫu: ${error.message}`);
      } finally {
        fileInput.value = "";
      }
    });

    document.querySelector("#resetExcelTemplate")?.addEventListener("click", async () => {
      try {
        await removeCustomTemplate();
        await refreshTemplateStatus();
        alert("Đã quay lại mẫu Excel mặc định.");
      } catch (error) {
        alert(`Không khôi phục được mẫu mặc định: ${error.message}`);
      }
    });

    refreshTemplateStatus();
  });

  window.BDHSExcelExport = { exportMonth, fillTemplate, saveCustomTemplate, removeCustomTemplate };
})();
