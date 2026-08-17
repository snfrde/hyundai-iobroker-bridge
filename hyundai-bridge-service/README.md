# hyundai-bridge-service

A small FastAPI service that wraps
[`hyundai_kia_connect_api`](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api)
and exposes vehicle status over a minimal local REST API. It handles login,
token refresh, and periodic cache polling in the background; consumers (such
as the companion [`iobroker.hyundai-bridge`](../iobroker.hyundai-bridge)
adapter) only ever talk to this service, never to Hyundai/Kia directly.

## Requirements

- Python 3.10 or newer
- A Hyundai, Kia, or Genesis account (EU region) with Bluelink/UVO/Connect
  enabled on at least one vehicle
- Linux with `systemd` if you want to use the provided service unit
  (the service itself is plain Python and works anywhere Python 3.10+ runs)

## Installation

```bash
# from this directory
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

## Configuration

Copy the example environment file and fill in your own values:

```bash
cp .env.example .env
chmod 600 .env
```

| Variable | Required | Description |
|---|---|---|
| `HYUNDAI_USERNAME` | yes | Your Bluelink/UVO/Connect account email |
| `HYUNDAI_PASSWORD` | yes | Your account password |
| `HYUNDAI_PIN` | no | Your vehicle security PIN (leave blank if you don't have one set) |
| `HYUNDAI_LANGUAGE` | no | Language code for the API, default `de` |
| `HYUNDAI_CACHE_POLL_MINUTES` | no | How often to poll the *cached* status (default `15`). This does **not** wake the vehicle. |

`region` is hardcoded to Europe and `brand` is hardcoded to Hyundai in
`main.py`. If you drive a Kia or Genesis instead, change the two constants
`REGION_EUROPE` / `BRAND_HYUNDAI` near the top of `main.py` to the values
your vehicle needs (see `hyundai_kia_connect_api`'s `const.py` for the full
list, e.g. `BRAND_KIA = 1`, `BRAND_GENESIS = 3`).

**Never commit your `.env` file.** It is already covered by
[`.gitignore`](../.gitignore).

## Running manually (for testing)

```bash
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8100
```

Watch the log output — a successful start looks like:

```
INFO Login erfolgreich, 1 Fahrzeug(e) gefunden
INFO Status aktualisiert (Cache-Abfrage)
```

## Running as a systemd service (recommended)

```bash
sudo cp hyundai-bridge.service /etc/systemd/system/hyundai-bridge.service
# edit the unit file if your install path or user differs from
# /opt/hyundai-bridge and "iobroker"
sudo systemctl daemon-reload
sudo systemctl enable --now hyundai-bridge
sudo systemctl status hyundai-bridge
```

The provided unit file assumes:
- the service lives at `/opt/hyundai-bridge` with a venv at
  `/opt/hyundai-bridge/.venv`
- it runs as the `iobroker` user (adjust `User=`/`Group=` if you run it as
  someone else)
- `.env` lives at `/opt/hyundai-bridge/.env`

Adjust paths/user in `hyundai-bridge.service` to match your actual setup
before installing it.

## API

All endpoints return JSON. There is no authentication on the HTTP API
itself — it is meant to be reachable only from `localhost` (see
[Security notes](../README.md#security-notes) in the top-level README).

### `GET /health`

```json
{
  "status": "ok",
  "loggedIn": true,
  "lastError": null,
  "lastSuccessAt": "2026-08-17T12:35:33.085054+00:00"
}
```

Use this for monitoring / liveness checks.

### `GET /status`

Returns the last known (cached) status of every vehicle on the account, keyed
by internal vehicle ID:

```json
{
  "00000000-0000-0000-0000-000000000000": {
    "vin": "00000000-0000-0000-0000-000000000000",
    "name": "Example EV",
    "model": "Example Model",
    "odometerKm": 15000.0,
    "batterySocPercent": 61,
    "batterySohPercent": null,
    "isCharging": false,
    "isPluggedIn": false,
    "chargingPowerKw": null,
    "rangeKm": 185.0,
    "isLocked": true,
    "latitude": 0.0,
    "longitude": 0.0,
    "airControlOn": false,
    "lastUpdatedAt": "2026-08-17T08:08:26+02:00",
    "lastScannedAt": "2026-08-17T12:38:11.273952+00:00",
    "batteryAuxPercent": 83,
    "frontLeftDoorOpen": false,
    "trunkOpen": false,
    "tirePressureWarningAll": false,
    "defrostOn": false,
    "chargeLimitAcPercent": 100,
    "chargeLimitDcPercent": 100,
    "estimatedChargeDurationFastMin": 72,
    "targetRangeAcKm": 319,
    "scheduleChargeEnabled": false,
    "firstDepartureTime": "08:00",
    "firstDepartureDays": [1, 2, 3, 5],
    "totalPowerConsumedRaw": 316412,
    "registrationDate": "2022-01-15 10:00:00.000"
  }
}
```

(Trimmed for readability — see `vehicle_to_dict()` in `main.py` for the
complete, current field list. As of v0.2.0 this includes per-door/tire/
climate detail, AC/DC charge limits, estimated charge durations, departure
and off-peak charging schedules, and lifetime/30-day energy counters, in
addition to the core fields above.)

`lastUpdatedAt` is when Hyundai/Kia's backend last heard from the vehicle;
`lastScannedAt` is when this service last asked. Returns `503` if the service
hasn't completed its first login yet.

### `POST /refresh`

Same response shape as `/status`, but first forces a **live** poll of the
vehicle (wakes its telematics unit — see the security notes on why this
should be used sparingly). Returns `503` if the service hasn't completed its
first login yet.

## Troubleshooting

- **`Missing required environment variable: HYUNDAI_USERNAME`** — you
  haven't created `.env`, or you're not running the service with
  `EnvironmentFile=` (systemd) / haven't sourced it (manual run).
- **Login fails repeatedly** — double-check your credentials work in the
  official app first. `hyundai_kia_connect_api` is under active development;
  check its [issue tracker](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api/issues)
  if login errors look like an upstream API change rather than a credentials
  problem.
- **`/status` returns `503` forever** — check `journalctl -u hyundai-bridge`
  (or the console if running manually) for the actual login error.
