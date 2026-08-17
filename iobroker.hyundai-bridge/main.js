'use strict';

const utils = require('@iobroker/adapter-core');

const VEHICLE_STATES = [
    ['name', { role: 'text', name: 'Fahrzeugname', type: 'string' }],
    ['model', { role: 'text', name: 'Modell', type: 'string' }],
    ['odometerKm', { role: 'value', name: 'Kilometerstand', type: 'number', unit: 'km' }],
    ['batterySocPercent', { role: 'value.battery', name: 'Batterie-Ladestand', type: 'number', unit: '%' }],
    ['batterySohPercent', { role: 'value', name: 'Batterie-Gesundheit (SoH)', type: 'number', unit: '%' }],
    ['isCharging', { role: 'indicator', name: 'Lädt gerade', type: 'boolean' }],
    ['isPluggedIn', { role: 'indicator', name: 'Angesteckt', type: 'boolean' }],
    ['chargingPowerKw', { role: 'value.power', name: 'Ladeleistung', type: 'number', unit: 'kW' }],
    ['rangeKm', { role: 'value', name: 'Reichweite', type: 'number', unit: 'km' }],
    ['isLocked', { role: 'indicator', name: 'Verriegelt', type: 'boolean' }],
    ['latitude', { role: 'value.gps.latitude', name: 'Breitengrad', type: 'number' }],
    ['longitude', { role: 'value.gps.longitude', name: 'Längengrad', type: 'number' }],
    ['airControlOn', { role: 'indicator', name: 'Klimatisierung aktiv', type: 'boolean' }],
    ['lastUpdatedAt', { role: 'value.time', name: 'Zeitstempel Fahrzeugmeldung', type: 'string' }],
    ['lastScannedAt', { role: 'value.time', name: 'Zeitstempel letzte Abfrage', type: 'string' }],

    // 12V-Starterbatterie
    ['batteryAuxPercent', { role: 'value.battery', name: '12V-Batterie Ladezustand', type: 'number', unit: '%' }],

    // Türen / Kofferraum / Haube
    ['frontLeftDoorOpen', { role: 'indicator', name: 'Tür vorne links offen', type: 'boolean' }],
    ['frontRightDoorOpen', { role: 'indicator', name: 'Tür vorne rechts offen', type: 'boolean' }],
    ['backLeftDoorOpen', { role: 'indicator', name: 'Tür hinten links offen', type: 'boolean' }],
    ['backRightDoorOpen', { role: 'indicator', name: 'Tür hinten rechts offen', type: 'boolean' }],
    ['trunkOpen', { role: 'indicator', name: 'Kofferraum offen', type: 'boolean' }],
    ['hoodOpen', { role: 'indicator', name: 'Motorhaube offen', type: 'boolean' }],

    // Reifendruck-Warnungen
    ['tirePressureWarningAll', { role: 'indicator.alarm', name: 'Reifendruck-Warnung (allgemein)', type: 'boolean' }],
    ['tirePressureWarningFrontLeft', { role: 'indicator.alarm', name: 'Reifendruck-Warnung vorne links', type: 'boolean' }],
    ['tirePressureWarningFrontRight', { role: 'indicator.alarm', name: 'Reifendruck-Warnung vorne rechts', type: 'boolean' }],
    ['tirePressureWarningRearLeft', { role: 'indicator.alarm', name: 'Reifendruck-Warnung hinten links', type: 'boolean' }],
    ['tirePressureWarningRearRight', { role: 'indicator.alarm', name: 'Reifendruck-Warnung hinten rechts', type: 'boolean' }],

    // Klimatisierung (Detail)
    ['defrostOn', { role: 'indicator', name: 'Frontscheibenheizung aktiv', type: 'boolean' }],
    ['steeringWheelHeaterOn', { role: 'indicator', name: 'Lenkradheizung aktiv', type: 'boolean' }],

    // Lade-Limits (Ziel-SoC je Steckertyp)
    ['chargeLimitAcPercent', { role: 'value', name: 'Lade-Limit AC (Typ2/Haushalt)', type: 'number', unit: '%' }],
    ['chargeLimitDcPercent', { role: 'value', name: 'Lade-Limit DC (Schnelllader)', type: 'number', unit: '%' }],

    // Geschätzte Restladezeit nach Ladeart
    ['estimatedChargeDurationCurrentMin', { role: 'value', name: 'Restladezeit aktueller Ladevorgang', type: 'number', unit: 'min' }],
    ['estimatedChargeDurationFastMin', { role: 'value', name: 'Restladezeit Schnellladung (DC)', type: 'number', unit: 'min' }],
    ['estimatedChargeDurationPortableMin', { role: 'value', name: 'Restladezeit mobiles Ladekabel', type: 'number', unit: 'min' }],
    ['estimatedChargeDurationStationMin', { role: 'value', name: 'Restladezeit AC-Ladestation', type: 'number', unit: 'min' }],

    // Erreichbare Reichweite beim jeweiligen Ladelimit
    ['targetRangeAcKm', { role: 'value', name: 'Reichweite bei AC-Ladelimit', type: 'number', unit: 'km' }],
    ['targetRangeDcKm', { role: 'value', name: 'Reichweite bei DC-Ladelimit', type: 'number', unit: 'km' }],

    // Lade-/Abfahrtspläne (aus der Hersteller-App übernommen)
    ['scheduleChargeEnabled', { role: 'indicator', name: 'Geplantes Laden aktiv', type: 'boolean' }],
    ['offPeakStartTime', { role: 'text', name: 'Off-Peak-Ladefenster Start', type: 'string' }],
    ['offPeakEndTime', { role: 'text', name: 'Off-Peak-Ladefenster Ende', type: 'string' }],
    ['firstDepartureEnabled', { role: 'indicator', name: '1. Abfahrtszeit aktiv', type: 'boolean' }],
    ['firstDepartureDays', { role: 'json', name: '1. Abfahrtszeit Wochentage (fahrzeugspezifisch codiert)', type: 'string' }],
    ['firstDepartureTime', { role: 'text', name: '1. Abfahrtszeit', type: 'string' }],
    ['firstDepartureClimateEnabled', { role: 'indicator', name: '1. Abfahrt: Vorklimatisierung aktiv', type: 'boolean' }],
    ['firstDepartureClimateDefrost', { role: 'indicator', name: '1. Abfahrt: Enteisung aktiv', type: 'boolean' }],
    ['firstDepartureClimateTemperature', { role: 'value', name: '1. Abfahrt: Zieltemperatur', type: 'number', unit: '°C' }],
    ['secondDepartureEnabled', { role: 'indicator', name: '2. Abfahrtszeit aktiv', type: 'boolean' }],
    ['secondDepartureDays', { role: 'json', name: '2. Abfahrtszeit Wochentage (fahrzeugspezifisch codiert)', type: 'string' }],
    ['secondDepartureTime', { role: 'text', name: '2. Abfahrtszeit', type: 'string' }],
    ['secondDepartureClimateEnabled', { role: 'indicator', name: '2. Abfahrt: Vorklimatisierung aktiv', type: 'boolean' }],
    ['secondDepartureClimateDefrost', { role: 'indicator', name: '2. Abfahrt: Enteisung aktiv', type: 'boolean' }],
    ['secondDepartureClimateTemperature', { role: 'value', name: '2. Abfahrt: Zieltemperatur', type: 'number', unit: '°C' }],

    // Energiestatistik (Einheit herstellerseitig nicht dokumentiert)
    ['totalPowerConsumedRaw', { role: 'value', name: 'Gesamtverbrauch (Rohwert, Einheit unbestätigt)', type: 'number' }],
    ['totalPowerRegeneratedRaw', { role: 'value', name: 'Gesamt-Rekuperation (Rohwert, Einheit unbestätigt)', type: 'number' }],
    ['powerConsumption30dRaw', { role: 'value', name: 'Verbrauch letzte 30 Tage (Rohwert, Einheit unbestätigt)', type: 'number' }],

    // Fahrzeug-Metadaten
    ['registrationDate', { role: 'text', name: 'Zulassungsdatum', type: 'string' }],
    ['supportsValetMode', { role: 'indicator', name: 'Unterstützt Valet-Modus', type: 'boolean' }],
    ['supportsWindowControl', { role: 'indicator', name: 'Unterstützt Fensterfernsteuerung', type: 'boolean' }],
];

