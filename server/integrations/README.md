# ATOS / ATG Integration Preparation

No live ATOS, ATG, tank gauge, nozzle or device communication is enabled in this phase.

## Architecture

```text
Frontend / Dashboard
        |
        v
Express API: /api/integrations
        |
        v
Device Sync Service ---- Device Status Service
        |
        v
Device Adapter Factory
        |
        +--> ATOS Adapter (placeholder, no live calls)
        +--> Future ATG Adapter
        +--> Future Vendor Adapter
        |
        v
Normalized Models
  - Tank
  - Nozzle
        |
        v
Prepared DB Tables
  - device_tanks
  - device_nozzles
  - device_mappings
  - device_sync_history
```

## Prepared Models

### Tank
- Tank ID
- Product Type
- Tank Name
- Capacity
- Current Volume
- Water Level
- Temperature
- Last Sync Time

### Nozzle
- Nozzle ID
- Product Type
- Dispenser ID
- Totalizer Reading
- Last Reading
- Last Sync Time

## Mapping

Mappings are prepared in `config/deviceMappings.js`:

- ATOS Tank ID -> Application Tank ID
- ATOS Nozzle ID -> Application Nozzle ID

The database table `device_mappings` is prepared for persistent mapping once vendor IDs are confirmed.

## Vendor Requirements Needed

- ATOS/ATG API base URL or device IP.
- Authentication method: username/password, token, certificate or session API.
- Tank endpoint specification and sample payload.
- Nozzle/totalizer endpoint specification and sample payload.
- Product code mapping from ATOS to site products.
- Polling limits and recommended sync interval.
- Error code list from vendor.
- Whether water level and temperature are available by tank.
- Timezone and timestamp format used by the device/API.
- Sandbox credentials or test device access.
