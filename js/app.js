"use strict";

const STORAGE_KEYS={revenues:"bdhs_revenues_v1",purchases:"bdhs_purchases_v1",purchaseContents:"bdhs_purchase_contents_v1",settings:"bdhs_settings_v1",orders:"bdhs_mtf_orders_v1",products:"bdhs_mtf_products_v1",buyer:"bdhs_buyer_profile_v1",inventories:"bdhs_inventories_v2",inventoryCatalog:"bdhs_inventory_catalog_v2"};
const DEFAULT_MTF_PRODUCTS=[{name:"Bắp giò",unit:"Kg",target:20,price:125000},{name:"Chả cốm Ước lễ L1 - 24 miếng",unit:"Kg",target:15,price:120000},{name:"Chả sườn sụn L1",unit:"Kg",target:15,price:135000},{name:"Dồi sụn nướng Minh Thủy",unit:"Kg",target:15,price:125000},{name:"Nem chua rán - Trần",unit:"Kg",target:15,price:130000},{name:"Chả ram Tôm đất nhỏ - 50 cuốn",unit:"Túi 500gr",target:8,price:50000},{name:"Mắm tôm TH sống bình 5.5kg",unit:"Bình 6kg",target:4,price:300000},{name:"Sấu ngâm - trái giòn",unit:"Hũ 02kg",target:3,price:130000},{name:"Atiso Đà Lạt",unit:"Hũ 02kg",target:3,price:150000}];
const state={revenues:load(STORAGE_KEYS.revenues,[]),purchases:load(STORAGE_KEYS.purchases,[]),purchaseContents:load(STORAGE_KEYS.purchaseContents,["Nhập hàng tổng","Mua gas","Điện nước","Vận chuyển","Sửa chữa","Chi khác"]),settings:load(STORAGE_KEYS.settings,{theme:"sunrise",surfaceOpacity:94,backgroundImage:"",autoSync:false,businessName:"BDHS Sóc Xoài",orderHeaderColor:"#1f3a5f",orderFooterColor:"#1f3a5f",orderBorderColor:"#1f3a5f",orderBranchTextColor:"#1f3a5f",orderLayout:"compact",homeCardSize:"medium",homeColumns:"3",homeShadow:"soft",homeRadius:"22",homeCardOpacity:94}),orders:load(STORAGE_KEYS.orders,[]),products:load(STORAGE_KEYS.products,DEFAULT_MTF_PRODUCTS),buyer:load(STORAGE_KEYS.buyer,{shopName:"BDHS Sóc Xoài",address:"Hòa Bằng, Tân Phú",deliveryPlace:"",contact:"",phone:"",bankAccount:"",bank:"",note:"",invoiceCompanyName:"",invoiceTaxCode:"",invoiceAddress:"",invoiceEmail:""}),orderType:"vat",editingRevenueDate:null,editingPurchaseId:null,listType:"revenue",returnView:"homeView",inventories:load(STORAGE_KEYS.inventories,[]),inventoryCatalog:load(STORAGE_KEYS.inventoryCatalog,null)};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0});
const compactMoney=new Intl.NumberFormat("vi-VN",{notation:"compact",maximumFractionDigits:1});
const DRAFT_KEY='bdhs_unsaved_drafts_v111';
const dirtyState={revenue:false,purchase:false,order:false,buyer:false};
let unsavedResolver=null, suspendDirty=false;

