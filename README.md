# CBK Vehicle Meta Studio v3.1

CBK Vehicle Meta Studio is an offline browser application for inspecting, editing, validating, repairing, and rebuilding GTA V / FiveM vehicle resources.

It is designed around a **non-destructive rule**: do not throw away XML fields just because the editor does not recognize them. Smart editors update the existing XML nodes in place, while raw XML editors remain available for every advanced/custom structure.

## What v3 edits

Core vehicle data:

- `handling.meta` — full core `CHandlingData` editor plus editable `SubHandlingData`
- `vehicles.meta` — common fields plus automatic editors for every additional scalar/vector field and nested XML blocks
- `carvariations.meta` — model, mod-kit, light/siren references, direct color-combination editing, plus full selected-entry XML for advanced livery/plate structures
- `carcols.meta` — mod-kit/light/siren IDs, cross-file reference counts, safe ID renumbering, and selected item XML

Optional/advanced vehicle data is recognized and preserved, including:

- `vehiclelayouts.meta`
- `contentunlocks.meta`, `carcontentunlocks.meta`, `caraddoncontentunlocks.meta`
- `shop_vehicle.meta`
- `dlctext.meta`
- `vfxvehicleinfo.meta`
- `vehiclemodelsets.meta`
- `vehicleextras.dat`
- non-standard/custom `.meta` / `.xml` files

`vfxvehicleinfo.meta`, `vehiclemodelsets.meta`, and `vehicleextras.dat` are **import/edit-only** in the starter-file dialog. The app deliberately does not invent blank structures for advanced formats where a known-good source file is safer.

Unknown scripts, configuration files, and binary streamed assets are preserved when a resource folder/ZIP is imported and rebuilt.

## Resource import

V3 supports three import paths:

1. **Import resource ZIP** — reads the resource in-browser. Standard stored and DEFLATE ZIP entries are supported in modern Chromium/Edge/Chrome browsers.
2. **Import resource folder** — recommended fallback for any unusual ZIP. The outer selected folder is stripped so the exported ZIP has the resource files at its root.
3. **Import files** — useful when working with a set of meta/text files directly.

The importer preserves resource scripts and binary files instead of rebuilding only the metadata.

## Smart diagnostics

Project Diagnostics checks include:

- malformed XML and unexpected root elements
- duplicate `handlingName`, vehicle `modelName`, variation `modelName`
- missing/invalid core handling values
- hard invalid bias ranges and impossible/reversed suspension/traction relationships
- empirical outlier warnings against the supplied GTA V/OpenIV handling reference database
- `vehicles.meta` → `handling.meta` references
- `vehicles.meta` → `carvariations.meta` references
- `carvariations.meta` → `carcols.meta` mod-kit/light/siren references
- duplicate mod-kit, light, and siren IDs inside the loaded resource
- streamed `.yft` and `.ytd` matching when stream assets were imported
- invalid/non-increasing LOD distance data
- invalid vehicle wheel/body-health numeric values
- missing or incorrect `fxmanifest.lua` `data_file` registrations, including wildcard/glob coverage such as `data/**/handling.meta`
- vanilla-safe siren IDs versus optional SSLA extended-ID mode
- malformed vehicle booleans/vectors, negative LODs, reversed min/max ranges, extreme wheel scales, and suspicious enum prefixes

### Important limits

The app separates **hard invalid rules** from **reference/outlier warnings**. GTA has legitimate unusual vehicles (heavy trucks, aircraft, specialty vehicles), so a value being outside a typical passenger-car range is not automatically treated as corrupt.

Siren ID validation defaults to the vanilla-safe range. The optional **SSLA extended siren IDs** mode uses the extended ID behavior documented by SirenSetting Limit Adjuster. The app does not install or distribute SSLA.

## GTA reference database

The included reference database was generated from the OpenIV exports supplied for this build:

- 248 `CHandlingData` entries
- 16 `vehicles.meta` entries

Files are included under `reference/` and summarized into `reference-data.js` so the app remains fully offline when opened directly from disk.

The **GTA Reference** tab can compare the currently selected handling against a Rockstar reference, show deltas and empirical bands, and optionally apply a reference's tunable values while preserving the custom handling name and unknown/custom XML fields.

## Manifest safety

V3.1 does **not** blindly replace an imported `fxmanifest.lua`.

- Existing script/dependency metadata is preserved.
- **Repair / merge manifest** corrects known vehicle `data_file` types and appends missing vehicle registrations.
- The Resource Builder can optionally generate a clean metadata-only manifest when that is explicitly selected.
- If no manifest exists, the builder creates a current `fxmanifest.lua` using `fx_version 'cerulean'` and `game 'gta5'`.

Official FiveM references:

- Data files: https://docs.fivem.net/docs/game-references/data-files/
- Resource manifests and `data_file`: https://docs.fivem.net/docs/scripting-reference/resource-manifest/

## Run

No installation or build is required.

Open `index.html` directly in Microsoft Edge, Chrome, Firefox, or another modern browser. For the best ZIP-import compatibility, current Edge/Chrome is recommended.

You can also serve the directory locally:

```bash
python -m http.server 8080
```

Then browse to `http://localhost:8080`.

## Recommended workflow

1. Import the complete vehicle resource ZIP/folder.
2. Open **Project Diagnostics** before changing anything.
3. Fix red errors first; review yellow warnings instead of blindly changing them.
4. Edit `handling.meta`, `vehicles.meta`, `carvariations.meta`, `carcols.meta`, or optional files.
5. Re-run diagnostics.
6. Use **Repair / merge manifest** if manifest registrations are missing/wrong.
7. Build the resource ZIP with imported binary/stream files included.
8. Test the vehicle in a development FiveM server before deploying to production.

## Design caveat

No static editor can guarantee that every numerically valid handling setup will behave perfectly on every model. YFT geometry, collision bounds, wheel placement, bones, texture dictionaries, audio assets, custom layouts, and client plugins also affect vehicle behavior. V3 therefore aims to catch deterministic file/reference errors and clearly flag extreme values without pretending every warning is an engine hard limit.
