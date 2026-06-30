import os
import random
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor

# تعريف محرك الـ FastAPI بالخط العريض في بداية الملف لكي يراه سيرفر Render فوراً
app = FastAPI(title="Smart Route Fleet IoT Backend")

# تفعيل نظام الأمان CORS لكي يستقبل السيرفر بث الـ GPS من الموبايل واللابتوب بدون حظر
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# جلب رابط الاتصال السحابي بقاعدة بيانات Neon
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="Database connection string (DATABASE_URL) is missing inside Environment Variables!")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# --- نماذج البيانات المدخلة (Pydantic Models) ---
class DriverCreate(BaseModel):
    name: str
    phone: str
    vehicle: str
    status: str
    zone: str
    image: Optional[str] = ""

class DriverGPSUpdate(BaseModel):
    lat: float
    lng: float
    speed: int
    is_real_gps: bool

class ShipmentCreate(BaseModel):
    sender: str
    receiver: str
    phone: str
    address: str
    driver_id: int
    cod: float
    cost: float

class StatusUpdate(BaseModel):
    status: str

# --- 1. بروتوكولات الـ APIs الخاصة بالكباتن (Drivers CRUD) ---
@app.get("/api/drivers")
def get_drivers():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM drivers ORDER BY id ASC")
    drivers = cur.fetchall()
    cur.close()
    conn.close()
    return drivers

@app.post("/api/drivers")
def create_driver(driver: DriverCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO drivers (name, phone, vehicle, status, lat, lng, speed, fuel, sales, profit, fin_status, zone, image, is_real_gps) 
           VALUES (%s, %s, %s, %s, 33.3152, 44.3661, 0, 100, 0, 0, 'تمت التصفية', %s, %s, false) RETURNING id;""",
        (driver.name, driver.phone, driver.vehicle, driver.status, driver.zone, driver.image)
    )
    new_id = cur.fetchone()['id']
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Driver created successfully", "id": new_id}

@app.put("/api/drivers/{driver_id}/gps")
def update_driver_gps(driver_id: int, gps: DriverGPSUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE drivers SET lat = %s, lng = %s, speed = %s, is_real_gps = %s WHERE id = %s",
        (gps.lat, gps.lng, gps.speed, gps.is_real_gps, driver_id)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "success"}

@app.delete("/api/drivers/{driver_id}")
def delete_driver(driver_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM drivers WHERE id = %s", (driver_id,))
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Driver deleted"}

# --- 2. بروتوكولات الـ APIs الخاصة بالشحنات والطرود ---
@app.get("/api/shipments")
def get_shipments():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM shipments ORDER BY tracking_id DESC")
    shipments = cur.fetchall()
    cur.close()
    conn.close()
    return shipments

@app.post("/api/shipments")
def create_shipment(ship: ShipmentCreate):
    tracking_id = f"TRK-{random.randint(100000, 900000)}"
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO shipments (tracking_id, sender, receiver, phone, address, driver_id, cod, cost, status) 
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'عند التاجر');""",
        (tracking_id, ship.sender, ship.receiver, ship.phone, ship.address, ship.driver_id, ship.cod, ship.cost)
    )
    cur.execute(
        "UPDATE drivers SET sales = sales + %s, profit = profit + %s, fin_status = 'معلق' WHERE id = %s",
        ((ship.cod + ship.cost), ship.cost, ship.driver_id)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Shipment deployed", "trackingId": tracking_id}

@app.put("/api/shipments/{tracking_id}/status")
def update_shipment_status(tracking_id: str, update: StatusUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE shipments SET status = %s WHERE tracking_id = %s", (update.status, tracking_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "updated"}

# --- 3. بروتوكولات الـ APIs الخاصة بالتنبيهات والمخالفات ---
@app.get("/api/alerts")
def get_alerts():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT msg FROM alerts ORDER BY id DESC LIMIT 50")
    alerts = cur.fetchall()
    cur.close()
    conn.close()
    return alerts

@app.post("/api/alerts")
def create_alert(alert: StatusUpdate):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO alerts (msg) VALUES (%s)", (alert.status,))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "logged"}