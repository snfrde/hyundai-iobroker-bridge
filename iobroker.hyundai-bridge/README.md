# ioBroker.hyundai-bridge

A minimal ioBroker adapter that polls the companion
[`hyundai-bridge-service`](../hyundai-bridge-service) over HTTP and exposes
your Hyundai/Kia/Genesis vehicle's status as ioBroker states. It contains
**no authentication or vehicle-API logic of its own** — all of that lives in
the Python service.

## Requirements

- A running, logged-in instance of `hyundai-bridge-service` (see its
  [README](../hyundai-bridge-service/README.md) — set that up first)
- ioBroker js-controller >= 5.0.0
- Node.js >= 18 (uses the built-in `fetch`)

## Installation

This adapter is not published to the ioBroker/npm repository. Install it
from a local checkout or a packed tarball on your ioBroker host:

```bash
# Option A: install directly from a git checkout
cd /opt/iobroker
iobroker url /path/to/iobroker-hyundai-bridge/iobroker.hyundai-bridge

# Option B: pack it first (avoids npm turning a local folder into a symlink)
cd iobroker.hyundai-bridge
npm pack
iobroker url /path/to/iobroker.hyundai-bridge-0.1.0.tgz
```

> **Note:** installing directly from a local *folder* path can make npm
> create a symlink into that folder instead of copying it, which then fails
> at runtime with "Cannot find module '@iobroker/adapter-core'" because
> dependency resolution follows the symlink outside of ioBroker's
> `node_modules`. Packing into a `.tgz` first (Option B) avoids this.

Then create and enable an instance:

```bash
iobroker add hyundai-bridge
```

## Configuration

Open the adapter's settings in ioBroker Admin:

| Setting | Default | Description |
|---|---|---|
| Service URL | `http://127.0.0.1:8100` | Base URL of `hyundai-bridge-service`. Only change this if the service runs on a different host or port. |
| Poll interval (minutes) | `10` | How often the adapter reads `/status` from the service. This only reads the service's own cache — it does not by itself cause the service to contact Hyundai/Kia more often than the service's own `HYUNDAI_CACHE_POLL_MINUTES` setting. |

## States

For each vehicle found on the account, the adapter creates a device object
under `hyundai-bridge.0.<vehicleId>` with these states:

| State | Type | Description |
|---|---|---|
| `name` | string | Vehicle name |
| `model` | string | Vehicle model code |
| `odometerKm` | number | Odometer reading (km) |
| `batterySocPercent` | number | EV battery state of charge (%) |
| `batterySohPercent` | number | EV battery state of health (%), if reported |
| `isCharging` | boolean | Currently charging |
| `isPluggedIn` | boolean | Plugged in |
| `chargingPowerKw` | number | Charging power (kW), if reported |
| `rangeKm` | number | Estimated driving range (km) |
| `isLocked` | boolean | Vehicle locked |
| `latitude` / `longitude` | number | Last known GPS position |
| `airControlOn` | boolean | Climate control active |
| `lastUpdatedAt` | string (ISO timestamp) | When the vehicle last reported this data to Hyundai/Kia |
| `lastScannedAt` | string (ISO timestamp) | When the service last asked for it |
| `batteryAuxPercent` | number | 12V starter/auxiliary battery charge (%) |
| `frontLeftDoorOpen` / `frontRightDoorOpen` / `backLeftDoorOpen` / `backRightDoorOpen` | boolean | Per-door open state |
| `trunkOpen` / `hoodOpen` | boolean | Trunk / hood open state |
| `tirePressureWarningAll` / `...FrontLeft` / `...FrontRight` / `...RearLeft` / `...RearRight` | boolean | Per-wheel tire pressure warning |
| `defrostOn` | boolean | Windshield defrost active |
| `steeringWheelHeaterOn` | boolean | Heated steering wheel active |
| `chargeLimitAcPercent` / `chargeLimitDcPercent` | number | Target charge limit (%) for AC (Type 2/home) and DC (fast charger) respectively |
| `estimatedChargeDurationCurrentMin` | number | Estimated time (minutes) to finish the *current* charge session |
| `estimatedChargeDurationFastMin` / `...PortableMin` / `...StationMin` | number | Estimated full-charge time (minutes) via DC fast charging / a portable ICCB cable / an AC charging station, respectively |
| `targetRangeAcKm` / `targetRangeDcKm` | number | Range achievable once the AC/DC charge limit is reached |
| `scheduleChargeEnabled` | boolean | Scheduled charging enabled in the vehicle/app |
| `offPeakStartTime` / `offPeakEndTime` | string (`HH:MM`) | Configured off-peak charging window |
| `firstDepartureEnabled` / `secondDepartureEnabled` | boolean | Departure-time preconditioning schedule enabled |
| `firstDepartureDays` / `secondDepartureDays` | string (JSON array) | Configured weekdays for that departure schedule. The day-of-week numbering is whatever the vehicle API reports and isn't documented upstream — treat it as vehicle-defined rather than assuming ISO weekday numbers. |
| `firstDepartureTime` / `secondDepartureTime` | string (`HH:MM`) | Configured departure time |
| `firstDepartureClimateEnabled` / `secondDepartureClimateEnabled` | boolean | Preconditioning (climate) enabled for that departure |
| `firstDepartureClimateDefrost` / `secondDepartureClimateDefrost` | boolean | Defrost enabled for that departure's preconditioning |
| `firstDepartureClimateTemperature` / `secondDepartureClimateTemperature` | number (°C) | Target preconditioning temperature |
| `totalPowerConsumedRaw` / `totalPowerRegeneratedRaw` / `powerConsumption30dRaw` | number | Energy counters passed through from the vehicle API as-is. The manufacturer does not document their unit, so these are intentionally *not* labelled kWh/Wh — treat them as relative/comparative values unless you've independently confirmed the unit for your vehicle. |
| `registrationDate` | string | Vehicle registration date |
| `supportsValetMode` / `supportsWindowControl` | boolean | Whether the account/vehicle reports support for these features |

Adapter-level states:

| State | Description |
|---|---|
| `info.connection` | `true` if the last poll of the bridge service succeeded |
| `info.lastError` | Last error message, empty string if none |
| `control.forceRefresh` | Set to `true` to trigger `POST /refresh` on the bridge service (a **live** vehicle poll, not just the cache — see the security notes in the [top-level README](../README.md#security-notes)). Resets itself to `false` once the request completes. |

## How it works

1. On start and on every poll interval, the adapter calls `GET /status` on
   the configured service URL.
2. For each vehicle in the response, it creates the device/state objects on
   first sight and writes the current values.
3. If the request fails (service down, not logged in yet, network issue),
   `info.connection` is set to `false` and the error is written to
   `info.lastError` — existing vehicle states are left untouched (no
   overwriting good data with nulls just because one poll failed).
4. Writing `true` to `control.forceRefresh` triggers a one-off
   `POST /refresh` call instead of waiting for the next interval, updates
   states from the response, and resets the button.

## License

Apache-2.0, see [LICENSE](../LICENSE).
