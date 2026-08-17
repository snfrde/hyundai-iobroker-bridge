"""
Hyundai/Kia Bridge Service

Kleiner, eigenstaendiger REST-Dienst um hyundai_kia_connect_api
(https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api) zu kapseln.
Der ioBroker-Adapter spricht nur mit diesem Dienst (HTTP), nicht direkt mit
Hyundai - die komplexe OneApp/CCI-Login- und Fahrzeuglogik bleibt vollstaendig
in der aktiv gepflegten Python-Bibliothek.

Zugangsdaten werden NICHT im Code hinterlegt, sondern ausschliesslich ueber
Umgebungsvariablen (siehe .env.example) vom Nutzer selbst konfiguriert.
"""

import logging
import os
import threading
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from hyundai_kia_connect_api import VehicleManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("hyundai-bridge")

REGION_EUROPE = 1
BRAND_HYUNDAI = 2


def env(name, default=None, required=False):
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Fehlende Pflicht-Umgebungsvariable: {name}")
    return val


USERNAME = env("HYUNDAI_USERNAME", required=True)
PASSWORD = env("HYUNDAI_PASSWORD", required=True)
PIN = env("HYUNDAI_PIN", default="")
LANGUAGE = env("HYUNDAI_LANGUAGE", default="de")
CACHE_POLL_MINUTES = int(env("HYUNDAI_CACHE_POLL_MINUTES", default="15"))

app = FastAPI(title="Hyundai/Kia Bridge", description="Interner Statusdienst fuer ioBroker")

manager: VehicleManager | None = None
state_lock = threading.Lock()
last_error: str | None = None
last_success_at: str | None = None
initialized = False


def init_manager():
    """Erzeugt den VehicleManager und fuehrt den initialen Login durch."""
    global manager
    manager = VehicleManager(
        region=REGION_EUROPE,
        brand=BRAND_HYUNDAI,
        username=USERNAME,
        password=PASSWORD,
        pin=PIN,
        language=LANGUAGE,
    )
    result = manager.login()
    if result is not True:
        # EU sollte kein OTP benoetigen (das ist ein CA/USA-Feature) - falls doch
        # etwas anderes als True zurueckkommt, lieber laut scheitern statt
        # stillschweigend mit halbem Zustand weiterzulaufen.
        raise RuntimeError(f"Login lieferte kein einfaches Erfolgsergebnis zurueck: {result!r}")
    logger.info("Login erfolgreich, %d Fahrzeug(e) gefunden", len(manager.vehicles))


def poll_loop():
    global last_error, last_success_at, initialized
    while True:
        try:
            with state_lock:
                if manager is None:
                    init_manager()
                else:
                    manager.check_and_refresh_token()
                # Auch direkt nach dem allerersten Login ausfuehren, sonst bleiben
                # die Fahrzeugwerte bis zum naechsten Intervall leer.
                manager.update_all_vehicles_with_cached_state()
            last_error = None
            last_success_at = datetime.now(timezone.utc).isoformat()
            initialized = True
            logger.info("Status aktualisiert (Cache-Abfrage)")
        except Exception as exc:  # noqa: BLE001 - bewusst breit, Hintergrund-Loop darf nie sterben
            last_error = str(exc)
            logger.error("Fehler beim Aktualisieren: %s", exc)
        time.sleep(CACHE_POLL_MINUTES * 60)


def _bool_or_none(x):
    return None if x is None else bool(x)


def _time_str(t):
    return t.strftime("%H:%M") if t else None


