# Comprehensive Technical Survey: Asset Pipeline & Terrain Alignment (Requirements R1 & R4)

**Surveyor**: Explorer 1 (Asset Pipeline & Terrain Alignment)  
**Date**: 2026-08-30  
**Scope**: Requirements R1 & R4 of the Next-Generation Grepolis World Map & Command Center  

---

## 1. Executive Summary

This investigation performed a complete audit of the 4K Asset Pipeline, MapLibre GL rendering infrastructure, island slot definitions, shoreline bay coordinate alignment, scaling proportion curves, and multi-LOD layer stack.

### Core Discoveries:
1. **Island Terrain Coverage**: All 40 colonizable Grepolis island terrain types exist as $512 \times 512$ RGBA PNGs in `public/map/islands/` (types `island_1`–`island_16` and `island_37`–`island_60`).
2. **Alpha Cutout Defect on Island 1**: While all 5 town stage models (`town_1`–`town_5`), the empty slot icon (`empty_slot`), and 39 of the 40 island terrain sprites have 100% clean alpha cutouts (0 border noise, 0 corner alpha), `public/map/islands/island_1.png` contains 89,979 pixels with faint residual background alpha ($\alpha \approx 21\text{--}27$), producing a visible square bounding box artifact on dark sea backgrounds.
3. **Shoreline Bay Coordinates**: All 40 colonizable island types (types 1–16 and 37–60) have complete official shoreline town offset definitions in `src/lib/map/island_definitions.json` (0 missing across all 40 types). Synthetic ring fallback in `src/lib/geojson.js` only occurs when non-colonizable decorative rocks (types 17–36) or unmapped types are processed.
4. **Physical Proportion Curve ($0.007 \times 2^Z$)**: MapLibre's Web Mercator projection spans $512 \times 2^Z$ screen pixels over the 128,000 Grepolis world pixels ($0.004 \times 2^Z\text{ px/Grepolis px}$). For nominal $512\text{px}$ island sprites covering $7\text{--}8$ tiles ($896\text{--}1024\text{px}$), the mathematically calibrated scaling factor is $k \approx 0.007 \times 2^Z$. The current implementation in `src/app/map/page.js` uses $k \approx 0.0059 \times 2^Z$ (~15% undersized).
5. **Sprite Loading & Stability**: `src/lib/map/assetLoader.js` implements both eager preloading and dynamic `styleimagemissing` fallback. Eager preloading ensures zero missing image warnings or WebGL canvas dropouts.

---

## 2. Investigation Area 1: Island Assets & Terrain Types

### 2.1 File System Asset Locations
- **Production Asset Directory**: `public/map/islands/`
  - Contains 41 PNG files: `island1.png` (legacy $1024 \times 1024$), `island_1.png` through `island_16.png`, and `island_37.png` through `island_60.png` ($512 \times 512$ RGBA).
- **Source / Legacy Directory**: `src/lib/map/`
  - Contains low-resolution original thumbnail files: `1.png` through `16.png` and `37.png` through `60.png` ($115 \times 64$ to $230 \times 115\text{px}$).

### 2.2 Complete Grepolis Island Type Breakdown (60 Types)

| Island Type Range | Count | Classification | Town Slots | Farming Villages | Status in `public/map/islands/` |
|---|---|---|---|---|---|
| **1 – 10** | 10 | Large Colonizable Islands | 20 slots | 6 farming villages | `island_1.png` to `island_10.png` ($512 \times 512$) |
| **11 – 16** | 6 | Small Colonizable Islands | 7–13 slots | 0 (Uninhabited) | `island_11.png` to `island_16.png` ($512 \times 512$) |
| **17 – 36** | 20 | Decorative Rocks | 0 slots | 0 | Rendered as vector dots (`rocks-points`); no sprite needed |
| **37 – 46** | 10 | Large Colonizable Islands | 20 slots | 6 farming villages | `island_37.png` to `island_46.png` ($512 \times 512$) |
| **47 – 60** | 14 | Small Colonizable Islands | 6–11 slots | 0 (Uninhabited) | `island_47.png` to `island_60.png` ($512 \times 512$) |
| **Total Colonizable** | **40** | — | — | — | **All 40 Present** |

### 2.3 Asset Mapping Pipeline
1. **Asset Preloader** (`src/lib/map/assetLoader.js`, line 5):
   ```javascript
   export const ALL_ISLAND_TYPES = [
     1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
     11, 12, 13, 14, 15, 16,
     37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
     47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
   ];
   ```
2. **GeoJSON Generation** (`src/lib/geojson.js`, lines 167–182):
   - Sets `properties.islandType = island.type` and `properties.renderType = isRock ? 'rock' : 'island'`.
