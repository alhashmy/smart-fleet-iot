// ================= بيئة تهيئة الحالات وقاعدة البيانات المحلية (State Management) =================
const ORDER_STEPS = [
    "عند التاجر",
    "في الطريق للتاجر",
    "تم الاستلام وفي الطريق للمخزن",
    "في المخزن وقيد الفرز",
    "تم استلام من قبل مندوب المحافظة",
    "في مكتب المحافظة",
    "في الطريق للزبون",
    "مكتمل"
];

const DEFAULT_DRIVERS = [
    { id: 101, name: "أحمد علي العبيدي", phone: "07711223344", vehicle: "سكانيا - 4421 بغداد", status: "delivering", lat: 33.3152, lng: 44.3661, speed: 85, fuel: 74, sales: 0, profit: 0, finStatus: "تمت التصفية", zone: "المنصور", image: "", isRealGPS: false },
    { id: 102, name: "عمر جاسم السامرائي", phone: "07822334455", vehicle: "أكتروس - 99120 أربيل", status: "delivering", lat: 33.3450, lng: 44.4210, speed: 118, fuel: 88, sales: 0, profit: 0, finStatus: "تمت التصفية", zone: "الأعظمية", image: "" },
    { id: 103, name: "مصطفى خالد العاني", phone: "07533445566", vehicle: "فولفو - 8845 نجف", status: "warehouse", lat: 33.2980, lng: 44.3420, speed: 0, fuel: 45, sales: 0, profit: 0, finStatus: "تمت التصفية", zone: "الكرادة", image: "" }
];

const DEFAULT_SHIPMENTS = [
    { trackingId: "TRK-983421", sender: "بيج النورس للأزياء", receiver: "حيدر حسن الجبوري", phone: "07701234567", address: "المنصور", driverId: 101, cod: 250000, cost: 5000, status: "عند التاجر" },
    { trackingId: "TRK-104953", sender: "بيج بابل للالكترونيات", receiver: "سارة ميثم العبيدي", phone: "07819876543", address: "الأعظمية", driverId: 102, cod: 75000, cost: 8000, status: "عند التاجر" }
];

let drivers = JSON.parse(localStorage.getItem('fleet_drivers')) || DEFAULT_DRIVERS;
let shipments = JSON.parse(localStorage.getItem('fleet_shipments')) || DEFAULT_SHIPMENTS;
let alertsLog = JSON.parse(localStorage.getItem('fleet_alerts')) || [];

function saveStateToStorage() {
    localStorage.setItem('fleet_drivers', JSON.stringify(drivers));
    localStorage.setItem('fleet_shipments', JSON.stringify(shipments));
    localStorage.setItem('fleet_alerts', JSON.stringify(alertsLog));
}

let currentFilter = 'عند التاجر'; 
let map, markersGroup;
let salesChart, fuelChart;
let currentUploadedImageBase64 = "";

// ================= نظام الكشف الذكي لضمان حماية التشغيل حسب نوع الصفحة النشطة =================
document.addEventListener("DOMContentLoaded", function() {
    saveStateToStorage();
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            window.location.href = 'login.html';
        });
    }

    if (document.getElementById('map')) {
        initMainDashboard();
        setupTabRouter();
        initDirectOrderModalEvents();
    }
});

function initMainDashboard() {
    if (!map) {
        map = L.map('map').setView([33.3152, 44.3661], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        markersGroup = L.layerGroup().addTo(map);
    }
    
    renderMainDashboardUI();
    populateDriversDropdowns();
    if(document.getElementById('calculated-cost')) calculateShipmentCost();
    
    setInterval(syncDataWithLocalStorageAndSimulate, 2000);
}

function syncDataWithLocalStorageAndSimulate() {
    drivers = JSON.parse(localStorage.getItem('fleet_drivers')) || drivers;
    shipments = JSON.parse(localStorage.getItem('fleet_shipments')) || shipments;
    alertsLog = JSON.parse(localStorage.getItem('fleet_alerts')) || alertsLog;
    
    renderSidebarOrders();
    updateCounters();
}

function setupTabRouter() {
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const targetSection = this.getAttribute('data-target');
            document.querySelectorAll('.view-section').forEach(section => {
                section.classList.remove('active-view');
                section.classList.add('hidden');
            });
            
            const activeSection = document.getElementById(targetSection);
            if(activeSection) {
                activeSection.classList.remove('hidden');
                activeSection.classList.add('active-view');
            }

            if(targetSection === 'tracking-section') {
                printConsoleLog("[System] جاري تحديث أبعاد الخريطة اللحظية الجغرافية...", "info");
                setTimeout(() => { map.invalidateSize(); }, 200); 
            } else if (targetSection === 'analytics-section') {
                printConsoleLog("[Charts] تم تغذية محرك الرسوم البيانية بأحدث بث لقاعدة البيانات.", "info");
                setTimeout(initCharts, 150);
            }
        });
    });
}