class HyundaiBridge extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'hyundai-bridge' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.pollTimer = null;
        this.knownVehicles = new Set();
    }

    async onReady() {
        await this.setObjectNotExistsAsync('info', { type: 'channel', common: { name: 'Information' }, native: {} });
        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: { role: 'indicator.connected', name: 'Begleitdienst erreichbar und eingeloggt', type: 'boolean', read: true, write: false, def: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('info.lastError', {
            type: 'state',
            common: { role: 'text', name: 'Letzter Fehler', type: 'string', read: true, write: false, def: '' },
            native: {},
        });
        await this.setObjectNotExistsAsync('control.forceRefresh', {
            type: 'state',
            common: { role: 'button', name: 'Echte Fahrzeugabfrage erzwingen (weckt das Auto)', type: 'boolean', read: false, write: true, def: false },
            native: {},
        });
        this.subscribeStates('control.forceRefresh');

        await this.pollStatus();
        const intervalMs = Math.max(1, Number(this.config.pollIntervalMinutes) || 10) * 60 * 1000;
        this.pollTimer = setInterval(() => {
            this.pollStatus().catch((err) => this.log.error(`Polling fehlgeschlagen: ${err.stack || err}`));
        }, intervalMs);
    }

    get serviceUrl() {
        return (this.config.serviceUrl || 'http://127.0.0.1:8100').replace(/\/+$/, '');
    }

    async fetchJson(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const res = await fetch(`${this.serviceUrl}${path}`, { ...options, signal: controller.signal });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                const detail = body && body.detail ? body.detail : `HTTP ${res.status}`;
                throw new Error(detail);
            }
            return body;
        } finally {
            clearTimeout(timer);
        }
    }

    async ensureVehicleStates(vin) {
        if (this.knownVehicles.has(vin)) return;
        this.knownVehicles.add(vin);
        await this.setObjectNotExistsAsync(vin, { type: 'device', common: { name: vin }, native: {} });
        for (const [id, common] of VEHICLE_STATES) {
            await this.setObjectNotExistsAsync(`${vin}.${id}`, { type: 'state', common: { read: true, write: false, ...common }, native: {} });
        }
    }

    async writeVehicleStates(vin, data) {
        await this.ensureVehicleStates(vin);
        for (const [id] of VEHICLE_STATES) {
            if (data[id] !== undefined) {
                let val = data[id];
                if (val !== null && typeof val === 'object') {
                    val = JSON.stringify(val);
                }
                await this.setStateAsync(`${vin}.${id}`, { val, ack: true });
            }
        }
    }

    async pollStatus() {
        try {
            const data = await this.fetchJson('/status');
            for (const [vin, vehicle] of Object.entries(data)) {
                await this.writeVehicleStates(vin, vehicle);
            }
            await this.setStateAsync('info.connection', { val: true, ack: true });
            await this.setStateAsync('info.lastError', { val: '', ack: true });
        } catch (err) {
            await this.setStateAsync('info.connection', { val: false, ack: true });
            await this.setStateAsync('info.lastError', { val: String(err.message || err), ack: true });
            this.log.warn(`Begleitdienst nicht erreichbar / nicht eingeloggt: ${err.message || err}`);
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        if (id === `${this.namespace}.control.forceRefresh` && state.val) {
            try {
                this.log.info('Erzwinge echte Fahrzeugabfrage (weckt das Auto) ...');
                const data = await this.fetchJson('/refresh', { method: 'POST' });
                for (const [vin, vehicle] of Object.entries(data)) {
                    await this.writeVehicleStates(vin, vehicle);
                }
                await this.setStateAsync('info.connection', { val: true, ack: true });
                await this.setStateAsync('info.lastError', { val: '', ack: true });
            } catch (err) {
                await this.setStateAsync('info.lastError', { val: String(err.message || err), ack: true });
                this.log.error(`Erzwungene Abfrage fehlgeschlagen: ${err.message || err}`);
            } finally {
                await this.setStateAsync('control.forceRefresh', { val: false, ack: true });
            }
        }
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) clearInterval(this.pollTimer);
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new HyundaiBridge(options);
} else {
    new HyundaiBridge();
}