3. **MapLibre Expression Matcher** (`src/app/map/page.js`, lines 496–539):
   - Evaluates `["match", ["get", "islandType"], 1, "island_1", ..., 60, "island_60", "island_1"]`.

---

## 3. Investigation Area 2: Town Growth Stages & Empty Slot Assets

### 3.1 Town Stage Point Thresholds & Assets

| Stage | Name | In-Game Point Range | Sprite File | Dimensions | Alpha Transparency |
|---|---|---|---|---|---|
| **Stage 1** | Hamlet | 175 – 599 pts | `public/map/towns/town_1.png` | $256 \times 256$ RGBA | 65.7% transparent, 0 border noise |
| **Stage 2** | Village | 600 – 2,399 pts | `public/map/towns/town_2.png` | $256 \times 256$ RGBA | 58.6% transparent, 0 border noise |
| **Stage 3** | Town | 2,400 – 5,499 pts | `public/map/towns/town_3.png` | $256 \times 256$ RGBA | 66.0% transparent, 0 border noise |
| **Stage 4** | City | 5,500 – 9,999 pts | `public/map/towns/town_4.png` | $256 \times 256$ RGBA | 66.0% transparent, 0 border noise |
| **Stage 5** | Metropolis | 10,000+ pts | `public/map/towns/town_5.png` | $256 \times 256$ RGBA | 58.7% transparent, 0 border noise |
| **Empty** | Empty Slot | Available Slot | `public/map/slots/empty_slot.png` | $256 \times 256$ RGBA | 56.4% transparent, 0 border noise |

### 3.2 Alpha Cutout & Background Artifact Audit

Direct binary inspection of decoded PNG scanlines revealed:
- **Town Stage Sprites (`town_1` through `town_5`)**: 100% clean borders (1020 border pixels sampled per image, 0 non-zero alpha border pixels).
- **Empty Slot Sprite (`empty_slot.png`)**: 100% clean borders (1020 border pixels sampled, 0 non-zero alpha).
- **Islands `island_2` through `island_16` and `island_37` through `island_60`**: 100% clean borders and 0 corner alpha.
- **Defect in `island_1.png`**:
  - `cornersAlphaZero: false` (corner alpha values: `[27, 21, 22, 28]`).
  - Contains 89,979 pixels with $\alpha \in [1, 35]$.
  - This causes a square bounding box halo around Island 1 on dark map backgrounds (`#0b101e`).
- **Remediation**: Running an alpha mask filter (clamping $\alpha \le 30 \to 0$) or applying `scripts/clean_all_sprites_alpha.js` logic to `island_1.png` eliminates this defect immediately.

---

## 4. Investigation Area 3: Sprite Loading & WebGL Stability

### 4.1 Loading Mechanism in `src/lib/map/assetLoader.js`

```javascript
export function registerMapAssets(map, onComplete) {
  const mapInstance = map.getMap ? map.getMap() : map;
  
  // Dynamic fallback on styleimagemissing
  mapInstance.on('styleimagemissing', (e) => {
    const id = e.id;
    if (mapInstance.hasImage(id)) return;
    let url = null;
    if (id.startsWith('island_')) url = `/map/islands/${id}.png`;
    else if (id.startsWith('town_')) url = `/map/towns/${id}.png`;
    else if (id === 'empty_slot') url = `/map/slots/empty_slot.png`;
    
    if (url) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        if (!mapInstance.hasImage(id)) {
          mapInstance.addImage(id, img);
          mapInstance.triggerRepaint();
        }
      };
      img.src = url;
    }
  });

  // Eager preloader across all 46 assets
  const assetList = [
    { id: 'town_5', url: '/map/towns/town_5.png' },
    ...
    { id: 'empty_slot', url: '/map/slots/empty_slot.png' }
  ];
  ALL_ISLAND_TYPES.forEach(t => assetList.push({ id: `island_${t}`, url: `/map/islands/island_${t}.png` }));
  ...
}
```

### 4.2 Stability Assessment & Best Practices
1. **Duplicate ID Prevention**: All `mapInstance.addImage(id, img)` calls are guarded with `if (!mapInstance.hasImage(id))`, preventing WebGL runtime collisions.
2. **CORS & Image Decoding**: Using `img.crossOrigin = "Anonymous"` prevents canvas tainting.
3. **Eager Preloading Guarantee**: By preloading all 46 assets on map initialization (`handleMapLoad`), MapLibre receives all textures before zooming/panning requests them.

---

## 5. Investigation Area 4: Island Slot Definitions & Shoreline Bay Alignment