def vehicle_to_dict(v):
    return {
        "vin": v.id,
        "name": v.name,
        "model": v.model,
        "odometerKm": v.odometer,
        "batterySocPercent": v.ev_battery_percentage,
        "batterySohPercent": v.ev_battery_soh_percentage,
        "isCharging": v.ev_battery_is_charging,
        "isPluggedIn": v.ev_battery_is_plugged_in,
        "chargingPowerKw": v.ev_charging_power,
        "rangeKm": v.ev_driving_range,
        "isLocked": v.is_locked,
        "latitude": v.location_latitude,
        "longitude": v.location_longitude,
        "airControlOn": v.air_control_is_on,
        "lastUpdatedAt": v.last_updated_at.isoformat() if v.last_updated_at else None,
        "lastScannedAt": v.last_scanned_at.isoformat() if v.last_scanned_at else None,

        # 12V starter/auxiliary battery
        "batteryAuxPercent": v.car_battery_percentage,

        # Doors / trunk / hood
        "frontLeftDoorOpen": _bool_or_none(v.front_left_door_is_open),
        "frontRightDoorOpen": _bool_or_none(v.front_right_door_is_open),
        "backLeftDoorOpen": _bool_or_none(v.back_left_door_is_open),
        "backRightDoorOpen": _bool_or_none(v.back_right_door_is_open),
        "trunkOpen": v.trunk_is_open,
        "hoodOpen": v.hood_is_open,

        # Per-wheel tire pressure warnings
        "tirePressureWarningAll": v.tire_pressure_all_warning_is_on,
        "tirePressureWarningFrontLeft": v.tire_pressure_front_left_warning_is_on,
        "tirePressureWarningFrontRight": v.tire_pressure_front_right_warning_is_on,
        "tirePressureWarningRearLeft": v.tire_pressure_rear_left_warning_is_on,
        "tirePressureWarningRearRight": v.tire_pressure_rear_right_warning_is_on,

        # Climate detail
        "defrostOn": v.defrost_is_on,
        "steeringWheelHeaterOn": v.steering_wheel_heater_is_on,

        # Charge limits (target SoC per plug type: AC = Type 2/home, DC = fast charger)
        "chargeLimitAcPercent": v.ev_charge_limits_ac,
        "chargeLimitDcPercent": v.ev_charge_limits_dc,

        # Estimated remaining charge duration by charge type (minutes)
        "estimatedChargeDurationCurrentMin": v.ev_estimated_current_charge_duration,
        "estimatedChargeDurationFastMin": v.ev_estimated_fast_charge_duration,
        "estimatedChargeDurationPortableMin": v.ev_estimated_portable_charge_duration,
        "estimatedChargeDurationStationMin": v.ev_estimated_station_charge_duration,

        # Range achievable once the respective charge limit is reached
        "targetRangeAcKm": v.ev_target_range_charge_AC,
        "targetRangeDcKm": v.ev_target_range_charge_DC,

        # Departure/charge schedules as configured in the manufacturer app.
        # Day-of-week numbering is whatever the vehicle API reports; not
        # documented upstream, so treat it as opaque/vehicle-defined rather
        # than assuming e.g. ISO weekday numbers.
        "scheduleChargeEnabled": v.ev_schedule_charge_enabled,
        "offPeakStartTime": _time_str(v.ev_off_peak_start_time),
        "offPeakEndTime": _time_str(v.ev_off_peak_end_time),
        "firstDepartureEnabled": v.ev_first_departure_enabled,
        "firstDepartureDays": v.ev_first_departure_days,
        "firstDepartureTime": _time_str(v.ev_first_departure_time),
        "firstDepartureClimateEnabled": v.ev_first_departure_climate_enabled,
        "firstDepartureClimateDefrost": v.ev_first_departure_climate_defrost,
        "firstDepartureClimateTemperature": v.ev_first_departure_climate_temperature,
        "secondDepartureEnabled": v.ev_second_departure_enabled,
        "secondDepartureDays": v.ev_second_departure_days,
        "secondDepartureTime": _time_str(v.ev_second_departure_time),
        "secondDepartureClimateEnabled": v.ev_second_departure_climate_enabled,
        "secondDepartureClimateDefrost": v.ev_second_departure_climate_defrost,
        "secondDepartureClimateTemperature": v.ev_second_departure_climate_temperature,

        # Energy counters. hyundai_kia_connect_api passes these through from
        # the vehicle API (totalPwrCsp/regenPwr/consumption30d) without a
        # documented unit - exposed as-is rather than guessing kWh vs Wh.
        "totalPowerConsumedRaw": v.total_power_consumed,
        "totalPowerRegeneratedRaw": v.total_power_regenerated,
        "powerConsumption30dRaw": v.power_consumption_30d,

        # Vehicle metadata
        "registrationDate": v.registration_date,
        "supportsValetMode": v.supports_valet_mode,
        "supportsWindowControl": v.supports_window_control,
    }


@app.get("/health")
def health():
    return {
        "status": "ok" if initialized and last_error is None else "degraded",
        "loggedIn": manager is not None,
        "lastError": last_error,
        "lastSuccessAt": last_success_at,
    }


@app.get("/status")
def status():
    if manager is None:
        raise HTTPException(status_code=503, detail="Noch nicht eingeloggt, bitte kurz warten")
    with state_lock:
        return {vid: vehicle_to_dict(v) for vid, v in manager.vehicles.items()}


@app.post("/refresh")
def refresh():
    """Erzwingt eine ECHTE Abfrage beim Fahrzeug (weckt die Telematikeinheit,
    zehrt an der 12V-Batterie) statt nur den Server-Cache zu lesen.
    Sparsam verwenden, nicht als normalen Polling-Endpunkt."""
    if manager is None:
        raise HTTPException(status_code=503, detail="Noch nicht eingeloggt, bitte kurz warten")
    with state_lock:
        manager.check_and_refresh_token()
        manager.force_refresh_all_vehicles_states()
        result = {vid: vehicle_to_dict(v) for vid, v in manager.vehicles.items()}
    return result


@app.on_event("startup")
def on_startup():
    thread = threading.Thread(target=poll_loop, daemon=True)
    thread.start()
