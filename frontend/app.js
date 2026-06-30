// النطاق العالمي الموحد لسيرفر Render الخاص بك
const API_BASE_URL = "https://smart-fleet-backend-h6pc.onrender.com";

let drivers = [];
let shipments = [];
let alertsLog = [];
let currentFilter = 'عند التاجر'; 
let map, markersGroup;
let salesChart, fuelChart;
let currentUploadedImageBase64 = "";

const ORDER_STEPS = [
    "عند التاجر", "في الطريق للتاجر", "تم الاستلام وفي الطريق للمخزن",
    "في المخزن وقيد الفرز", "تم استلام من قبل مندوب المحافظة",
    "في مكتب المحافظة", "في الطريق للزبون", "مكتمل"
];

// ================= نظام التشغيل والمزامنة اللحظية =================
document.addEventListener("DOMContentLoaded", function() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.location.href = 'login.html');

    if (document.getElementById('map')) {
        initMainDashboard();
        setupTabRouter();
        initDirectOrderModalEvents();
    }
});

async function initMainDashboard() {
    if (!map) {
        map = L.map('map').setView([33.3152, 44.3661], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        markersGroup = L.layerGroup().addTo(map);
    }
    
    // جلب البيانات الأولية من قاعدة البيانات السحابية فوراً عند فتح اللوحة
    await Promise.all([fetchDrivers(), fetchShipments(), fetchAlerts()]);
    
    populateDriversDropdowns();
    if(document.getElementById('calculated-cost')) calculateShipmentCost();
    
    // دورة المزامنة اللحظية مع السيرفر كل 3 ثوانٍ (Real-time Sync)
    setInterval(syncDataWithServer, 3000);
}

async function syncDataWithServer() {
    await Promise.all([fetchDrivers(), fetchShipments(), fetchAlerts()]);
}

// ================= دالات الـ API والاتصال بالسيرفر (Fetch Architecture) =================
async function fetchDrivers() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/drivers`);
        drivers = await res.json();
        renderSidebarOrders();
        renderFinancials();
        renderCrudTable();
    } catch (err) { console.error("Error fetching drivers:", err); }
}

async function fetchShipments() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/shipments`);
        shipments = await res.json();
        renderSidebarOrders();
        renderShipmentsTable();
        updateCounters();
    } catch (err) { console.error("Error fetching shipments:", err); }
}