function printConsoleLog(text, type) {
    const consoleBody = document.getElementById('console-log-text');
    if (!consoleBody) return;
    const time = new Date().toLocaleTimeString('ar-IQ');
    let colorClass = "text-info";
    if (type === "success") colorClass = "text-success";
    if (type === "danger") colorClass = "text-danger";
    consoleBody.innerHTML += `<p class="${colorClass}">[${time}] ${text}</p>`;
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

function renderMainDashboardUI() {
    renderSidebarOrders();
    renderShipmentsTable();
    renderFinancials();
    updateCounters();
}

function updateCounters() {
    if(!document.getElementById('count-merchant')) return;
    document.getElementById('count-merchant').innerText = shipments.filter(s => s.status === 'عند التاجر').length;
    document.getElementById('count-to-merchant').innerText = shipments.filter(s => s.status === 'في الطريق للتاجر').length;
    document.getElementById('count-to-warehouse').innerText = shipments.filter(s => s.status === 'تم الاستلام وفي الطريق للمخزن').length;
    document.getElementById('count-sorting').innerText = shipments.filter(s => s.status === 'في المخزن وقيد الفرز').length;
    document.getElementById('count-province-driver').innerText = shipments.filter(s => s.status === 'تم استلام من قبل مندوب المحافظة').length;
    document.getElementById('count-province-office').innerText = shipments.filter(s => s.status === 'في مكتب المحافظة').length;
    document.getElementById('count-to-customer').innerText = shipments.filter(s => s.status === 'في الطريق للزبون').length;
    document.getElementById('count-completed').innerText = shipments.filter(s => s.status === 'مكتمل').length;
    
    document.getElementById('alerts-badge').innerText = alertsLog.length;
}

function renderSidebarOrders() {
    const container = document.getElementById('dynamic-orders-container');
    if (!container) return;
    container.innerHTML = '';
    markersGroup.clearLayers();

    document.getElementById('dynamic-list-title').innerText = `طلبات مرحلة [${currentFilter}]:`;
    const filteredShipments = shipments.filter(s => s.status === currentFilter);
    
    if(filteredShipments.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; font-size:12px; margin-top:15px;">لا توجد شحنات مسجلة في هذه المرحلة حالياً.</p>';
    }

    filteredShipments.forEach(order => {
        const driver = drivers.find(d => d.id === order.driverId);
        const card = document.createElement('div');
        card.className = 'cyber-order-item-card';
        
        let selectOptions = '';
        ORDER_STEPS.forEach(step => {
            selectOptions += `<option value="${step}" ${order.status === step ? 'selected' : ''}>${step}</option>`;
        });

        card.innerHTML = `
            <div class="cyber-order-top-row">
                <span class="cyber-order-id"># ${order.trackingId}</span>
                <select class="cyber-select-mini" onchange="updateOrderStatus('${order.trackingId}', this.value)">
                    ${selectOptions}
                </select>
            </div>
            <div class="cyber-order-details-text">
                <b>البيج:</b> ${order.sender}<br>
                <b>الزبون:</b> ${order.receiver} | ${order.address}<br>
                <b>السعر الكلي:</b> ${parseInt(order.cod + order.cost).toLocaleString()} د.ع<br>
                <b>الكابتن المكلف:</b> ${driver ? driver.name : 'غير معين'}
            </div>
            <button class="btn-cyber-primary w-100" style="padding:4px; font-size:11px; margin-top:8px; color:#000;" onclick="copyTrackingLink('${order.trackingId}')">🔗 نسخ رابط لكيشن التتبع</button>
        `;
        container.appendChild(card);

        if (driver) {
            const imgTag = driver.image ? `<img src="${driver.image}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;margin-bottom:5px;border:1px solid #00f2fe;">` : '';
            const marker = L.marker([driver.lat, driver.lng]).addTo(markersGroup);
            marker.bindPopup(`<div style="text-align:right;">${imgTag}<b>الكابتن: ${driver.name}</b><br>قيد التوصيل لطلب: ${order.trackingId}<br>الحالة: ${driver.isRealGPS ? '📡 بث GPS حقيقي حار' : '🤖 محاكاة'}</div>`);
        }
    });
}

// تعديل الدالة لتبديل الـ localhost بالآي بي تلقائياً قبل النسخ للحافظة
function copyTrackingLink(trackingId) {
    let link = window.location.origin + window.location.pathname.replace('index.html', 'track.html') + '?id=' + trackingId;
    
    // استبدال تلقائي ليعمل فورا على التلفون
    link = link.replace('localhost', '192.168.0.133');
    
    navigator.clipboard.writeText(link).then(() => {
        printConsoleLog(`[API Link Generator] تم توليد رابط لكيشن التتبع للزبون: ${trackingId}`, "success");
        alert(`تم نسخ رابط التتبع بنجاح! 🚀\n\nالرابط مجهز الآن بالآي بي الخاص بحاسبتك ليعمل على التلفون فوراً وبدون مشاكل:\n\n${link}`);
    });
}

function updateOrderStatus(trackingId, newStatus) {
    const order = shipments.find(s => s.trackingId === trackingId);
    if(order) {
        const oldStatus = order.status;
        order.status = newStatus;
        saveStateToStorage();
        renderMainDashboardUI();
        printConsoleLog(`[ACID Flow] تم نقل الطلب ${trackingId} من [${oldStatus}] إلى مرحلة [${newStatus}] بنجاح.`, "success");
    }
}

function filterFleet(element, statusType) {
    currentFilter = statusType;
    document.querySelectorAll('.status-card-cyber').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    renderSidebarOrders();
}

function initDirectOrderModalEvents() {
    const modal = document.getElementById('direct-order-modal');
    const openBtn = document.getElementById('open-direct-order-btn');
    const closeBtn = document.getElementById('close-direct-modal-btn');
    const form = document.getElementById('direct-order-form');

    if(openBtn && modal) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if(closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    if(form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const driverId = parseInt(document.getElementById('direct-assign-driver').value);
            const price = parseFloat(document.getElementById('direct-price').value);
            const pageName = document.getElementById('direct-page-name').value;
            const zoneName = document.getElementById('direct-zone-name').value;
            const trackingId = "TRK-" + Math.floor(100000 + Math.random() * 900000);

            const newOrder = {
                trackingId: trackingId, sender: pageName, receiver: "زبون طلب مباشر",
                phone: "077xxxxxxx", address: zoneName, driverId: driverId, cod: price, cost: 5000,
                status: "عند التاجر" 
            };

            const driver = drivers.find(d => d.id === driverId);
            if(driver) {
                driver.sales += (price + 5000);
                driver.profit += 5000;
                driver.finStatus = "معلق";
            }

            shipments.push(newOrder);
            saveStateToStorage();
            renderMainDashboardUI();
            
            form.reset();
            modal.classList.add('hidden');
            
            printConsoleLog(`[Direct Transaction] تم إنشاء طلب مباشر فوري في مرحلة [عند التاجر] بنجاح برقم ${trackingId}.`, "success");
            alert(`تم إنشاء وتوجيه الطلب الفوري بنجاح في مرحلة (عند التاجر)! رقم التتبع: ${trackingId}`);
        });
    }
}