### 5.1 Slot Definitions Source
- **File**: `src/lib/map/island_definitions.json` (9,377 lines, 149 KB)
- **Data Structure**:
  ```json
  {
    "width": 8,
    "height": 5,
    "img": "island1.png",
    "centering_offset_x": 12,
    "centering_offset_y": 25,
    "town_offsets": [
      { "x": 451, "y": 130, "dir": "nw", "fx": 54, "fy": 15 },
      { "x": 351, "y": 168, "dir": "nw", "fx": 54, "fy": 15 },
      ...
    ]
  }
  ```

### 5.2 Slot Completeness Verification
An exhaustive programmatic scan of all 40 colonizable island types verified:
- **Types 1–10**: Exactly 20 slot offsets per island (200 slots total).
- **Types 11–16**: 7 to 13 slot offsets per island (53 slots total).
- **Types 37–46**: Exactly 20 slot offsets per island (200 slots total).
- **Types 47–60**: 6 to 11 slot offsets per island (128 slots total).
- **Total Defined Official Slots**: **581 official shoreline slot positions**.
- **Missing Slots across 40 types**: **0**.

### 5.3 Coordinate Transformation & Directional Offsets
In `src/lib/geojson.js` (lines 7–17 and 215–221):
- Global coordinate space: $1000 \text{ tiles} \times 128\text{px} = 128,000\text{px}$.
- Tile Origin: `islandPixelX = island.x * 128`, `islandPixelY = island.y * 128 + ((island.x & 1) ? 64 : 0)`.
- Directional Offsets for town orientation:
  ```javascript
  const TOWN_DIR_OFFSETS = {
    nw: { x: 9, y: 14 },
    ne: { x: 17, y: 11 },
    sw: { x: 10, y: 13 },
    se: { x: 15, y: 13 }
  };
  const FREE_SLOT_OFFSET = { x: 18, y: 18 };
  ```
- Exact slot calculation:
  ```javascript
  const townPixelX = islandPixelX + slotDef.x + dirOffset.x;
  const townPixelY = islandPixelY + slotDef.y + dirOffset.y;
  const slotLng = (townPixelX / 128000) * 360 - 180;
  const slotLat = -((townPixelY / 128000) * 180 - 90);
  ```

### 5.4 Eliminating Synthetic Ring Fallback
In `src/lib/geojson.js` lines 223–229, an artificial circular orbit fallback was implemented:
```javascript
// Orbit fallback if type definition is missing
dir = 'nw';
const orbitRadius = isRock ? 0.10 : 0.15;
const angle = (slot / totalSlotCount) * Math.PI * 2;
slotLat = islandLat + Math.sin(angle) * orbitRadius;
slotLng = islandLng + Math.cos(angle) * orbitRadius / Math.cos(islandLat * Math.PI / 180);
```
**Elimination Strategy**:
1. Because all 40 colonizable types (1–16, 37–60) possess valid `town_offsets`, colonizable islands never need fallback.
2. Filter out decorative rock islands (types 17–36) from generating empty slots (`properties.renderType === 'rock'`).
3. Ensure slot indices in database queries are clamped to `definedSlots.length - 1` rather than generating artificial slots beyond the island capacity.

---

## 6. Investigation Area 5: Scaling & Physical Proportion Curves

### 6.1 Mathematical Derivation of $0.007 \times 2^Z$

In Web Mercator (MapLibre GL):
- Map world width at zoom level $Z$ is $W_{\text{screen}} = 512 \times 2^Z$ pixels.
- The Grepolis coordinate space spans $W_{\text{grepo}} = 128,000$ pixels across the full $360^\circ$ world.
- Scale ratio $S(Z) = \frac{512 \times 2^Z}{128000} = 0.004 \times 2^Z \text{ screen px / Grepolis world px}$.
- An island landmass spanning 7–8 tiles has physical Grepolis width $W_{\text{island}} \approx 896\text{--}1024\text{ world px}$.
- On a $512 \times 512$ asset texture, the scaling factor to match physical world width is:
  $$\text{icon-size}(Z) = \frac{W_{\text{island}}}{512} \times S(Z) \approx \frac{896\text{--}1024}{512} \times 0.004 \times 2^Z \approx 0.007 \times 2^Z$$

### 6.2 Calibrated Curve vs Current Implementation

| Zoom Level $Z$ | Calibrated Island Size ($0.007 \times 2^Z$) | Current in `page.js` | Town Sprite Size ($256\text{px}$) | Empty Slot Size ($256\text{px}$) |
|---|---|---|---|---|
| **5.0** | 0.224 | 0.19 | (dots only) | (dots only) |
| **6.0** | 0.448 | 0.39 | (dots only) | (dots only) |
| **6.5** | 0.633 | — | 0.120 | 0.090 |
| **7.0** | 0.896 | 0.78 | 0.170 | 0.127 |
| **8.0** | 1.792 | 1.56 | 0.339 | 0.254 |
| **9.0** | 3.584 | 3.12 | 0.678 | 0.509 |
| **10.0** | 7.168 | 6.25 | 1.357 | 1.018 |
| **11.0** | 14.336 | — | 2.714 | 2.036 |
| **12.0** | 28.672 | — | 5.428 | 4.072 |