async function fetchAlerts() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/alerts`);
        alertsLog = await res.json();
        document.getElementById('alerts-badge').innerText = alertsLog.length;
    } catch (err) { console.error("Error fetching alerts:", err); }
}

async function updateOrderStatus(trackingId, newStatus) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/shipments/${trackingId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            printConsoleLog(`[Neon DB] تم تحديث مرحلة الشحنة ${trackingId} إلى [${newStatus}]`, "success");
            fetchShipments();
        }
    } catch (err) { printConsoleLog("فشل تحديث حالة الشحنة في السيرفر", "danger"); }
}

// ================= نظام العرض والتحكم بالواجهات (UI Rendering) =================
function updateCounters() {
    if(!document.getElementById('count-merchant')) return;
    const stages = {
        'count-merchant': 'عند التاجر', 'count-to-merchant': 'في الطريق للتاجر',
        'count-to-warehouse': 'تم الاستلام وفي الطريق للمخزن', 'count-sorting': 'في المخزن وقيد الفرز',
        'count-province-driver': 'تم استلام من قبل مندوب المحافظة', 'count-province-office': 'في مكتب المحافظة',
        'count-to-customer': 'في الطريق للزبون', 'count-completed': 'مكتمل'
    };
    for (let [id, status] of Object.entries(stages)) {
        document.getElementById(id).innerText = shipments.filter(s => s.status === status).length;
    }
}

function renderSidebarOrders() {
    const container = document.getElementById('dynamic-orders-container');
    if (!container) return;
    container.innerHTML = '';
    markersGroup.clearLayers();

    document.getElementById('dynamic-list-title').innerText = `طلبات مرحلة [${currentFilter}]:`;
    const filtered = shipments.filter(s => s.status === currentFilter);
    
    if(filtered.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; font-size:12px; margin-top:15px;">لا توجد طرود حالياً.</p>';
    }

    filtered.forEach(order => {
        const driver = drivers.find(d => d.id === order.driver_id);
        const card = document.createElement('div');
        card.className = 'cyber-order-item-card';
        
        let selectOptions = ORDER_STEPS.map(step => 
            `<option value="${step}" ${order.status === step ? 'selected' : ''}>${step}</option>`
        ).join('');

        card.innerHTML = `
            <div class="cyber-order-top-row">
                <span class="cyber-order-id"># ${order.tracking_id}</span>
                <select class="cyber-select-mini" onchange="updateOrderStatus('${order.tracking_id}', this.value)">
                    ${selectOptions}
                </select>
            </div>
            <div class="cyber-order-details-text">
                <b>البيج:</b> ${order.sender}<br>
                <b>الزبون:</b> ${order.receiver} | ${order.address}<br>
                <b>السعر الكلي:</b> ${parseInt(Number(order.cod) + Number(order.cost)).toLocaleString()} د.ع<br>
                <b>الكابتن:</b> ${driver ? driver.name : 'غير معين'}
            </div>
            <button class="btn-cyber-primary w-100" style="padding:4px; font-size:11px; margin-top:8px; color:#000;" onclick="copyTrackingLink('${order.tracking_id}')">🔗 نسخ رابط لكيشن التتبع</button>
        `;
        container.appendChild(card);

        if (driver) {
            const imgTag = driver.image ? `<img src="${driver.image}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;margin-bottom:5px;border:1px solid #00f2fe;">` : '';
            const marker = L.marker([Number(driver.lat), Number(driver.lng)]).addTo(markersGroup);
            marker.bindPopup(`<div style="text-align:right;">${imgTag}<b>الكابتن: ${driver.name}</b><br>الحالة: ${driver.is_real_gps ? '📡 بث GPS حقيقي' : '🤖 محاكاة'}</div>`);
        }
    });
}

function copyTrackingLink(trackingId) {
    // توليد رابط تتبع يعمل عالمياً على الهواتف مباشرة دون الحاجة لـ Ngrok بعد الآن!
    const link = window.location.origin + window.location.pathname.replace('index.html', 'track.html') + '?id=' + trackingId;
    navigator.clipboard.writeText(link).then(() => {
        printConsoleLog(`[API Link Generator] تم توليد رابط التتبع العالمي: ${trackingId}`, "success");
        alert(`تم نسخ الرابط بنجاح! 🚀\n\nيعمل الآن على جميع شبكات الموبايل لايف عبر سيرفر Render:\n\n${link}`);
    });
}

function filterFleet(element, statusType) {
    currentFilter = statusType;
    document.querySelectorAll('.status-card-cyber').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    renderSidebarOrders();
}

// ================= معالجة النماذج والإدخال (Forms Insertion) =================
const shipmentForm = document.getElementById('shipment-creation-form');
if(shipmentForm) {
    shipmentForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const cost = document.getElementById('ship-type').value === 'standard' ? 5000 : 8000;
        const cod = parseFloat(document.getElementById('ship-cod').value);
        const driverId = parseInt(document.getElementById('ship-assign-driver').value);
        
        const payload = {
            sender: document.getElementById('ship-sender').value,
            receiver: document.getElementById('ship-receiver').value,
            phone: document.getElementById('ship-phone').value,
            address: document.getElementById('ship-address').value,
            driver_id: driverId, cod: cod, cost: cost
        };

        try {
            const res = await fetch(`${API_BASE_URL}/api/shipments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if(res.ok) {
                alert(`تم حفظ وتجميد قيد الشحنة في Neon DB بنجاح! رقم التتبع: ${data.trackingId}`);
                this.reset();
                calculateShipmentCost();
                fetchShipments();
                fetchDrivers();
            }
        } catch (err) { alert("حدث خطأ أثناء إرسال الشحنة للسيرفر السحابي"); }
    });
}