function load(k,f){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f}catch{return f}}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`}
function normalizeData(){state.revenues=state.revenues.map(r=>({...r,date:r.date||todayISO(),storeExpense:Number(r.storeExpense)||((Number(r.dailyExpense)||0)+(Number(r.partTimeSalary)||0)),totalRevenue:Number(r.totalRevenue)||((Number(r.cash)||0)+(Number(r.transfer)||0)+(Number(r.dailyExpense)||0)+(Number(r.partTimeSalary)||0))}));state.purchases=state.purchases.map(p=>{const row={...p,id:p.id||uid(),total:Number(p.total)||((Number(p.mtfVat)||0)+(Number(p.mtfNone)||0)+(Number(p.otherPurchase)||0))};return{...row,purchaseType:row.purchaseType||inferPurchaseType(row)}});save()}
function save(){localStorage.setItem(STORAGE_KEYS.revenues,JSON.stringify(state.revenues));localStorage.setItem(STORAGE_KEYS.purchases,JSON.stringify(state.purchases));localStorage.setItem(STORAGE_KEYS.purchaseContents,JSON.stringify(state.purchaseContents));localStorage.setItem(STORAGE_KEYS.settings,JSON.stringify(state.settings));localStorage.setItem(STORAGE_KEYS.orders,JSON.stringify(state.orders));localStorage.setItem(STORAGE_KEYS.products,JSON.stringify(state.products));localStorage.setItem(STORAGE_KEYS.buyer,JSON.stringify(state.buyer));localStorage.setItem(STORAGE_KEYS.inventories,JSON.stringify(state.inventories));localStorage.setItem(STORAGE_KEYS.inventoryCatalog,JSON.stringify(state.inventoryCatalog));window.dispatchEvent(new CustomEvent('bdhs:data-saved',{detail:{at:new Date().toISOString()}}))}
function parseMoneyInput(v){return Math.max(0,Number(String(v||"").replace(/[^0-9]/g,""))||0)}
function setMoney(id,v){$(id).value=v?new Intl.NumberFormat("vi-VN").format(v):""}
function value(id){return parseMoneyInput($(id).value)}
function formatMoneyInput(el){const v=parseMoneyInput(el.value);el.value=v?new Intl.NumberFormat("vi-VN").format(v):""}
function todayISO(){const d=new Date();return localISO(d)}
function localISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function currentMonthISO(){return todayISO().slice(0,7)}
function monthKey(v){return String(v||"").slice(0,7)}
function formatDate(v){if(!v)return"";const[y,m,d]=v.split("-");return`${d}/${m}/${y}`}
function formatMonth(v){if(!v)return"";const[y,m]=v.split("-");return`${m}/${y}`}
function shiftMonth(month,n){const[y,m]=month.split("-").map(Number),d=new Date(y,m-1+n,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function escapeHtml(t){return String(t??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function clearOrderReview(){state.currentOrderDraftId=null;renderOrderPreview(null)}
function showView(id){const leavingOrder=activeViewId()==='orderView'&&id!=='orderView';if(leavingOrder)clearOrderReview();$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$('#homeBtn').classList.toggle('hidden',id==='homeView');if(id==='reportView')renderAllReports();window.scrollTo({top:0,behavior:'smooth'});updateSaveStateUI()}
let confirmResolver=null;function confirmAction(msg,title="Xác nhận"){$('#confirmTitle').textContent=title;$('#confirmMessage').textContent=msg;$('#confirmModal').classList.remove('hidden');return new Promise(r=>confirmResolver=r)}function closeConfirm(v){$('#confirmModal').classList.add('hidden');if(confirmResolver)confirmResolver(v);confirmResolver=null}

function getRevenueDraft(){const cash=value('#cash'),transfer=value('#transfer'),dailyExpense=value('#dailyExpense'),partTimeSalary=value('#partTimeSalary'),storeExpense=dailyExpense+partTimeSalary,totalRevenue=cash+transfer+storeExpense;return{cash,transfer,dailyExpense,partTimeSalary,storeExpense,totalRevenue}}
function getPurchaseDraft(){const mtfVat=value('#mtfVat'),mtfNone=value('#mtfNone'),otherPurchase=value('#otherPurchase');return{mtfVat,mtfNone,otherPurchase,total:mtfVat+mtfNone+otherPurchase}}
function getPurchaseContent(){return $('#purchaseContentSelect').value==='__custom__'?$('#customContent').value.trim():$('#purchaseContentSelect').value}
function updateRevenueLive(){const d=getRevenueDraft();$('#liveStoreExpense').textContent=money.format(d.storeExpense);$('#liveRevenue').textContent=money.format(d.totalRevenue)}
function updatePurchaseLive(){$('#livePurchaseTotal').textContent=money.format(getPurchaseDraft().total)}
function resetRevenueForm(){state.editingRevenueDate=null;$('#revenueEditBadge').classList.add('hidden');$('#revenueSubmitBtn').textContent='Lưu';$('#revenueDate').disabled=false;$('#revenueDate').value=todayISO();['#cash','#transfer','#dailyExpense','#partTimeSalary'].forEach(i=>$(i).value='');updateRevenueLive()}
function resetPurchaseForm(){state.editingPurchaseId=null;$('#purchaseEditBadge').classList.add('hidden');$('#purchaseSubmitBtn').textContent='Lưu';$('#purchaseDate').value=todayISO();['#mtfVat','#mtfNone','#otherPurchase','#customContent'].forEach(i=>$(i).value='');$('#purchaseContentSelect').value='';$('#customContentWrap').classList.add('hidden');updatePurchaseLive()}
function renderPurchaseOptions(){const s=$('#purchaseContentSelect'),cur=s.value;s.innerHTML='<option value="">Chọn nội dung đã lưu</option>'+state.purchaseContents.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')+'<option value="__custom__">Tự điền nội dung mới</option>';if([...s.options].some(o=>o.value===cur))s.value=cur;renderComparisonContentOptions()}

function revenueTotals(rows){return rows.reduce((a,r)=>{['cash','transfer','dailyExpense','partTimeSalary','storeExpense','totalRevenue'].forEach(k=>a[k]+=Number(r[k])||0);return a},{cash:0,transfer:0,dailyExpense:0,partTimeSalary:0,storeExpense:0,totalRevenue:0})}
function purchaseTotals(rows){return rows.reduce((a,r)=>{a.mtfVat+=Number(r.mtfVat)||0;a.mtfNone+=Number(r.mtfNone)||0;a.otherPurchase+=Number(r.otherPurchase)||0;a.total+=Number(r.total)||0;return a},{mtfVat:0,mtfNone:0,otherPurchase:0,total:0})}
function summaryForRange(start,end){const rs=state.revenues.filter(r=>r.date>=start&&r.date<=end),ps=state.purchases.filter(p=>p.date>=start&&p.date<=end),rt=revenueTotals(rs),pt=purchaseTotals(ps);return{...rt,mtfVat:pt.mtfVat,mtfNone:pt.mtfNone,otherPurchase:pt.otherPurchase,purchaseTotal:pt.total,totalExpense:rt.storeExpense+pt.total,profit:rt.totalRevenue-(rt.storeExpense+pt.total),revenues:rs,purchases:ps}}
function getInventoryForMonth(month){return state.inventories.find(x=>x.month===month)||null}
function getMonthlySummary(month){const last=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),s=summaryForRange(`${month}-01`,`${month}-${String(last).padStart(2,'0')}`),inv=getInventoryForMonth(month);return{...s,inventoryTotal:Number(inv?.total)||0,inventoryMtfVat:Number(inv?.mtfVatTotal)||0,inventoryOther:Number(inv?.otherTotal)||0,actualProfit:s.profit+(Number(inv?.total)||0)}}
function summaryForDay(day){return summaryForRange(day,day)}
function kpiHtml(s){return`<article class="report-highlight revenue"><span>Tổng thu</span><strong>${money.format(s.totalRevenue)}</strong></article><article class="report-highlight expense"><span>Tổng chi</span><strong>${money.format(s.totalExpense)}</strong></article><article class="report-highlight profit"><span>Lợi nhuận</span><strong>${money.format(s.profit)}</strong></article>`}
function renderRows(sel,rows){$(sel).innerHTML=rows.map(([l,v])=>`<div class="report-row"><span>${l}</span><strong>${money.format(v)}</strong></div>`).join('')}
function rowButtons(type,id){return`<div class="row-actions"><button class="mini-btn edit" data-edit-${type}="${escapeHtml(id)}" type="button">Sửa</button><button class="mini-btn danger" data-delete-${type}="${escapeHtml(id)}" type="button">Xóa</button></div>`}

function inferPurchaseType(p){if(p?.systemType==='inventoryCarryover')return 'CARRY_OVER';if(p?.orderId)return Number(p.mtfVat)>0?'MTF_VAT':'MTF';if(Number(p?.mtfVat)>0&&Number(p?.mtfNone)===0&&Number(p?.otherPurchase)===0)return 'MTF_VAT';if(Number(p?.mtfNone)>0&&Number(p?.mtfVat)===0&&Number(p?.otherPurchase)===0)return 'MTF';return 'WORKING_CAPITAL'}
function purchaseDisplayContent(p){const type=p.purchaseType||inferPurchaseType(p);if(type==='MTF_VAT')return p.content||'MTF VAT';if(type==='MTF')return p.content||'MTF';if(type==='CARRY_OVER')return p.content||'Chuyển tồn đầu kỳ';return p.content||'Mua hàng khác'}
function purchaseTypeLabel(p){const type=p.purchaseType||inferPurchaseType(p);return({MTF_VAT:'MTF VAT',MTF:'MTF',CARRY_OVER:'Chuyển tồn',WORKING_CAPITAL:'Vốn lưu động'})[type]||'Vốn lưu động'}
function purchaseActions(p){const type=p.purchaseType||inferPurchaseType(p);if(p.orderId)return`<div class="row-actions"><button class="mini-btn edit" data-view-order="${escapeHtml(p.orderId)}" type="button">Xem đơn</button><button class="mini-btn danger" data-delete-purchase="${escapeHtml(p.id)}" type="button">Xóa</button></div>`;if(type==='CARRY_OVER')return'<span class="system-row-badge">Hệ thống</span>';return rowButtons('purchase',p.id)}

function renderLatest(){const r=[...state.revenues].sort((a,b)=>b.date.localeCompare(a.date))[0];$('#revenueCount').textContent=`${state.revenues.length} ngày`;$('#revenueLatestBody').innerHTML=r?`<tr><td>${formatDate(r.date)}</td><td><strong>${money.format(r.totalRevenue)}</strong></td><td>${money.format(r.cash)}</td><td>${money.format(r.transfer)}</td><td>${money.format(r.dailyExpense)}</td><td>${money.format(r.partTimeSalary)}</td><td>${money.format(r.storeExpense)}</td><td>${rowButtons('revenue',r.date)}</td></tr>`:'<tr class="empty-row"><td colspan="8">Chưa có dữ liệu doanh thu.</td></tr>';const p=[...state.purchases].sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date))[0];$('#purchaseCount').textContent=`${state.purchases.length} dòng`;$('#purchaseLatestBody').innerHTML=p?`<tr><td>${formatDate(p.date)}</td><td class="purchase-content-cell"><strong>${escapeHtml(purchaseDisplayContent(p))}</strong><small>${purchaseTypeLabel(p)}</small></td><td><strong>${money.format(p.total)}</strong></td><td>${purchaseActions(p)}</td></tr>`:'<tr class="empty-row"><td colspan="4">Chưa có dữ liệu mua hàng.</td></tr>'}

function renderHome(){const s=getMonthlySummary(currentMonthISO());$('#homeRevenue').textContent=money.format(s.totalRevenue);$('#homeExpense').textContent=money.format(s.totalExpense);$('#homeProfit').textContent=money.format(s.actualProfit)}

function openList(type){state.listType=type;state.returnView=type==='revenue'?'revenueView':'purchaseView';$('#listMonth').value=(type==='revenue'?$('#revenueDate').value:$('#purchaseDate').value).slice(0,7)||currentMonthISO();showView('listView');renderList()}
function renderList(){const month=$('#listMonth').value||currentMonthISO(),table=$('#listDataTable');table?.classList.toggle('purchase-list-table',state.listType==='purchase');table?.classList.toggle('revenue-list-table',state.listType==='revenue');if(state.listType==='revenue'){const rows=state.revenues.filter(r=>r.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date)),t=revenueTotals(rows);$('#listTitle').textContent='Danh sách doanh thu';$('#listSubtitle').textContent=`Dữ liệu tháng ${formatMonth(month)}`;$('#listCount').textContent=`${rows.length} ngày`;$('#listHead').innerHTML='<tr><th>Ngày</th><th>Tổng</th><th>Tiền mặt</th><th>CK</th><th>Chi nhỏ</th><th>Lương PT</th><th>Chi CH</th><th></th></tr>';$('#listBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${formatDate(r.date)}</td><td><strong>${money.format(r.totalRevenue)}</strong></td><td>${money.format(r.cash)}</td><td>${money.format(r.transfer)}</td><td>${money.format(r.dailyExpense)}</td><td>${money.format(r.partTimeSalary)}</td><td>${money.format(r.storeExpense)}</td><td>${rowButtons('revenue',r.date)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="8">Không có dữ liệu.</td></tr>';$('#listFoot').innerHTML=rows.length?`<tr><td>Tổng</td><td>${money.format(t.totalRevenue)}</td><td>${money.format(t.cash)}</td><td>${money.format(t.transfer)}</td><td>${money.format(t.dailyExpense)}</td><td>${money.format(t.partTimeSalary)}</td><td>${money.format(t.storeExpense)}</td><td></td></tr>`:''}else{const rows=state.purchases.filter(p=>p.date.startsWith(month)).sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date)),t=purchaseTotals(rows);$('#listTitle').textContent='Danh sách mua hàng / vốn lưu động';$('#listSubtitle').textContent=`Dữ liệu tháng ${formatMonth(month)}`;$('#listCount').textContent=`${rows.length} dòng`;$('#listHead').innerHTML='<tr><th>Ngày</th><th>Nội dung mua hàng</th><th>Số tiền</th><th></th></tr>';$('#listBody').innerHTML=rows.length?rows.map(p=>`<tr><td>${formatDate(p.date)}</td><td class="purchase-content-cell"><strong>${escapeHtml(purchaseDisplayContent(p))}</strong><small>${purchaseTypeLabel(p)}</small></td><td><strong>${money.format(p.total)}</strong></td><td>${purchaseActions(p)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="4">Không có dữ liệu.</td></tr>';$('#listFoot').innerHTML=rows.length?`<tr><td colspan="2">Tổng chi vốn lưu động</td><td>${money.format(t.total)}</td><td></td></tr>`:''}}

function editRevenue(date){const r=state.revenues.find(x=>x.date===date);if(!r)return;state.editingRevenueDate=date;showView('revenueView');$('#revenueEditBadge').classList.remove('hidden');$('#revenueSubmitBtn').textContent='Cập nhật';$('#revenueDate').value=r.date;$('#revenueDate').disabled=true;setMoney('#cash',r.cash);setMoney('#transfer',r.transfer);setMoney('#dailyExpense',r.dailyExpense);setMoney('#partTimeSalary',r.partTimeSalary);updateRevenueLive()}
function editPurchase(id){const p=state.purchases.find(x=>x.id===id);if(!p)return;if(p.orderId){viewSavedOrder(p.orderId);return}if((p.purchaseType||inferPurchaseType(p))==='CARRY_OVER'){alert('Dòng chuyển tồn được tạo tự động. Hãy sửa kỳ kiểm kê tháng trước.');return}state.editingPurchaseId=id;showView('purchaseView');$('#purchaseEditBadge').classList.remove('hidden');$('#purchaseSubmitBtn').textContent='Cập nhật';$('#purchaseDate').value=p.date;setMoney('#mtfVat',p.mtfVat);setMoney('#mtfNone',p.mtfNone);setMoney('#otherPurchase',p.otherPurchase);renderPurchaseOptions();if(state.purchaseContents.includes(p.content)){$('#purchaseContentSelect').value=p.content;$('#customContentWrap').classList.add('hidden')}else{$('#purchaseContentSelect').value='__custom__';$('#customContent').value=p.content||'';$('#customContentWrap').classList.remove('hidden')}updatePurchaseLive()}
async function deleteRevenue(date){if(!(await confirmAction(`Xóa dữ liệu doanh thu ngày ${formatDate(date)}?`)))return;state.revenues=state.revenues.filter(r=>r.date!==date);save();renderAll();if($('#listView').classList.contains('active'))renderList()}
async function deletePurchase(id){const p=state.purchases.find(x=>x.id===id);if(!p)return;const linkedOrder=p.orderId?state.orders.find(o=>o.id===p.orderId):null;const message=linkedOrder?`Xóa khoản mua ${p.content||''} ngày ${formatDate(p.date)}? Đơn MTF liên kết cũng sẽ bị xóa hoàn toàn.`:`Xóa khoản mua ${p.content||''} ngày ${formatDate(p.date)}?`;if(!(await confirmAction(message)))return;state.purchases=state.purchases.filter(x=>x.id!==id);if(linkedOrder){state.orders=state.orders.filter(o=>o.id!==p.orderId);if(state.currentOrderDraftId===p.orderId)clearOrderReview()}save();renderAll();renderOrderLatest();if($('#listView').classList.contains('active'))renderList()}

function renderDayReport(){const d=$('#reportDay').value||todayISO(),s=summaryForDay(d);$('#dayKpis').innerHTML=kpiHtml(s);renderRows('#dayRevenueRows',[["Tiền mặt",s.cash],["Chuyển khoản",s.transfer],["Chi nhỏ lẻ",s.dailyExpense],["Lương part-time",s.partTimeSalary],["Tổng chi cửa hàng",s.storeExpense],["Tổng doanh thu",s.totalRevenue]]);renderRows('#dayPurchaseRows',[["MTF VAT",s.mtfVat],["MTF",s.mtfNone],["Mua hàng khác / vốn lưu động",s.otherPurchase],["Tổng chi vốn lưu động",s.purchaseTotal]]);$('#dayPurchaseList').innerHTML=s.purchases.length?s.purchases.map(p=>`<tr><td>${formatDate(p.date)}</td><td class="purchase-content-cell"><strong>${escapeHtml(purchaseDisplayContent(p))}</strong><small>${purchaseTypeLabel(p)}</small></td><td><strong>${money.format(p.total)}</strong></td><td>${purchaseActions(p)}</td></tr>`).join(''):'<tr class="empty-row"><td colspan="4">Không có khoản mua trong ngày.</td></tr>'}
function weekBounds(dateStr){const d=new Date(`${dateStr}T12:00:00`),day=(d.getDay()+6)%7,start=new Date(d);start.setDate(d.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+6);return{start:localISO(start),end:localISO(end)}}
function dailySummary(date){return summaryForDay(date)}
function renderWeekReport(){const b=weekBounds($('#reportWeekDate').value||todayISO()),s=summaryForRange(b.start,b.end);$('#weekRangeLabel').textContent=`${formatDate(b.start)} – ${formatDate(b.end)}`;$('#weekKpis').innerHTML=kpiHtml(s);const days=[];for(let i=0;i<7;i++){const d=new Date(`${b.start}T12:00:00`);d.setDate(d.getDate()+i);const iso=localISO(d);days.push({date:iso,...dailySummary(iso)})}$('#weekTableBody').innerHTML=days.map(x=>`<tr><td>${formatDate(x.date)}</td><td>${money.format(x.totalRevenue)}</td><td>${money.format(x.totalExpense)}</td><td><strong>${money.format(x.profit)}</strong></td><td>${money.format(x.purchaseTotal)}</td></tr>`).join('');renderBarChart('#weekChart',days.map(x=>({label:formatDate(x.date).slice(0,5),value:x[$('#weekMetric').value]})),true)}
function contentSummary(month){const map=new Map();state.purchases.filter(p=>p.date.startsWith(month)).forEach(p=>{const k=p.content||'Không nội dung',x=map.get(k)||{content:k,count:0,mtfVat:0,mtfNone:0,otherPurchase:0,total:0};x.count++;x.mtfVat+=Number(p.mtfVat)||0;x.mtfNone+=Number(p.mtfNone)||0;x.otherPurchase+=Number(p.otherPurchase)||0;x.total+=Number(p.total)||0;map.set(k,x)});return[...map.values()].sort((a,b)=>b.total-a.total)}
function renderMonthReport(){const m=$('#reportMonth').value||currentMonthISO(),s=getMonthlySummary(m);$('#monthKpis').innerHTML=`<article class="report-highlight revenue"><span>Tổng thu</span><strong>${money.format(s.totalRevenue)}</strong></article><article class="report-highlight expense"><span>Tổng chi</span><strong>${money.format(s.totalExpense)}</strong></article><article class="report-highlight profit"><span>Lợi nhuận thực tế</span><strong>${money.format(s.actualProfit)}</strong></article>`;$('#monthRevenueTotal').textContent=money.format(s.totalRevenue);$('#monthStoreTotal').textContent=money.format(s.storeExpense);$('#monthPurchaseTotal').textContent=money.format(s.purchaseTotal);$('#monthProfitTotal').textContent=money.format(s.actualProfit);renderRows('#monthRevenueRows',[["Tiền mặt",s.cash],["Chuyển khoản",s.transfer],["Chi cửa hàng đã dùng trong ngày",s.storeExpense],["Tổng doanh thu",s.totalRevenue]]);renderRows('#monthStoreRows',[["Chi nhỏ lẻ",s.dailyExpense],["Lương part-time",s.partTimeSalary],["Tổng chi cửa hàng",s.storeExpense]]);renderRows('#monthPurchaseRows',[["MTF VAT",s.mtfVat],["MTF",s.mtfNone],["Mua hàng khác / vốn lưu động",s.otherPurchase],["Tổng chi vốn lưu động",s.purchaseTotal]]);renderRows('#monthResultRows',[["Tổng doanh thu",s.totalRevenue],["Tổng chi",s.totalExpense],["Lợi nhuận tạm tính",s.profit],["Hàng tồn cuối tháng",s.inventoryTotal],["Lợi nhuận thực tế",s.actualProfit]]);const rows=contentSummary(m);$('#contentSummaryBody').innerHTML=rows.length?rows.map(x=>`<tr><td>${escapeHtml(x.content)}</td><td>${x.count}</td><td>${money.format(x.mtfVat)}</td><td>${money.format(x.mtfNone)}</td><td>${money.format(x.otherPurchase)}</td><td><strong>${money.format(x.total)}</strong></td></tr>`).join(''):'<tr class="empty-row"><td colspan="6">Chưa có dữ liệu nội dung.</td></tr>'}
function renderComparisonContentOptions(){const s=$('#comparisonContent');if(!s)return;const cur=s.value;s.innerHTML='<option value="">Tất cả nội dung</option>'+state.purchaseContents.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');if([...s.options].some(o=>o.value===cur))s.value=cur}
function comparisonValue(month,key,content){if(content){const rows=state.purchases.filter(p=>p.date.startsWith(month)&&p.content===content);const t=purchaseTotals(rows);return key==='mtfVat'?t.mtfVat:key==='mtfNone'?t.mtfNone:key==='otherPurchase'?t.otherPurchase:t.total}return Number(getMonthlySummary(month)[key])||0}
function renderBarChart(sel,points,seven=false){const max=Math.max(...points.map(p=>Math.abs(p.value)),1);$(sel).innerHTML=points.map(p=>{const h=Math.max(4,Math.round(Math.abs(p.value)/max*100));return`<div class="bar-item ${p.value<0?'negative':''}"><div class="bar-value" title="${money.format(p.value)}">${compactMoney.format(p.value)} ₫</div><div class="bar-track"><div class="bar-fill" style="height:${h}%"></div></div><div class="bar-label">${p.label}</div></div>`}).join('')}
function pct(a,b){if(!a&&!b)return 0;if(!a)return 100;return((b-a)/Math.abs(a))*100}
function renderComparison(){const base=$('#compareMonth').value||currentMonthISO(),key=$('#comparisonMetric').value,content=$('#comparisonContent').value,defs={totalRevenue:'Tổng thu',totalExpense:'Tổng chi',profit:'Lợi nhuận',mtfVat:'MTF VAT',mtfNone:'MTF None',otherPurchase:'Mua hàng khác / vốn lưu động',purchaseTotal:'Tổng chi vốn lưu động'},months=[shiftMonth(base,-2),shiftMonth(base,-1),base],vals=months.map(m=>comparisonValue(m,key,content));$('#comparisonTitle').textContent=`${defs[key]}${content?` – ${content}`:''}`;renderBarChart('#comparisonChart',months.map((m,i)=>({label:formatMonth(m),value:vals[i]})));const c1=pct(vals[0],vals[1]),c2=pct(vals[1],vals[2]);$('#comparisonChanges').innerHTML=`<div class="change-card"><span>${formatMonth(months[0])}</span><strong>${money.format(vals[0])}</strong></div><div class="change-card"><span>${formatMonth(months[1])} so tháng trước</span><strong class="${c1>=0?'positive':'negative-text'}">${c1>=0?'+':''}${c1.toFixed(1)}%</strong></div><div class="change-card"><span>${formatMonth(months[2])} so tháng trước</span><strong class="${c2>=0?'positive':'negative-text'}">${c2>=0?'+':''}${c2.toFixed(1)}%</strong></div>`;months.forEach((m,i)=>$(`#compareHead${i+1}`).textContent=formatMonth(m));const keys=[['Tổng thu','totalRevenue'],['Tổng chi','totalExpense'],['Lợi nhuận','profit'],['MTF VAT','mtfVat'],['MTF','mtfNone'],['Mua hàng khác / vốn lưu động','otherPurchase'],['Tổng chi vốn lưu động','purchaseTotal']];$('#comparisonTableBody').innerHTML=keys.map(([l,k])=>`<tr><td>${l}</td>${months.map(m=>`<td>${money.format(comparisonValue(m,k,content))}</td>`).join('')}</tr>`).join('')}
function safeFileName(value){return String(value||'BDHS').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'BDHS'}
function businessName(){return String(state.settings?.businessName||state.buyer?.shopName||'BDHS Sóc Xoài').trim()||'BDHS Sóc Xoài'}
function hexToRgba(hex,alpha=1){const h=String(hex||'#1f3a5f').replace('#','');const n=parseInt(h.length===3?h.split('').map(x=>x+x).join(''):h,16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`}
function orderDesign(){const s=state.settings||{};const legacy=s.orderPrimaryColor||'#1f3a5f';return{header:s.orderHeaderColor||legacy,footer:s.orderFooterColor||legacy,border:s.orderBorderColor||legacy,branch:s.orderBranchTextColor||legacy,vat:'#dc2626',novat:'#059669',layout:s.orderLayout||'compact'}}
function syncBusinessName(){const name=businessName();if($('#appBusinessName'))$('#appBusinessName').textContent=name;if($('#businessName'))$('#businessName').value=name;if($('#orderDesignPreviewName'))$('#orderDesignPreviewName').textContent=name;document.title=`${name} V2.3.5`;state.buyer.shopName=name}
function updateOrderDesignPreview(){const d=orderDesign(),box=$('#orderDesignPreview');if(!box)return;box.style.setProperty('--order-header',d.header);box.style.setProperty('--order-footer',d.footer);box.style.setProperty('--order-border',d.border);box.style.setProperty('--order-branch',d.branch);box.dataset.layout=d.layout;if($('#orderDesignPreviewType'))$('#orderDesignPreviewType').style.color=d.vat}
function applySettings(){
  const s=state.settings||{};
  document.body.dataset.theme=s.theme||'sunrise';
  document.documentElement.style.setProperty('--surface-alpha',String((Number(s.surfaceOpacity)||94)/100));
  const bgOpacity=Math.max(10,Math.min(100,Number(s.backgroundOpacity)||35))/100;
  if(s.backgroundImage){const veil=(1-bgOpacity)*.88;document.body.style.backgroundImage=`linear-gradient(135deg,rgba(238,242,255,${veil}),rgba(236,254,255,${Math.max(.08,veil-.06)}) 45%,rgba(255,247,237,${veil})),url("${s.backgroundImage}")`;}
  else document.body.style.backgroundImage='';
  if($('#themeSelect'))$('#themeSelect').value=s.theme||'sunrise';
  if($('#surfaceOpacity'))$('#surfaceOpacity').value=Number(s.surfaceOpacity)||94;
  if($('#opacityValue'))$('#opacityValue').textContent=`${Number(s.surfaceOpacity)||94}%`;
  if($('#backgroundOpacity'))$('#backgroundOpacity').value=Number(s.backgroundOpacity)||35;
  if($('#backgroundOpacityValue'))$('#backgroundOpacityValue').textContent=`${Number(s.backgroundOpacity)||35}%`;
  if($('#autoSync'))$('#autoSync').checked=Boolean(s.autoSync);
  const od=orderDesign();if($('#orderHeaderColor'))$('#orderHeaderColor').value=od.header;if($('#orderFooterColor'))$('#orderFooterColor').value=od.footer;if($('#orderBorderColor'))$('#orderBorderColor').value=od.border;if($('#orderBranchTextColor'))$('#orderBranchTextColor').value=od.branch;
  if($('#orderLayout'))$('#orderLayout').value=s.orderLayout||'compact';
  const sizeMap={small:'92px',medium:'102px',large:'112px'},shadowMap={soft:'0 13px 28px rgba(15,23,42,.14),inset 0 1px 0 rgba(255,255,255,.78)',medium:'0 16px 32px rgba(15,23,42,.19),inset 0 1px 0 rgba(255,255,255,.82)',strong:'0 20px 38px rgba(15,23,42,.25),inset 0 1px 0 rgba(255,255,255,.86)'};
  const homeSize=s.homeCardSize||'medium',homeCols=String(s.homeColumns||'3'),homeShadow=s.homeShadow||'soft',homeRadius=String(s.homeRadius||'22'),homeOpacity=Number(s.homeCardOpacity)||94;
  const labelMap={small:'12px',medium:'13px',large:'14px'},iconMap={small:'42px',medium:'46px',large:'50px'};
  document.documentElement.style.setProperty('--home-card-size',sizeMap[homeSize]||sizeMap.medium);
  document.documentElement.style.setProperty('--home-label-size',labelMap[homeSize]||labelMap.medium);
  document.documentElement.style.setProperty('--home-icon-size',iconMap[homeSize]||iconMap.medium);
  document.documentElement.style.setProperty('--home-columns',homeCols);
  document.documentElement.style.setProperty('--home-card-shadow',shadowMap[homeShadow]||shadowMap.soft);
  document.documentElement.style.setProperty('--home-card-radius',`${homeRadius}px`);
  document.documentElement.style.setProperty('--home-card-opacity',String(homeOpacity/100));
  if($('#homeCardSize'))$('#homeCardSize').value=homeSize;if($('#homeColumns'))$('#homeColumns').value=homeCols;if($('#homeShadow'))$('#homeShadow').value=homeShadow;if($('#homeRadius'))$('#homeRadius').value=homeRadius;if($('#homeCardOpacity'))$('#homeCardOpacity').value=homeOpacity;if($('#homeOpacityValue'))$('#homeOpacityValue').textContent=`${homeOpacity}%`;
  syncBusinessName();updateOrderDesignPreview();
  const p=$('#backgroundPreview');if(p){p.style.backgroundImage=s.backgroundImage?`url("${s.backgroundImage}")`:'';p.classList.toggle('has-image',Boolean(s.backgroundImage));p.innerHTML=`<span>${s.backgroundImage?'Hình nền hiện tại':'Chưa chọn hình nền'}</span>`;}
}
function saveSettings(){save();applySettings()}
function downloadBackup(){const payload={app:businessName(),version:'2.3.5-ui-polish',createdAt:new Date().toISOString(),revenues:state.revenues,purchases:state.purchases,purchaseContents:state.purchaseContents,settings:state.settings,orders:state.orders,products:state.products,buyer:state.buyer,inventories:state.inventories,inventoryCatalog:state.inventoryCatalog};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeFileName(businessName())}_backup_${todayISO()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);$('#backupStatus').textContent=`Đã tạo backup lúc ${new Date().toLocaleTimeString('vi-VN')}.`}
async function restoreBackupFile(file){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.revenues)||!Array.isArray(data.purchases))throw new Error('invalid');if(!(await confirmAction('Khôi phục file này sẽ thay thế dữ liệu hiện tại. Tiếp tục?')))return;state.revenues=data.revenues;state.purchases=data.purchases;state.purchaseContents=Array.isArray(data.purchaseContents)?data.purchaseContents:state.purchaseContents;state.settings={...state.settings,...(data.settings||{})};state.inventories=Array.isArray(data.inventories)?data.inventories:state.inventories;state.inventoryCatalog=Array.isArray(data.inventoryCatalog)?data.inventoryCatalog:state.inventoryCatalog;save();normalizeData();applySettings();renderAll();$('#backupStatus').textContent='Khôi phục dữ liệu thành công.'}catch{$('#backupStatus').textContent='File backup không hợp lệ hoặc bị lỗi.'}}
function renderAllReports(){renderDayReport();renderWeekReport();renderMonthReport();renderComparison()}
function renderAll(){renderLatest();renderPurchaseOptions();renderHome();renderAllReports()}

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>navigateTo(b.dataset.view)));$('#homeBtn').addEventListener('click',()=>navigateTo('homeView'));$('#confirmYes').addEventListener('click',()=>closeConfirm(true));$('#confirmNo').addEventListener('click',()=>closeConfirm(false));
$$('.money-input').forEach(i=>{i.addEventListener('input',()=>{formatMoneyInput(i);['cash','transfer','dailyExpense','partTimeSalary'].includes(i.id)&&updateRevenueLive();['mtfVat','mtfNone','otherPurchase'].includes(i.id)&&updatePurchaseLive()});i.addEventListener('focus',()=>i.select())});
$('#purchaseContentSelect').addEventListener('change',e=>{$('#customContentWrap').classList.toggle('hidden',e.target.value!=='__custom__');if(e.target.value==='__custom__')$('#customContent').focus()});
$('#revenueForm').addEventListener('submit',async e=>{e.preventDefault();const date=$('#revenueDate').value;if(!date)return;if(!(await confirmAction(state.editingRevenueDate?'Cập nhật dữ liệu doanh thu này?':'Lưu dữ liệu doanh thu ngày đã chọn?')))return;const rec={date,...getRevenueDraft(),updatedAt:new Date().toISOString()},idx=state.revenues.findIndex(r=>r.date===date);if(idx>=0)state.revenues[idx]=rec;else state.revenues.push(rec);save();clearDirty('revenue');clearLocalDraft('revenue');renderAll();resetRevenueForm()});
$('#purchaseForm').addEventListener('submit',async e=>{e.preventDefault();const date=$('#purchaseDate').value,content=getPurchaseContent();if(!date)return;if(!(await confirmAction(state.editingPurchaseId?'Cập nhật khoản mua này?':'Lưu dữ liệu mua hàng vừa nhập?')))return;const draft=getPurchaseDraft(),purchaseType=inferPurchaseType(draft);if(state.editingPurchaseId){const idx=state.purchases.findIndex(p=>p.id===state.editingPurchaseId);if(idx>=0)state.purchases[idx]={...state.purchases[idx],date,content,purchaseType,...draft,updatedAt:new Date().toISOString()}}else state.purchases.push({id:uid(),date,content,purchaseType,...draft,createdAt:new Date().toISOString()});if(content&&!state.purchaseContents.some(x=>x.toLowerCase()===content.toLowerCase())){state.purchaseContents.push(content);state.purchaseContents.sort((a,b)=>a.localeCompare(b,'vi'))}save();clearDirty('purchase');clearLocalDraft('purchase');renderAll();resetPurchaseForm()});
$('#cancelRevenue').addEventListener('click',async()=>{if(await confirmAction('Hủy dữ liệu đang nhập?')){clearDirty('revenue');clearLocalDraft('revenue');resetRevenueForm();showView('homeView')}});$('#cancelPurchase').addEventListener('click',async()=>{if(await confirmAction('Hủy dữ liệu đang nhập?')){clearDirty('purchase');clearLocalDraft('purchase');resetPurchaseForm();showView('homeView')}});$('#resetRevenue').addEventListener('click',()=>{clearDirty('revenue');clearLocalDraft('revenue');resetRevenueForm()});$('#resetPurchase').addEventListener('click',()=>{clearDirty('purchase');clearLocalDraft('purchase');resetPurchaseForm()});
$('#openRevenueList').addEventListener('click',()=>guardedOpenList('revenue'));$('#openPurchaseList').addEventListener('click',()=>guardedOpenList('purchase'));$('#backFromList').addEventListener('click',()=>navigateTo(state.returnView));
$('#listMonth').addEventListener('change',renderList);$('#listMonthPrev').addEventListener('click',()=>{$('#listMonth').value=shiftMonth($('#listMonth').value,-1);renderList()});$('#listMonthNext').addEventListener('click',()=>{$('#listMonth').value=shiftMonth($('#listMonth').value,1);renderList()});$('#listMonthCurrent').addEventListener('click',()=>{$('#listMonth').value=currentMonthISO();renderList()});
$$('[data-report]').forEach(b=>b.addEventListener('click',()=>{$$('[data-report]').forEach(x=>x.classList.toggle('active',x===b));$$('.report-panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.report));renderAllReports()}));
$('#reportDay').addEventListener('change',renderDayReport);$('#reportWeekDate').addEventListener('change',renderWeekReport);$('#weekMetric').addEventListener('change',renderWeekReport);$('#reportMonth').addEventListener('change',renderMonthReport);$('#monthPrev').addEventListener('click',()=>{$('#reportMonth').value=shiftMonth($('#reportMonth').value,-1);renderMonthReport()});$('#monthNext').addEventListener('click',()=>{$('#reportMonth').value=shiftMonth($('#reportMonth').value,1);renderMonthReport()});$('#monthCurrent').addEventListener('click',()=>{$('#reportMonth').value=currentMonthISO();renderMonthReport()});$('#toggleMonthStore').addEventListener('click',()=>{const e=$('#toggleMonthStore').getAttribute('aria-expanded')==='true';$('#toggleMonthStore').setAttribute('aria-expanded',String(!e));$('#monthStoreRows').classList.toggle('hidden',e)});$('#compareMonth').addEventListener('change',renderComparison);$('#comparisonMetric').addEventListener('change',renderComparison);$('#comparisonContent').addEventListener('change',renderComparison);
$('#saveBusinessName')?.addEventListener('click',()=>{const name=$('#businessName').value.trim();if(!name){alert('Vui lòng nhập tên cửa hàng hoặc chi nhánh.');return}state.settings.businessName=name;state.buyer.shopName=name;save();applySettings();fillBuyerSettings();alert('Đã lưu tên chi nhánh. Tên này sẽ dùng cho phiếu và file xuất dữ liệu.');});
['orderHeaderColor','orderFooterColor','orderBorderColor','orderBranchTextColor','orderLayout'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{state.settings.orderHeaderColor=$('#orderHeaderColor').value;state.settings.orderFooterColor=$('#orderFooterColor').value;state.settings.orderBorderColor=$('#orderBorderColor').value;state.settings.orderBranchTextColor=$('#orderBranchTextColor').value;state.settings.orderLayout=$('#orderLayout').value;updateOrderDesignPreview()}));
$('#saveOrderDesign')?.addEventListener('click',()=>{state.settings.orderHeaderColor=$('#orderHeaderColor').value;state.settings.orderFooterColor=$('#orderFooterColor').value;state.settings.orderBorderColor=$('#orderBorderColor').value;state.settings.orderBranchTextColor=$('#orderBranchTextColor').value;state.settings.orderLayout=$('#orderLayout').value;saveSettings();alert('Đã lưu màu sắc và bố cục phiếu đặt hàng.');});
$('#themeSelect').addEventListener('change',e=>{state.settings.theme=e.target.value;saveSettings()});$('#surfaceOpacity').addEventListener('input',e=>{state.settings.surfaceOpacity=Number(e.target.value);$('#opacityValue').textContent=`${e.target.value}%`;saveSettings()});
['homeCardSize','homeColumns','homeShadow','homeRadius'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{state.settings.homeCardSize=$('#homeCardSize').value;state.settings.homeColumns=$('#homeColumns').value;state.settings.homeShadow=$('#homeShadow').value;state.settings.homeRadius=$('#homeRadius').value;applySettings()}));
$('#homeCardOpacity')?.addEventListener('input',e=>{state.settings.homeCardOpacity=Number(e.target.value);$('#homeOpacityValue').textContent=`${e.target.value}%`;applySettings()});
$('#saveHomeUI')?.addEventListener('click',()=>{state.settings.homeCardSize=$('#homeCardSize').value;state.settings.homeColumns=$('#homeColumns').value;state.settings.homeShadow=$('#homeShadow').value;state.settings.homeRadius=$('#homeRadius').value;state.settings.homeCardOpacity=Number($('#homeCardOpacity').value);saveSettings();alert('Đã lưu giao diện Home.');});
$('#resetHomeUI')?.addEventListener('click',()=>{Object.assign(state.settings,{homeCardSize:'medium',homeColumns:'3',homeShadow:'soft',homeRadius:'22',homeCardOpacity:94});saveSettings();});
$$('.settings-accordion').forEach(detail=>detail.addEventListener('toggle',()=>{if(!detail.open)return;$$('.settings-accordion').forEach(other=>{if(other!==detail)other.open=false})}));$('#backgroundOpacity')?.addEventListener('input',e=>{state.settings.backgroundOpacity=Number(e.target.value);$('#backgroundOpacityValue').textContent=`${e.target.value}%`;saveSettings()});$('#chooseBackground').addEventListener('click',()=>$('#backgroundFile').click());$('#backgroundFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>4*1024*1024){alert('Hình nền nên nhỏ hơn 4 MB.');e.target.value='';return}const reader=new FileReader();reader.onload=()=>{state.settings.backgroundImage=String(reader.result||'');saveSettings()};reader.readAsDataURL(file)});$('#removeBackground').addEventListener('click',()=>{state.settings.backgroundImage='';saveSettings()});$('#backupData').addEventListener('click',downloadBackup);$('#restoreData').addEventListener('click',()=>$('#restoreFile').click());$('#restoreFile').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)restoreBackupFile(file);e.target.value=''});$('#autoSync')?.addEventListener('change',e=>{state.settings.autoSync=e.target.checked;saveSettings()});
document.addEventListener('click',e=>{const er=e.target.closest('[data-edit-revenue]'),dr=e.target.closest('[data-delete-revenue]'),ep=e.target.closest('[data-edit-purchase]'),dp=e.target.closest('[data-delete-purchase]');if(er)editRevenue(er.dataset.editRevenue);if(dr)deleteRevenue(dr.dataset.deleteRevenue);if(ep)editPurchase(ep.dataset.editPurchase);if(dp)deletePurchase(dp.dataset.deletePurchase)});

normalizeData();applySettings();$('#revenueDate').value=todayISO();$('#purchaseDate').value=todayISO();$('#reportDay').value=todayISO();$('#reportWeekDate').value=todayISO();$('#reportMonth').value=currentMonthISO();$('#compareMonth').value=currentMonthISO();$('#listMonth').value=currentMonthISO();resetRevenueForm();resetPurchaseForm();renderAll();

// V1.8 — Đặt hàng MTF: lưu bảng trước, xác nhận sau
state.currentOrderDraftId = state.currentOrderDraftId || null;
function orderNumber(v){return Math.min(99,Math.max(0,Number(String(v??0).replace(/[^0-9.]/g,''))||0))}
function currentDraft(){return state.orders.find(o=>o.id===state.currentOrderDraftId)||null}
function renderOrderItems(){
  const body=$('#orderItemsBody'); if(!body)return;
  body.innerHTML=state.products.map((p,i)=>`<tr data-order-row="${i}"><td class="item-name">${p.name}</td><td>${p.unit}</td><td>${p.target}</td><td><input class="stock-now qty-input" data-i="${i}" type="text" inputmode="numeric" maxlength="2" value="0"></td><td><input class="order-qty qty-input" data-i="${i}" type="text" inputmode="numeric" maxlength="2" value="${Math.min(99,p.target)}" readonly aria-readonly="true" tabindex="-1"></td><td><input class="order-price money-input-order" data-i="${i}" type="text" inputmode="numeric" value="${new Intl.NumberFormat('vi-VN').format(p.price)}"></td><td class="order-line-total">${money.format(p.target*p.price)}</td></tr>`).join('');
}
function getOrderLines(){return state.products.map((p,i)=>{const row=$(`[data-order-row="${i}"]`);const qty=orderNumber(row?.querySelector('.order-qty')?.value),price=parseMoneyInput(row?.querySelector('.order-price')?.value);return{name:p.name,unit:p.unit,target:p.target,current:orderNumber(row?.querySelector('.stock-now')?.value),qty,price,total:qty*price}})}
function setOrderType(type){state.orderType=type;$('#orderVatBtn').classList.toggle('active',type==='vat');$('#orderNoVatBtn').classList.toggle('active',type==='novat');const title=$('#orderTypeTitle');title.textContent=type==='vat'?'MTF VAT':'MTF';title.className=`order-type-title ${type==='vat'?'vat-label':'novat-label'}`}
function orderPayload(status='draft'){const lines=getOrderLines().filter(x=>x.qty>0),subtotal=lines.reduce((a,x)=>a+x.total,0),vat=state.orderType==='vat'?Math.round(subtotal*.08):0;return{id:state.currentOrderDraftId||uid(),date:$('#orderDate').value||todayISO(),type:state.orderType,status,lines,subtotal,vat,total:subtotal+vat,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function renderOrderPreview(order=currentDraft()){
  const section=$('#orderPreviewSection'); if(!section)return;
  if(!order){section.classList.add('hidden');return}
  section.classList.remove('hidden');
  $('#orderPreviewMeta').textContent=`${formatDate(order.date)} • ${order.lines.length} mặt hàng`;
  const type=$('#orderPreviewType'); type.textContent=order.type==='vat'?'MTF VAT':'MTF';type.className=`order-preview-type ${order.type==='vat'?'vat-label':'novat-label'}`;
  $('#orderPreviewBody').innerHTML=order.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.unit)}</td><td><strong>${l.qty}</strong></td><td>${money.format(l.price)}</td><td>${money.format(l.total)}</td></tr>`).join('');
  $('#orderSubtotal').textContent=money.format(order.subtotal);$('#orderVat').textContent=money.format(order.vat);$('#orderGrandTotal').textContent=money.format(order.total);$('#orderVatCard').classList.toggle('hidden',order.type!=='vat');
  const pending=order.status==='draft';$('#orderPendingWarning').classList.toggle('confirmed',!pending);$('#orderPendingWarning').innerHTML=pending?'<strong>CHƯA XÁC NHẬN ĐÃ ĐẶT</strong><span>Đơn này chưa được lưu sang phần Chi/Mua hàng.</span>':'<strong>ĐÃ XÁC NHẬN ĐẶT HÀNG</strong><span>Đơn đã được lưu sang phần Chi/Mua hàng.</span>';
  $('#confirmOrder').classList.toggle('hidden',!pending);
}
function renderOrderLatest(){
  const b=$('#orderLatestBody');if(!b)return;
  const month=$('#orderHistoryMonth')?.value||currentMonthISO();
  const list=[...state.orders].filter(o=>monthKey(o.date)===month).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
  const confirmed=list.filter(o=>o.status!=='draft');
  const vat=confirmed.filter(o=>o.type==='vat'),novat=confirmed.filter(o=>o.type==='novat');
  const sum=x=>x.reduce((a,o)=>a+(Number(o.total)||0),0);
  $('#orderMonthTotal').textContent=money.format(sum(confirmed));$('#orderMonthCount').textContent=`${confirmed.length} đơn`;
  $('#orderMonthVat').textContent=money.format(sum(vat));$('#orderMonthVatCount').textContent=`${vat.length} đơn`;
  $('#orderMonthNoVat').textContent=money.format(sum(novat));$('#orderMonthNoVatCount').textContent=`${novat.length} đơn`;
  b.innerHTML=list.length?list.map(o=>`<tr><td>${formatDate(o.date)}</td><td class="${o.type==='vat'?'vat-label':'novat-label'}">${o.type==='vat'?'MTF VAT':'MTF'}</td><td>${money.format(o.total)}</td><td class="${o.status==='draft'?'status-unconfirmed':'status-confirmed'}">${o.status==='draft'?'Chưa xác nhận':'Đã xác nhận'}</td><td><button class="table-action view-order-btn" data-view-order="${o.id}" type="button">Xem lại</button></td></tr>`).join(''):'<tr class="empty-row"><td colspan="5">Chưa có đơn trong tháng này.</td></tr>'
}
function resetOrder(){state.currentOrderDraftId=null;renderOrderItems();$('#orderDate').value=todayISO();renderOrderPreview(null)}
function viewSavedOrder(id){
  const order=state.orders.find(o=>o.id===id);if(!order)return;
  state.currentOrderDraftId=order.id;setOrderType(order.type);$('#orderDate').value=order.date;
  renderOrderPreview(order);$('#orderPreviewSection')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function addOrderToPurchases(order){const linked=state.purchases.findIndex(p=>p.orderId===order.id);const rec={id:uid(),orderId:order.id,date:order.date,content:order.type==='vat'?'MTF VAT':'MTF',purchaseType:order.type==='vat'?'MTF_VAT':'MTF',mtfVat:order.type==='vat'?order.total:0,mtfNone:order.type==='novat'?order.total:0,otherPurchase:0,total:order.total,createdAt:new Date().toISOString()};if(linked>=0)state.purchases[linked]={...state.purchases[linked],...rec,id:state.purchases[linked].id};else state.purchases.push(rec)}
async function saveOrderDraft(silent=false){const order=orderPayload('draft');if(!order.lines.length){alert('Không có mặt hàng nào cần đặt.');return}const idx=state.orders.findIndex(o=>o.id===order.id);if(idx>=0)state.orders[idx]={...state.orders[idx],...order};else state.orders.push(order);state.currentOrderDraftId=order.id;save();clearDirty('order');clearLocalDraft('order');renderOrderPreview(order);renderOrderLatest();updateSaveStateUI();if(!silent)alert('Đã lưu bảng đặt hàng. Đơn vẫn chưa ghi sang phần Chi cho đến khi xác nhận đã đặt.');return true}
async function confirmCurrentOrder(){const order=currentDraft();if(!order){alert('Hãy lưu bảng đặt hàng trước.');return}if(!(await confirmAction('Xác nhận đã đặt và lưu tổng tiền sang phần Chi/Mua hàng?')))return;order.status='sent';order.updatedAt=new Date().toISOString();addOrderToPurchases(order);save();clearDirty('order');clearLocalDraft('order');state.currentOrderDraftId=null;renderAll();renderOrderPreview(null);renderOrderLatest();updateSaveStateUI();alert('Đã xác nhận và lưu sang phần Chi/Mua hàng. Có thể xem lại trong danh sách đơn của tháng.');return true}
function fillBuyerSettings(){const b=state.buyer;[['buyerShopName','shopName'],['buyerAddress','address'],['buyerDeliveryPlace','deliveryPlace'],['buyerContact','contact'],['buyerPhone','phone'],['buyerBankAccount','bankAccount'],['buyerBank','bank'],['buyerNote','note'],['invoiceCompanyName','invoiceCompanyName'],['invoiceTaxCode','invoiceTaxCode'],['invoiceAddress','invoiceAddress'],['invoiceEmail','invoiceEmail']].forEach(([id,k])=>{if($('#'+id))$('#'+id).value=b[k]||''})}
function saveBuyer(){const profileShop=$('#buyerShopName').value.trim()||businessName();state.buyer={shopName:profileShop,address:$('#buyerAddress').value.trim(),deliveryPlace:$('#buyerDeliveryPlace').value.trim(),contact:$('#buyerContact').value.trim(),phone:$('#buyerPhone').value.trim(),bankAccount:$('#buyerBankAccount').value.trim(),bank:$('#buyerBank').value.trim(),note:$('#buyerNote').value.trim(),invoiceCompanyName:$('#invoiceCompanyName').value.trim(),invoiceTaxCode:$('#invoiceTaxCode').value.trim(),invoiceAddress:$('#invoiceAddress').value.trim(),invoiceEmail:$('#invoiceEmail').value.trim()};save();clearDirty('buyer');clearLocalDraft('buyer');updateSaveStateUI();alert('Đã lưu thông tin người mua hàng.')}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.stroke()}
function buildOrderCanvas(){
  const order=currentDraft();if(!order){alert('Hãy lưu bảng đặt hàng trước khi xuất ảnh.');return null}
  const design=orderDesign(),layoutMap={compact:{rowH:46,gap:27},balanced:{rowH:56,gap:32},spacious:{rowH:66,gap:38}},lm=layoutMap[design.layout]||layoutMap.compact;
  const hasInvoice=order.type==='vat'&&[state.buyer.invoiceCompanyName,state.buyer.invoiceTaxCode,state.buyer.invoiceAddress,state.buyer.invoiceEmail].some(Boolean);
  const invoiceCount=hasInvoice?[state.buyer.invoiceCompanyName,state.buyer.invoiceTaxCode,state.buyer.invoiceAddress,state.buyer.invoiceEmail].filter(Boolean).length:0;
  const infoLines=5+invoiceCount+(state.buyer.note?2:0)+(state.buyer.bankAccount||state.buyer.bank?1:0);
  const W=1080,rowH=lm.rowH,topBase=178+infoLines*lm.gap,H=topBase+48+order.lines.length*rowH+245,canvas=document.createElement('canvas');
  canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.fillStyle=design.header;c.fillRect(0,0,W,86);
  c.fillStyle=design.footer;c.fillRect(0,H-28,W,28);
  c.strokeStyle=design.border;c.lineWidth=4;c.strokeRect(16,16,W-32,H-32);

  c.textBaseline='alphabetic';c.textAlign='left';c.fillStyle=design.branch;c.font='600 32px Arial';c.fillText(businessName(),54,57);
  c.textAlign='right';c.fillStyle='#fff';c.font='19px Arial';c.fillText(formatDate(order.date),W-54,56);
  c.fillStyle='#111827';c.textAlign='center';c.font='700 34px Arial';c.fillText('ĐƠN ĐẶT HÀNG',W/2,126);

  const drawLine=(yy)=>{c.strokeStyle='#d7dee7';c.lineWidth=1.5;c.beginPath();c.moveTo(54,yy);c.lineTo(W-54,yy);c.stroke()};
  const drawInfo=(label,value,yy,bold=false)=>{if(!value)return yy;c.textAlign='left';c.fillStyle='#334155';c.font=`${bold?'700':'400'} 21px Arial`;c.fillText(`${label}:`,54,yy);c.fillStyle='#111827';c.fillText(String(value),220,yy);return yy+lm.gap};

  let y=172;
  c.font='700 14px Arial';c.fillStyle='#64748b';c.textAlign='left';c.fillText('THÔNG TIN GIAO HÀNG',54,y);y+=22;
  y=drawInfo('Người nhận',state.buyer.contact||'',y,true);
  y=drawInfo('Điện thoại',state.buyer.phone||'',y,true);
  y=drawInfo('Nơi nhận',state.buyer.deliveryPlace||state.buyer.address||'',y,false);
  y+=4;drawLine(y);y+=lm.gap;

  c.textAlign='left';c.font='italic 21px Arial';c.fillStyle=order.type==='vat'?design.vat:design.novat;
  c.fillText(order.type==='vat'?'ĐƠN HÀNG CÓ VAT':'ĐƠN HÀNG KHÔNG VAT',54,y);y+=lm.gap;

  if(hasInvoice){
    c.font='700 14px Arial';c.fillStyle='#64748b';c.fillText('THÔNG TIN XUẤT HÓA ĐƠN',54,y);y+=22;
    y=drawInfo('Tên đơn vị',state.buyer.invoiceCompanyName||'',y,false);
    y=drawInfo('Mã số thuế',state.buyer.invoiceTaxCode||'',y,false);
    y=drawInfo('Địa chỉ',state.buyer.invoiceAddress||'',y,false);
    y=drawInfo('Email HĐĐT',state.buyer.invoiceEmail||'',y,false);
  }
  if(state.buyer.bankAccount||state.buyer.bank){
    y=drawInfo('Thanh toán',[state.buyer.bankAccount,state.buyer.bank].filter(Boolean).join(' - '),y,false);
  }
  if(state.buyer.note){
    y+=2;c.font='italic 19px Arial';c.fillStyle='#475569';c.fillText(`Ghi chú: ${state.buyer.note}`,54,y);y+=lm.gap;
  }
  y+=2;drawLine(y);y+=18;

  const top=y;c.fillStyle=hexToRgba(design.header,.10);c.strokeStyle=design.border;c.lineWidth=2;roundedRect(c,42,top,W-84,48,7);
  c.fillStyle='#1e293b';c.font='700 20px Arial';c.textAlign='left';c.fillText('STT',58,top+31);c.fillText('Hàng hóa',112,top+31);c.textAlign='center';c.fillText('ĐVT',782,top+31);c.fillText('SL đặt',925,top+31);c.textAlign='left';
  order.lines.forEach((l,i)=>{const yy=top+48+i*rowH;c.fillStyle=i%2?'#f8fafc':'#fff';c.fillRect(42,yy,W-84,rowH);c.strokeStyle='#cbd5e1';c.strokeRect(42,yy,W-84,rowH);c.fillStyle='#111827';c.font='21px Arial';c.fillText(String(i+1),62,yy+35);c.fillText(l.name,112,yy+35);c.textAlign='center';c.fillText(l.unit,782,yy+35);c.font='700 23px Arial';c.fillText(String(l.qty),925,yy+35);c.textAlign='left'});
  let by=top+48+order.lines.length*rowH+28;c.font='700 24px Arial';c.fillStyle='#111827';c.fillText(`Tổng số lượng: ${order.lines.reduce((a,l)=>a+l.qty,0)}`,54,by);by+=42;c.textAlign='right';c.font='22px Arial';c.fillText(`Tiền hàng: ${money.format(order.subtotal)}`,W-54,by);if(order.type==='vat'){by+=35;c.fillStyle='#dc2626';c.fillText(`VAT 8%: ${money.format(order.vat)}`,W-54,by)}by+=45;c.fillStyle='#111827';c.font='700 30px Arial';c.fillText(`Tổng tiền: ${money.format(order.total)}`,W-54,by);return canvas
}
function downloadOrderImage(){const canvas=buildOrderCanvas();if(!canvas)return;canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);const o=currentDraft();a.download=`Don_MTF_${o?.type==='vat'?'VAT':'Khong_VAT'}_${o?.date||todayISO()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png')}
async function shareOrderImage(){const canvas=buildOrderCanvas();if(!canvas)return;canvas.toBlob(async blob=>{const o=currentDraft();const file=new File([blob],`Don_MTF_${o?.date||todayISO()}.png`,{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Đơn đặt hàng MTF'})}catch{}}else{downloadOrderImage();alert('Thiết bị chưa hỗ trợ chia sẻ trực tiếp; ảnh đã được xuất để gửi Zalo.')}},'image/png')}

$('#orderVatBtn')?.addEventListener('click',()=>setOrderType('vat'));$('#orderNoVatBtn')?.addEventListener('click',()=>setOrderType('novat'));
$('#orderItemsBody')?.addEventListener('focusin',e=>{if(e.target.classList.contains('stock-now')&&orderNumber(e.target.value)===0)e.target.value=''});
$('#orderItemsBody')?.addEventListener('focusout',e=>{if(e.target.classList.contains('stock-now')&&String(e.target.value).trim()===''){e.target.value='0';e.target.dispatchEvent(new Event('input',{bubbles:true}))}});
$('#orderItemsBody')?.addEventListener('input',e=>{const row=e.target.closest('tr');if(!row)return;const i=Number(row.dataset.orderRow);if(e.target.classList.contains('qty-input')){e.target.value=String(e.target.value).replace(/\D/g,'').slice(0,2);if(e.target.classList.contains('stock-now')){const current=orderNumber(e.target.value);row.querySelector('.order-qty').value=Math.max(0,Math.min(99,state.products[i].target-current))}}if(e.target.classList.contains('money-input-order'))formatMoneyInput(e.target);const qty=orderNumber(row.querySelector('.order-qty').value),price=parseMoneyInput(row.querySelector('.order-price').value);row.querySelector('.order-line-total').textContent=money.format(qty*price);row.classList.toggle('zero-order',qty<=0)});
$('#orderHistoryMonth')?.addEventListener('change',renderOrderLatest);
document.addEventListener('click',e=>{const btn=e.target.closest('[data-view-order]');if(btn)viewSavedOrder(btn.dataset.viewOrder)});
$('#saveOrderDraft')?.addEventListener('click',saveOrderDraft);$('#confirmOrder')?.addEventListener('click',confirmCurrentOrder);$('#resetOrder')?.addEventListener('click',resetOrder);$('#exportOrderImage')?.addEventListener('click',downloadOrderImage);$('#shareOrder')?.addEventListener('click',shareOrderImage);$('#saveBuyerProfile')?.addEventListener('click',saveBuyer);
$('#orderDate').value=todayISO();if($('#orderHistoryMonth'))$('#orderHistoryMonth').value=currentMonthISO();fillBuyerSettings();renderOrderItems();renderOrderLatest();renderOrderPreview();setOrderType(state.orderType);


// V1.11 — bảo vệ dữ liệu chưa lưu, trạng thái lưu và nháp tự động
function activeViewId(){return $('.view.active')?.id||'homeView'}
function scopeForView(view=activeViewId()){return({revenueView:'revenue',purchaseView:'purchase',orderView:'order',settingsView:'buyer'})[view]||null}
function hasUnsaved(scope=scopeForView()){return Boolean(scope&&dirtyState[scope])}
function orderIsPending(){const o=currentDraft();return Boolean(o&&o.status==='draft')}
function updateSaveStateUI(){
  const box=$('#saveStateIndicator'),text=$('#saveStateText');if(!box||!text)return;
  const scope=scopeForView();box.className='save-state saved';let label='Đã lưu';
  if(scope==='order'&&orderIsPending()&&!dirtyState.order){box.className='save-state pending';label='Đã lưu nháp · Chưa xác nhận'}
  if(scope&&dirtyState[scope]){box.className='save-state dirty';label='Chưa lưu'}
  box.classList.toggle('hidden',!scope);text.textContent=label;
}
function markDirty(scope){if(suspendDirty||!scope)return;dirtyState[scope]=true;saveLocalDraft(scope);updateSaveStateUI()}
function clearDirty(scope){if(scope)dirtyState[scope]=false;updateSaveStateUI()}
function readDrafts(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}')}catch{return{}}}
function writeDrafts(v){localStorage.setItem(DRAFT_KEY,JSON.stringify(v))}
function clearLocalDraft(scope){const d=readDrafts();delete d[scope];writeDrafts(d)}
function collectLocalDraft(scope){
  if(scope==='revenue')return{date:$('#revenueDate').value,cash:$('#cash').value,transfer:$('#transfer').value,dailyExpense:$('#dailyExpense').value,partTimeSalary:$('#partTimeSalary').value};
  if(scope==='purchase')return{date:$('#purchaseDate').value,mtfVat:$('#mtfVat').value,mtfNone:$('#mtfNone').value,otherPurchase:$('#otherPurchase').value,content:$('#purchaseContentSelect').value,custom:$('#customContent').value};
  if(scope==='order')return{date:$('#orderDate')?.value,type:state.orderType,items:getOrderLines()};
  if(scope==='buyer')return{shopName:$('#buyerShopName')?.value,address:$('#buyerAddress')?.value,deliveryPlace:$('#buyerDeliveryPlace')?.value,contact:$('#buyerContact')?.value,phone:$('#buyerPhone')?.value,bankAccount:$('#buyerBankAccount')?.value,bank:$('#buyerBank')?.value,note:$('#buyerNote')?.value,invoiceCompanyName:$('#invoiceCompanyName')?.value,invoiceTaxCode:$('#invoiceTaxCode')?.value,invoiceAddress:$('#invoiceAddress')?.value,invoiceEmail:$('#invoiceEmail')?.value};
}
function saveLocalDraft(scope){const d=readDrafts();d[scope]={savedAt:new Date().toISOString(),data:collectLocalDraft(scope)};writeDrafts(d)}
function restoreLocalDraft(scope,p){suspendDirty=true;try{
  if(scope==='revenue'){for(const k of ['date','cash','transfer','dailyExpense','partTimeSalary']){const id={date:'revenueDate'}[k]||k;$('#'+id).value=p[k]||''}updateRevenueLive()}
  if(scope==='purchase'){$('#purchaseDate').value=p.date||todayISO();$('#mtfVat').value=p.mtfVat||'';$('#mtfNone').value=p.mtfNone||'';$('#otherPurchase').value=p.otherPurchase||'';$('#purchaseContentSelect').value=p.content||'';$('#customContent').value=p.custom||'';$('#customContentWrap').classList.toggle('hidden',p.content!=='__custom__');updatePurchaseLive()}
  if(scope==='order'){setOrderType(p.type||'vat');$('#orderDate').value=p.date||todayISO();(p.items||[]).forEach((x,i)=>{const row=$(`[data-order-row="${i}"]`);if(!row)return;row.querySelector('.stock-now').value=x.current??0;row.querySelector('.order-qty').value=x.qty??0;row.querySelector('.order-price').value=new Intl.NumberFormat('vi-VN').format(x.price||0);row.querySelector('.order-line-total').textContent=money.format((x.qty||0)*(x.price||0))})}
  if(scope==='buyer'){Object.entries({shopName:'buyerShopName',address:'buyerAddress',deliveryPlace:'buyerDeliveryPlace',contact:'buyerContact',phone:'buyerPhone',bankAccount:'buyerBankAccount',bank:'buyerBank',note:'buyerNote',invoiceCompanyName:'invoiceCompanyName',invoiceTaxCode:'invoiceTaxCode',invoiceAddress:'invoiceAddress',invoiceEmail:'invoiceEmail'}).forEach(([k,id])=>{$('#'+id).value=p[k]||''})}
 }finally{suspendDirty=false}dirtyState[scope]=true;updateSaveStateUI()}
function askUnsaved(scope){
  const orderPending=scope==='order'&&orderIsPending()&&!dirtyState.order;
  $('#unsavedTitle').textContent=orderPending?'Đơn hàng chưa xác nhận':'Dữ liệu chưa được lưu';
  $('#unsavedMessage').textContent=orderPending?'Đơn đã lưu nháp nhưng chưa ghi sang phần Chi/Mua hàng.':'Bạn muốn lưu dữ liệu đang nhập trước khi rời trang?';
  $('#unsavedSave').textContent=orderPending?'Xác nhận rồi thoát':'Lưu rồi thoát';
  $('#unsavedDiscard').textContent=orderPending?'Thoát, chưa xác nhận':'Không lưu';
  $('#unsavedModal').classList.remove('hidden');return new Promise(r=>unsavedResolver=r)
}
function closeUnsaved(v){$('#unsavedModal').classList.add('hidden');if(unsavedResolver)unsavedResolver(v);unsavedResolver=null}
async function saveScope(scope){
  if(scope==='revenue'){if(!$('#revenueDate').value)return false;$('#revenueForm').requestSubmit();return false}
  if(scope==='purchase'){if(!$('#purchaseDate').value)return false;$('#purchaseForm').requestSubmit();return false}
  if(scope==='order'){if(orderIsPending()&&!dirtyState.order)return await confirmCurrentOrder();return await saveOrderDraft(true)}
  if(scope==='buyer'){saveBuyer();return true}return true
}
function discardScope(scope){clearDirty(scope);clearLocalDraft(scope);if(scope==='revenue')resetRevenueForm();if(scope==='purchase')resetPurchaseForm();if(scope==='order'&&!orderIsPending())resetOrder();if(scope==='buyer')fillBuyerSettings()}
async function canLeaveCurrent(){
  const scope=scopeForView();if(!scope)return true;
  if(!hasUnsaved(scope)&&!(scope==='order'&&orderIsPending()))return true;
  const choice=await askUnsaved(scope);if(choice==='cancel')return false;
  if(choice==='discard'){discardScope(scope);return true}
  if(choice==='save'){
    if(scope==='revenue'||scope==='purchase'){await saveScope(scope);return false}
    return Boolean(await saveScope(scope));
  }return false
}
async function navigateTo(id){if(await canLeaveCurrent())showView(id)}
async function guardedOpenList(type){if(await canLeaveCurrent())openList(type)}
$('#unsavedSave')?.addEventListener('click',()=>closeUnsaved('save'));
$('#unsavedDiscard')?.addEventListener('click',()=>closeUnsaved('discard'));
$('#unsavedCancel')?.addEventListener('click',()=>closeUnsaved('cancel'));
document.addEventListener('input',e=>{const view=e.target.closest('.view')?.id;const scope=scopeForView(view);if(scope)markDirty(scope)},true);
document.addEventListener('change',e=>{const view=e.target.closest('.view')?.id;const scope=scopeForView(view);if(scope)markDirty(scope)},true);
window.addEventListener('beforeunload',e=>{const scope=scopeForView();if(hasUnsaved(scope)||(scope==='order'&&orderIsPending())){e.preventDefault();e.returnValue=''}});
setTimeout(async()=>{const drafts=readDrafts();for(const scope of ['revenue','purchase','order','buyer']){if(!drafts[scope]?.data)continue;const when=new Date(drafts[scope].savedAt).toLocaleString('vi-VN');if(await confirmAction(`Phát hiện bản nháp ${scope} lưu lúc ${when}. Khôi phục?`,'Khôi phục bản nháp')){restoreLocalDraft(scope,drafts[scope].data);const target={revenue:'revenueView',purchase:'purchaseView',order:'orderView',buyer:'settingsView'}[scope];showView(target);break}else{clearLocalDraft(scope)}}updateSaveStateUI()},300);


// V2.1 — kiểm kê theo kỳ tháng, màn danh sách và màn nhập riêng
(() => {
  const DEFAULT_GROUPS = [
    {id:'mtf-vat',title:'MTF VAT',note:'Dòng 1–9',carryField:'mtfVat',items:[
      ['Bắp giò','Kg',125000],['Chả cốm Ước lễ - 24 miếng','Kg',120000],['Chả sườn sụn L1','Kg',135000],['Dồi sụn nướng Minh Thủy','Kg',125000],['Nem chua rán - Trần','Kg',130000],['Chả ram Tôm đất nhỏ - 50 cuộn','Túi 500gr',50000],['Mắm tôm TH sống bình 5.5kg','Bình 6kg',300000],['Sấu ngâm - trái giòn','Hũ 02kg',130000],['Atiso Đà Lạt','Hũ 02kg',150000]
    ]},
    {id:'ingredients',title:'Gia vị và nguyên liệu',note:'',carryField:'otherPurchase',items:[
      ['Nước mắm','Bình 5L',60000],['Bột ngọt','Bịch 5kg',62000],['Mắm nêm','Chai',30000],['Dầu ăn','Bình 5L',162500],['Rượu','Chai',30000],['Bột xù','',42000],['Đường phèn','',245000],['Bánh Tráng - Cây 16','Thiên',150000]
    ]},
    {id:'food-drink',title:'Nước uống và thực phẩm',note:'',carryField:'otherPurchase',items:[
      ['Đường Trắng','Cây',228000],['Sữa Hoa Hồng - Thùng 48','Thùng',20854],['Trà đỏ - Thùng 12','Bịch',64000],['Đường đen','Bịch',48000],['Trân châu','Bịch',35000],['Pepsi','Chai',137000],['Sting','Chai',45000],['Sâm','Gói',42500],['Sữa Đặc - Thùng 12','Bịch',45833],['Nhãn nhục','Kg',140000]
    ]},
    {id:'packaging',title:'Bao bì và vật dụng',note:'',carryField:'otherPurchase',items:[
      ['Hũ chấm 02 Oz','Thùng',13500],['Hũ Chấm 04 Oz','Thùng',19750],['Đũa tách','Thùng',12500],['Ly 500ml','Thùng',0],['Ly 700','Thùng',21500],['Nắp ly','Thùng',12000],['Bọc chữ T','Kg',50000],['Bọc Ly đôi','Kg',41000],['Bọc Thực phẩm','Kg',75000],['Bao tay','Kg',50000],['Bọc 1kg','Kg',28000],['Bọc 2kg','Kg',28000],['Bọc 3kg','Kg',28000],['Bọc 5kg','Kg',28000],['Hộp cơm','Cây',35500],['Hộp Gà','Cây',125000],['Hộp ăn thêm','Cây',33000],['Bọc đường ZIP nhỏ','Kg',70000],['Tăm - bánh','Bịch',5833],['Ống hút 6','Bọc',20000],['Ống hút 8','Bọc',20000],['Muỗng nhựa đen dài','Bọc',12000]
    ]}
  ];
  const cloneDefaults=()=>DEFAULT_GROUPS.map(g=>({...g,items:g.items.map((x,i)=>({id:`${g.id}-${i+1}`,name:x[0],unit:x[1],price:x[2]}))}));
  if(!Array.isArray(state.inventoryCatalog)||!state.inventoryCatalog.length)state.inventoryCatalog=cloneDefaults();

  const homePanel=$('#inventoryHomePanel'), picker=$('#inventoryMonthPicker'), catalog=$('#inventoryCatalog');
  const groupsEl=$('#inventoryGroups'), monthEl=$('#inventoryMonth');
  let editing=false, backupCatalog=null, activeMonth=null, viewMode='new';
  if(monthEl&&!monthEl.value)monthEl.value=currentMonthISO();

  const qtyNumber=v=>Math.max(0,Number(String(v||'0').replace(',','.'))||0);
  const inventoryByMonth=m=>state.inventories.find(x=>x.month===m);
  function showPanel(name){homePanel.classList.toggle('hidden',name!=='home');picker.classList.toggle('hidden',name!=='picker');catalog.classList.toggle('hidden',name!=='editor')}
  function renderHistory(){
    const list=[...state.inventories].sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    $('#inventoryHistoryCount').textContent=`${list.length} kỳ`;
    $('#inventoryHistoryList').innerHTML=list.length?list.map(inv=>`<article class="inventory-history-row" data-month="${inv.month}"><div><b>Kiểm hàng tháng ${formatMonth(inv.month)}</b><small>${inv.groups?.reduce((n,g)=>n+(g.items?.length||0),0)||0} mặt hàng</small></div><strong>${money.format(Number(inv.total)||0)}</strong><button class="mini-btn inventory-view-btn" type="button">Xem lại</button></article>`).join(''):'<div class="empty-inventory-history">Chưa có kỳ kiểm kê nào.</div>';
  }
  function snapshotQty(){const out={};groupsEl.querySelectorAll('[data-inventory-id]').forEach(r=>out[r.dataset.inventoryId]=qtyNumber(r.querySelector('.inventory-qty')?.value));return out}
  function inventoryRecord(){
    const qty=snapshotQty();let mtfVatTotal=0,otherTotal=0;
    const groups=state.inventoryCatalog.map(g=>{let total=0;const items=g.items.map(i=>{const q=qty[i.id]||0,amount=Math.round(q*(Number(i.price)||0));total+=amount;return{...i,qty:q,amount}});if(g.carryField==='mtfVat')mtfVatTotal+=total;else otherTotal+=total;return{id:g.id,title:g.title,note:g.note,carryField:g.carryField,total,items}});
    return{month:activeMonth,groups,mtfVatTotal,otherTotal,total:mtfVatTotal+otherTotal,updatedAt:new Date().toISOString()}
  }
  function renderTotals(){const rec=inventoryRecord();$('#inventoryMtfTotal').textContent=money.format(rec.mtfVatTotal);$('#inventoryOtherTotal').textContent=money.format(rec.otherTotal);$('#inventoryGrandTotal').textContent=money.format(rec.total);rec.groups.forEach(g=>{const el=$(`[data-group-total="${g.id}"]`);if(el)el.textContent=money.format(g.total)})}
  function renderCatalog(qtyMap){
    const saved=inventoryByMonth(activeMonth),savedQty={};saved?.groups?.forEach(g=>g.items.forEach(i=>savedQty[i.id]=i.qty));const qty=qtyMap||savedQty;
    groupsEl.innerHTML=state.inventoryCatalog.map(g=>{
      const rows=g.items.map(i=>`<tr data-inventory-id="${i.id}"><td class="inventory-name-cell" title="${escapeHtml(i.name)}">${editing?`<input class="inventory-name-edit" value="${escapeHtml(i.name)}">`:escapeHtml(i.name)}</td><td class="inventory-unit-cell">${editing?`<input class="inventory-unit-edit" value="${escapeHtml(i.unit||'')}">`:escapeHtml(i.unit||'—')}</td><td class="inventory-price-cell">${editing?`<input class="inventory-price-edit" inputmode="numeric" maxlength="6" value="${Number(i.price)||0}">`:money.format(Number(i.price)||0)}</td><td class="inventory-qty-cell"><input class="inventory-qty" type="text" inputmode="decimal" maxlength="5" value="${qty[i.id]??0}"></td>${editing?'<td class="inventory-action-cell"><button class="mini-btn danger inventory-delete-row" type="button">×</button></td>':''}</tr>`).join('');
      return `<section class="inventory-group" data-group-id="${g.id}"><div class="inventory-group-title"><div><strong>${escapeHtml(g.title)}</strong>${g.note?`<span>${escapeHtml(g.note)}</span>`:''}</div><strong class="inventory-group-total" data-group-total="${g.id}">0 ₫</strong></div><div class="inventory-table-wrap"><table class="inventory-table ${editing?'editing':''}"><colgroup><col class="col-name"><col class="col-unit"><col class="col-price"><col class="col-qty">${editing?'<col class="col-action">':''}</colgroup><thead><tr><th>Hàng hóa</th><th>ĐVT</th><th>Giá</th><th>SL</th>${editing?'<th></th>':''}</tr></thead><tbody>${rows}</tbody></table></div>${editing?'<button class="mini-btn inventory-add-row" type="button">+ Thêm dòng</button>':''}</section>`
    }).join('');
    $('#inventoryEditorTitle').textContent=`Kiểm hàng tháng ${formatMonth(activeMonth)}`;
    $('#inventoryModeHint').textContent=editing?'Đang chỉnh sửa danh mục, đơn vị và giá.':'Chỉ nhập số lượng thực tế. Giá trị từng nhóm được tính tự động.';
    $('#editInventoryCatalog').classList.toggle('hidden',editing);$('#saveInventoryCatalog').classList.toggle('hidden',!editing);$('#cancelInventoryCatalog').classList.toggle('hidden',!editing);
    $('#saveInventory').textContent=saved?'Cập nhật kiểm kê':'Lưu kiểm kê';
    renderTotals();
  }
  function syncCatalogFromInputs(){groupsEl.querySelectorAll('[data-group-id]').forEach(section=>{const g=state.inventoryCatalog.find(x=>x.id===section.dataset.groupId);if(!g)return;g.items=[...section.querySelectorAll('[data-inventory-id]')].map(r=>({id:r.dataset.inventoryId,name:r.querySelector('.inventory-name-edit')?.value.trim()||'Mặt hàng mới',unit:r.querySelector('.inventory-unit-edit')?.value.trim()||'',price:parseMoneyInput(r.querySelector('.inventory-price-edit')?.value)}))})}
  function upsertCarryover(rec){
    const next=shiftMonth(rec.month,1),date=`${next}-01`,base=`inventory-carry-${rec.month}`;
    [{id:`${base}-mtf`,mtfVat:rec.mtfVatTotal,mtfNone:0,otherPurchase:0,content:`Hàng tồn MTF VAT chuyển từ ${formatMonth(rec.month)}`,purchaseType:'CARRY_OVER'},{id:`${base}-other`,mtfVat:0,mtfNone:0,otherPurchase:rec.otherTotal,content:`Hàng tồn còn lại chuyển từ ${formatMonth(rec.month)}`,purchaseType:'CARRY_OVER'}].forEach(d=>{const total=d.mtfVat+d.mtfNone+d.otherPurchase,idx=state.purchases.findIndex(p=>p.id===d.id),row={...d,date,total,systemType:'inventoryCarryover',sourceMonth:rec.month,createdAt:idx>=0?state.purchases[idx].createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(idx>=0)state.purchases[idx]=row;else state.purchases.push(row)})
  }
  function openEditor(month,mode='view'){
    activeMonth=month;viewMode=mode;editing=false;backupCatalog=null;showPanel('editor');renderCatalog();
    $('#inventorySaveStatus').textContent=inventoryByMonth(month)?`Đã lưu kỳ ${formatMonth(month)}. Có thể chỉnh số lượng và cập nhật lại.`:'Kỳ mới chưa được lưu.';
  }
  async function saveInventory(){
    if(editing){alert('Hãy lưu hoặc hủy chỉnh sửa danh mục trước.');return}
    const rec=inventoryRecord();if(!await confirmAction(`${inventoryByMonth(activeMonth)?'Cập nhật':'Lưu'} kiểm kê ${formatMonth(activeMonth)} với tổng ${money.format(rec.total)}?`))return;
    const idx=state.inventories.findIndex(x=>x.month===activeMonth);if(idx>=0)state.inventories[idx]=rec;else state.inventories.push(rec);upsertCarryover(rec);save();renderAll();renderAllReports();renderHistory();showPanel('home');alert('Đã lưu kiểm kê và cập nhật số liệu chuyển sang tháng sau.');
  }

  $('#newInventoryBtn')?.addEventListener('click',()=>{monthEl.value=currentMonthISO();$('#inventoryPickerMessage').textContent='';showPanel('picker')});
  $('#cancelInventoryPicker')?.addEventListener('click',()=>showPanel('home'));
  $('#startInventoryBtn')?.addEventListener('click',()=>{const m=monthEl.value;if(!m)return;const existing=inventoryByMonth(m);if(existing){$('#inventoryPickerMessage').textContent=`Tháng ${formatMonth(m)} đã kiểm kê. Hãy mở kỳ này từ danh sách để xem hoặc chỉnh sửa.`;return}openEditor(m,'new')});
  $('#backInventoryHome')?.addEventListener('click',()=>{if(editing){alert('Hãy lưu hoặc hủy chỉnh sửa danh mục trước.');return}showPanel('home');renderHistory()});
  $('#inventoryHistoryList')?.addEventListener('click',e=>{const row=e.target.closest('[data-month]');if(row)openEditor(row.dataset.month,'view')});
  groupsEl?.addEventListener('input',e=>{if(e.target.classList.contains('inventory-qty'))e.target.value=e.target.value.replace(/[^0-9.,]/g,'').slice(0,5);if(e.target.classList.contains('inventory-price-edit'))e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);renderTotals()});
  groupsEl?.addEventListener('focusin',e=>{if(e.target.classList.contains('inventory-qty')&&qtyNumber(e.target.value)===0)e.target.value=''});
  groupsEl?.addEventListener('focusout',e=>{if(e.target.classList.contains('inventory-qty')&&!e.target.value.trim())e.target.value='0';renderTotals()});
  groupsEl?.addEventListener('click',e=>{const del=e.target.closest('.inventory-delete-row');if(del){del.closest('tr').remove();syncCatalogFromInputs();renderCatalog(snapshotQty())}const add=e.target.closest('.inventory-add-row');if(add){syncCatalogFromInputs();const g=state.inventoryCatalog.find(x=>x.id===add.closest('[data-group-id]').dataset.groupId);g.items.push({id:`${g.id}-${Date.now()}`,name:'Mặt hàng mới',unit:'',price:0});renderCatalog(snapshotQty())}});
  $('#editInventoryCatalog')?.addEventListener('click',()=>{backupCatalog=JSON.parse(JSON.stringify(state.inventoryCatalog));editing=true;renderCatalog(snapshotQty())});
  $('#saveInventoryCatalog')?.addEventListener('click',async()=>{syncCatalogFromInputs();if(!await confirmAction('Lưu thay đổi danh mục kiểm kê?'))return;editing=false;backupCatalog=null;save();renderCatalog(snapshotQty())});
  $('#cancelInventoryCatalog')?.addEventListener('click',()=>{state.inventoryCatalog=backupCatalog||state.inventoryCatalog;backupCatalog=null;editing=false;renderCatalog()});
  $('#resetInventoryQty')?.addEventListener('click',()=>{groupsEl.querySelectorAll('.inventory-qty').forEach(x=>x.value='0');renderTotals()});
  $('#saveInventory')?.addEventListener('click',saveInventory);
  renderHistory();showPanel('home');
})();

