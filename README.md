# Hyundai/Kia ioBroker Bridge

Bring live status data from your Hyundai, Kia, or Genesis EU vehicle into
[ioBroker](https://www.iobroker.net/) — battery state of charge, range,
charging status, odometer, GPS position and more.

## Why this exists

The existing [`ioBroker.bluelink`](https://github.com/Newan/ioBroker.bluelink)
adapter relies on the `bluelinky` library, which authenticates against
Hyundai's **legacy** `idpconnect-eu` OAuth flow. That flow has been blocked by
Hyundai's WAF for a while now ("No code in redirect location" is the
telltale error), and community projects have since replaced it with an
entirely different, multi-token **OneApp/CCI** flow that isn't a drop-in
replacement — bolting it onto `bluelinky`/`ioBroker.bluelink` would mean
rewriting most of that adapter's authentication and vehicle-communication
layer.

Rather than doing that, this project takes a different, much lower-risk
path:

1. A small **Python service** (`hyundai-bridge-service/`) wraps the actively
   maintained [`hyundai_kia_connect_api`](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api)
   library, which already implements the current OneApp/CCI login flow
   correctly (see its `KiaUvoApiEU.py` for the gory details — it explicitly
   documents bypassing the WAF block). It exposes a minimal local REST API.
2. A small **ioBroker adapter** (`iobroker.hyundai-bridge/`) polls that REST
   API and writes the results into ioBroker states. It has no authentication
   logic of its own at all.

This keeps the hard, frequently-changing part (Hyundai/Kia's login flow) in
a library that other people actively maintain, and keeps the ioBroker-facing
part deliberately tiny and boring.

## Architecture

```
Hyundai/Kia servers (OneApp/CCI)
        ^
        | HTTPS (handled entirely by hyundai_kia_connect_api)
        |
hyundai-bridge-service (Python, FastAPI, systemd)
        |  GET /health   - login/poll status
        |  GET /status   - cached vehicle status (JSON)
        |  POST /refresh - force a live poll (wakes the car)
        |
        | HTTP, localhost only
        v
iobroker.hyundai-bridge (Node.js adapter)
        |
        v
ioBroker states (hyundai-bridge.0.<vehicleId>.*)
```

The two components are independent and communicate only over a local HTTP
API. Neither component needs to know about the other's internals.

## Components

| Component | Language | Docs |
|---|---|---|
| `hyundai-bridge-service` | Python 3.10+ | [hyundai-bridge-service/README.md](hyundai-bridge-service/README.md) |
| `iobroker.hyundai-bridge` | Node.js 18+ | [iobroker.hyundai-bridge/README.md](iobroker.hyundai-bridge/README.md) |

Install and configure the Python service first, then the ioBroker adapter —
the adapter is useless without a running, logged-in service behind it.

## Security notes

- Credentials (Hyundai/Kia account email, password, PIN) live **only** in
  `hyundai-bridge-service/.env` on the machine running the service, and are
  read from environment variables. They are never committed to this
  repository, hardcoded anywhere, or sent to the ioBroker adapter.
- The Python service binds to `127.0.0.1` by default (see
  `hyundai-bridge.service`). It is not intended to be exposed on your LAN or
  the internet — anyone who can reach it can read your car's live GPS
  location and, if you enable the optional control endpoints, send commands
  to it.
- `POST /refresh` wakes the vehicle's telematics unit for a live poll. Use
  it sparingly (e.g. from an ioBroker script before a trip) rather than on a
  tight interval — frequent forced polls drain the 12V battery.

## Credits

- [`hyundai_kia_connect_api`](https://github.com/Hyundai-Kia-Connect/hyundai_kia_connect_api)
  (MIT License) does all the actual authentication and vehicle-API work.
  This project is a thin wrapper around it.
- Background on the OneApp/CCI migration and the WAF block it works around:
  [TMA84/bluelink-refresh-token](https://github.com/TMA84/bluelink-refresh-token).

## License

Apache-2.0, see [LICENSE](LICENSE). `hyundai_kia_connect_api` itself is
MIT-licensed; see its repository for details.