function populateDriversDropdowns() {
    const mainSelect = document.getElementById('ship-assign-driver');
    const directSelect = document.getElementById('direct-assign-driver');
    if(mainSelect) mainSelect.innerHTML = '';
    if(directSelect) directSelect.innerHTML = '';
    drivers.forEach(d => {
        const optionHtml = `<option value="${d.id}">${d.name} (${d.vehicle})</option>`;
        if(mainSelect) mainSelect.innerHTML += optionHtml;
        if(directSelect) directSelect.innerHTML += optionHtml;
    });
}

function calculateShipmentCost() {
    const type = document.getElementById('ship-type');
    if(!type) return;
    const cost = type.value === 'standard' ? 5000 : 8000;
    document.getElementById('calculated-cost').innerText = cost.toLocaleString();
}

const shipmentForm = document.getElementById('shipment-creation-form');
if(shipmentForm) {
    shipmentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const cost = document.getElementById('ship-type').value === 'standard' ? 5000 : 8000;
        const cod = parseFloat(document.getElementById('ship-cod').value);
        const driverId = parseInt(document.getElementById('ship-assign-driver').value);
        const trackingId = "TRK-" + Math.floor(100000 + Math.random() * 900000);
        
        const newShipment = {
            trackingId: trackingId, sender: document.getElementById('ship-sender').value,
            receiver: document.getElementById('ship-receiver').value, phone: document.getElementById('ship-phone').value,
            address: document.getElementById('ship-address').value, driverId: driverId, cod: cod, cost: cost,
            status: "عند التاجر"
        };
        
        const driver = drivers.find(d => d.id === driverId);
        if(driver) {
            driver.sales += (cod + cost);
            driver.profit += cost;
            driver.finStatus = "معلق";
        }
        
        shipments.push(newShipment);
        saveStateToStorage();
        renderMainDashboardUI();
        this.reset();
        calculateShipmentCost();
        printConsoleLog(`[ACID Transaction] INSERT INTO shipments VALUES ('${trackingId}')`, "success");
        alert(`تم جدول وتثبيت قيد الشحنة بنجاح! رقم التتبع: ${trackingId}`);
    });
}