function renderShipmentsTable() {
    const tbody = document.getElementById('shipments-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    shipments.forEach(s => {
        const driver = drivers.find(d => d.id === s.driver_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b style="color:var(--primary); font-family:monospace;">${s.tracking_id}</b></td>
            <td>${s.sender}</td>
            <td><b>${s.receiver}</b><br><span style="color:var(--text-muted);font-size:11px;">${s.phone}</span></td>
            <td>${s.address}</td>
            <td>${driver ? driver.name : 'غير معين'}</td>
            <td><b>${parseInt(Number(s.cod) + Number(s.cost)).toLocaleString()} د.ع</b></td>
            <td><span class="status-badge warning">${s.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderFinancials() {
    const tbody = document.getElementById('finance-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    let totalSales = 0, cashWithDrivers = 0, deliveryProfits = 0;

    drivers.forEach(d => {
        const sales = Number(d.sales);
        const profit = Number(d.profit);
        totalSales += sales;
        deliveryProfits += profit;
        if(d.fin_status === "معلق") cashWithDrivers += (sales - profit);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${d.name}</b></td>
            <td>${shipments.filter(s => s.driver_id === d.id).length} طرود</td>
            <td>${sales.toLocaleString()} د.ع</td>
            <td>${profit.toLocaleString()} د.ع</td>
            <td><span class="status-badge ${d.fin_status === 'معلق' ? 'warning' : 'active'}">${d.fin_status}</span></td>
            <td><button class="btn-cyber-success" style="padding:4px 10px; font-size:11px; color:#000;" onclick="settleFinance(${d.id})">قبض وتصفية</button></td>
        `;
        tbody.appendChild(tr);
    });

    if(document.getElementById('fin-total-sales')) {
        document.getElementById('fin-total-sales').innerText = totalSales.toLocaleString() + " د.ع";
        document.getElementById('fin-cash-with-drivers').innerText = cashWithDrivers.toLocaleString() + " د.ع";
        document.getElementById('fin-delivery-profits').innerText = deliveryProfits.toLocaleString() + " د.ع";
    }
}

function populateDriversDropdowns() {
    const mainSelect = document.getElementById('ship-assign-driver');
    const directSelect = document.getElementById('direct-assign-driver');
    if(!mainSelect && !directSelect) return;
    const optionsHtml = drivers.map(d => `<option value="${d.id}">${d.name} (${d.vehicle})</option>`).join('');
    if(mainSelect) mainSelect.innerHTML = optionsHtml;
    if(directSelect) directSelect.innerHTML = optionsHtml;
}

function renderCrudTable() {
    const tbody = document.getElementById('crud-drivers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    drivers.forEach((d, index) => {
        const avatar = d.image || "https://via.placeholder.com/40";
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${avatar}" class="table-avatar"></td>
            <td>#${d.id}</td>
            <td><b>${d.name}</b></td>
            <td>${d.phone}</td>
            <td>${d.vehicle}</td>
            <td>${d.zone}</td>
            <td><span class="status-badge active">${d.status === 'delivering' ? 'بث الـ IoT فعال' : 'مستقر'}</span></td>
            <td>
                <button class="btn-mini-cyber bg-edit" onclick="editDriver(${index})">تعديل</button>
                <button class="btn-mini-cyber bg-delete" onclick="deleteDriver(${d.id})">حذف</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteDriver(id) {
    if (confirm("هل أنت متأكد من حذف الحساب وإيقاف شريحة التتبع للكابتن نهائياً؟")) {
        try {
            await fetch(`${API_BASE_URL}/api/drivers/${id}`, { method: 'DELETE' });
            fetchDrivers();
        } catch (err) { console.error(err); }
    }
}

function setupTabRouter() {
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const target = this.getAttribute('data-target');
            document.querySelectorAll('.view-section').forEach(s => { s.classList.remove('active-view'); s.classList.add('hidden'); });
            const activeSec = document.getElementById(target);
            if(activeSec) { activeSec.classList.remove('hidden'); activeSec.classList.add('active-view'); }
            if(target === 'tracking-section' && map) setTimeout(() => { map.invalidateSize(); }, 200);
        });
    });
}

function printConsoleLog(text, type) {
    const consoleBody = document.getElementById('console-log-text');
    if (!consoleBody) return;
    const time = new Date().toLocaleTimeString('ar-IQ');
    let color = type === "success" ? "text-success" : (type === "danger" ? "text-danger" : "text-info");
    consoleBody.innerHTML += `<p class="${color}">[${time}] ${text}</p>`;
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

function calculateShipmentCost() {
    const type = document.getElementById('ship-type');
    if(!type) return;
    const cost = type.value === 'standard' ? 5000 : 8000;
    document.getElementById('calculated-cost').innerText = cost.toLocaleString();
}

function initDirectOrderModalEvents() {}