Applying the calibrated $0.007 \times 2^Z$ curve locks town models and empty slots precisely inside their shoreline bays without drifting as zoom changes from 5 to 12.

---

## 7. Investigation Area 6: Multi-LOD Layer Stack

### 7.1 Complete MapLibre Layer Stack Specification

```
Zoom Level:  2.0       3.5       5.0   5.5   6.5   6.8       8.5       12.0
             |---------|---------|-----|-----|-----|---------|---------|
Clusters:    [=========================] (Macro density bubbles)
Island Dots: [=========================]
Rock Dots:   [===============================]
Landmasses:                      [=====================================] (4K Island Sprites)
Town Points:           [=====================]
3D Towns:                                    [=========================] (Stage 1-5 Sprites)
Empty Slots:                                       [===================] (Empty Slot Sprites)
Flag Badges:                                       [===================] (Alliance Hex Flags)
Town Labels:                                                 [=========] (Halo Labels)
```

### 7.2 Detailed Layer Configuration Matrix

| Layer ID | Source | Type | Min Zoom | Max Zoom | Key Paint / Layout Attributes |
|---|---|---|---|---|---|
| `ocean-lines` | `ocean-grid-source` | `line` | 2.0 | 12.0 | `#1e293b`, dashed `[2, 2]` |
| `ocean-labels` | `ocean-grid-source` | `symbol` | 2.0 | 12.0 | Text `O00`–`O99`, font Noto Sans, `#334155` |
| `route-line-glow` | `route-line-source` | `line` | 2.0 | 12.0 | `#38bdf8`, width 6, opacity 0.5, blur 3 |
| `route-line` | `route-line-source` | `line` | 2.0 | 12.0 | `#38bdf8`, width 2.5, dasharray `[3, 2]` |
| `islands-points` | `islands-source` | `circle` | 2.0 | 5.5 | Radius 2.5 to 9.0, dominant alliance color |
| `rocks-points` | `rocks-source` | `circle` | 2.0 | 6.5 | Radius 1.5 to 7.0, `#1e293b` |
| `island-sprites` | `islands-source` | `symbol` | 5.0 | 12.0 | `icon-image`: `island_1`..`island_60`, `icon-size`: $0.007 \times 2^Z$ |
| `clusters` | `towns-source` | `circle` | 2.0 | 5.5 | Radius 14 to 24, step colors by `point_count` |
| `cluster-count` | `towns-source` | `symbol` | 2.0 | 5.5 | `{point_count_abbreviated}`, text-color `#ffffff` |
| `town-points` | `towns-source` | `circle` | 3.5 | 6.8 | Radius sized by town stage + highlight |
| `town-sprites` | `towns-source` | `symbol` | 6.5 | 12.0 | `town_1`..`town_5`, anchor `bottom`, exponential scaling |
| `empty-slots-points`| `empty-slots-source` | `circle`| 5.5 | 7.0 | Radius 2.5, `#ffffff`, opacity 0.4 |
| `empty-slots-sprites`| `empty-slots-source` | `symbol`| 6.8 | 12.0 | `icon-image`: `empty_slot`, anchor `center` |
| `town-flags` | `towns-source` | `circle` | 6.8 | 12.0 | `circle-translate`: `[0, -18]`, live alliance color, white stroke |
| `town-labels` | `towns-source` | `symbol` | 8.5 | 12.0 | Text offset `[0, -3.2]`, halo `#0b101e`, halo-width 2.5 |

---

## 8. Synthesis of Survey Findings & Recommendations

1. **Asset Cutout Fix**: Re-export or clean `public/map/islands/island_1.png` by zeroing low-alpha noise ($\alpha < 30$) to eliminate the square box artifact.
2. **Proportion Calibration**: Adjust `icon-size` interpolation stops in `src/app/map/page.js` to match $0.007 \times 2^Z$ precisely across zoom levels 5.0 to 12.0.
3. **Shoreline Bay Alignment**: Keep the official coordinate calculations in `src/lib/geojson.js` using `islandDefinitions[island.type].town_offsets` and eliminate synthetic ring fallback completely for colonizable islands.
4. **WebGL Cleanliness**: Maintain eager asset registration in `assetLoader.js` with `styleimagemissing` fallback to guarantee 0 console warnings and zero WebGL canvas dropouts.