function renderShipmentsTable() {
    const tbody = document.getElementById('shipments-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    shipments.forEach(s => {
        const driver = drivers.find(d => d.id === s.driverId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b style="color:var(--primary); font-family:monospace;">${s.trackingId}</b></td>
            <td>${s.sender}</td>
            <td><b>${s.receiver}</b><br><span style="color:var(--text-muted);font-size:11px;">${s.phone}</span></td>
            <td>${s.address}</td>
            <td>${driver ? driver.name : 'غير معين'}</td>
            <td><b>${parseInt(s.cod + s.cost).toLocaleString()} د.ع</b></td>
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
        totalSales += d.sales;
        deliveryProfits += d.profit;
        if(d.finStatus === "معلق") cashWithDrivers += (d.sales - d.profit);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${d.name}</b></td>
            <td>${shipments.filter(s => s.driverId === d.id).length} طرود</td>
            <td>${d.sales.toLocaleString()} د.ع</td>
            <td>${d.profit.toLocaleString()} د.ع</td>
            <td><span class="status-badge ${d.finStatus === 'معلق' ? 'warning' : 'active'}">${d.finStatus}</span></td>
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

function settleFinance(id) {
    const driver = drivers.find(d => d.id === id);
    if(driver && driver.finStatus === "معلق") {
        driver.finStatus = "تمت التصفية";
        saveStateToStorage();
        renderFinancials();
        printConsoleLog(`[Finance API] تم مطابقة وتصفية حساب الكابتن: ${driver.name}`, "success");
        alert(`تم تصفية ذمة الكابتن: ${driver.name} بنجاح وقبض المبالغ المعلقة.`);
    }
}

function initCharts() {
    const activeDrivers = drivers.filter(d => d.sales > 0);
    const labels = activeDrivers.map(d => d.name.split(" ")[0]);
    const salesData = activeDrivers.map(d => d.sales);
    const fuelData = drivers.map(d => d.fuel);
    const fuelLabels = drivers.map(d => d.name.split(" ")[0]);

    if (salesChart) salesChart.destroy();
    const ctxSales = document.getElementById('salesChart').getContext('2d');
    salesChart = new Chart(ctxSales, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'مبيعات الكاش المجموع بذمته (د.ع)', data: salesData, backgroundColor: 'rgba(0, 242, 254, 0.5)', borderColor: '#00f2fe', borderWidth: 2 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#1a2438' } } } }
    });

    if (fuelChart) fuelChart.destroy();
    const ctxFuel = document.getElementById('fuelChart').getContext('2d');
    fuelChart = new Chart(ctxFuel, {
        type: 'line',
        data: { labels: fuelLabels, datasets: [{ label: 'مستوى وقود التانكي اللحظي (%)', data: fuelData, borderColor: '#ff9100', backgroundColor: 'rgba(255, 145, 0, 0.1)', fill: true }] },
        options: { responsive: true, scales: { y: { max: 100, beginAtZero: true, grid: { color: '#1a2438' } } } }
    });
}

function simulateLiveIoTData() {
    drivers.forEach(d => {
        if (d.status === 'delivering') {
            if (d.isRealGPS === true) {
                printConsoleLog(`[📡 GPS Node] جاري استقبال بث إحداثيات حقيقية مشفرة للهاتف الجغرافي التابع للمركبة #${d.id}`, "success");
            } else {
                d.lat += (Math.random() - 0.5) * 0.004;
                d.lng += (Math.random() - 0.5) * 0.004;
                d.speed = Math.floor(Math.random() * (135 - 55) + 55);
                
                if (d.speed > 115) {
                    const time = new Date().toLocaleTimeString('ar-IQ');
                    alertsLog.unshift({ msg: `⚠️ سرعة حرجة [${time}]: الكابتن ${d.name} تجاوز الحد القانوني! السرعة الحالية: ${d.speed} كم/س.` });
                    printConsoleLog(`[RDR المخالفات] رصد تذكرة سرعة فورية للكابتن: ${d.name}`, "danger");
                    saveStateToStorage();
                }
            }
            d.fuel = Math.max(5, d.fuel - 1); 
        }
    });
    localStorage.setItem('fleet_drivers', JSON.stringify(drivers));
    renderSidebarOrders();
    if (document.getElementById('analytics-section').classList.contains('active-view')) {
        initCharts();
    }
}

const toggleAlertsBtn = document.getElementById('alerts-toggle-btn');
if(toggleAlertsBtn) {
    toggleAlertsBtn.addEventListener('click', () => {
        const container = document.getElementById('alerts-log-container');
        container.innerHTML = alertsLog.length === 0 ? '<p style="color:var(--text-muted); text-align:center;">لا توجد مخالفات مسجلة.</p>' : '';
        alertsLog.forEach(a => { container.innerHTML += `<div class="alert-item">${a.msg}</div>`; });
        document.getElementById('alerts-modal').classList.remove('hidden');
    });
    document.getElementById('close-alerts-btn').addEventListener('click', () => {
        document.getElementById('alerts-modal').classList.add('hidden');
    });
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentUploadedImageBase64 = e.target.result;
            document.getElementById('d-preview').src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
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
                <button class="btn-mini-cyber bg-delete" onclick="deleteDriver(${index})">حذف</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

const crudForm = document.getElementById('crud-driver-form');
if(crudForm) {
    crudForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const indexVal = document.getElementById('driver-index').value;
        const name = document.getElementById('d-name').value;
        const phone = document.getElementById('d-phone').value;
        const vehicle = document.getElementById('d-vehicle').value;
        const zone = document.getElementById('d-zone').value;
        const status = document.getElementById('d-status').value;

        if (indexVal === "") {
            const newId = drivers.length > 0 ? drivers[drivers.length - 1].id + 1 : 101;
            const newDriver = {
                id: newId, name: name, phone: phone, vehicle: vehicle, status: status,
                lat: 33.3152 + (Math.random() - 0.5) * 0.04, lng: 44.3661 + (Math.random() - 0.5) * 0.04,
                speed: status === 'delivering' ? 70 : 0, fuel: 100, sales: 0, profit: 0, finStatus: "تمت التصفية",
                zone: zone, image: currentUploadedImageBase64, isRealGPS: false
            };
            drivers.push(newDriver);
            alert(`تم إضافة الكابتن وتفعيل البث برقم معرف #${newId}`);
        } else {
            const idx = parseInt(indexVal);
            drivers[idx].name = name; drivers[idx].phone = phone; drivers[idx].vehicle = vehicle;
            drivers[idx].zone = zone; drivers[idx].status = status;
            if(currentUploadedImageBase64 !== "") drivers[idx].image = currentUploadedImageBase64;
            alert(`تم تحديث وحفظ بيانات الكابتن بنجاح.`);
        }
        saveStateToStorage();
        resetDriverForm();
        renderCrudTable();
    });
}

function editDriver(index) {
    const d = drivers[index];
    document.getElementById('driver-index').value = index;
    document.getElementById('d-name').value = d.name;
    document.getElementById('d-phone').value = d.phone;
    document.getElementById('d-vehicle').value = d.vehicle;
    document.getElementById('d-zone').value = d.zone;
    document.getElementById('d-status').value = d.status;
    document.getElementById('d-preview').src = d.image || "https://via.placeholder.com/100";
    document.getElementById('form-action-title').innerText = "📝 تعديل بيانات الكابتن المحدد";
    document.getElementById('submit-btn').innerText = "حفظ التغييرات الفنية";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

function deleteDriver(index) {
    if (confirm(`هل أنت متأكد من حذف الحساب وإيقاف شريحة التتبع للكابتن: ${drivers[index].name} نهائياً؟`)) {
        drivers.splice(index, 1);
        saveStateToStorage();
        renderCrudTable();
    }
}

function resetDriverForm() {
    document.getElementById('crud-driver-form').reset();
    document.getElementById('driver-index').value = "";
    document.getElementById('d-preview').src = "https://via.placeholder.com/100";
    currentUploadedImageBase64 = "";
    document.getElementById('form-action-title').innerText = "➕ تسجيل حساب كابتن جديد بالسيستم";
    document.getElementById('submit-btn').innerText = "تثبيت الحساب وتوليد النطاق";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
}