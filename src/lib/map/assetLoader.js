/**
 * Asset preloader and MapLibre image registry
 */

export const ALL_ISLAND_TYPES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16,
  37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
];

export const ALL_TOWN_STAGES = [1, 2, 3, 4, 5, 'ghost'];

export function registerMapAssets(map, onComplete) {
  if (!map) return;

  const mapInstance = map.getMap ? map.getMap() : map;
  
  // Attach fallback for any missing image
  const handleMissingImage = (e) => {
    const id = e.id;
    if (mapInstance.hasImage(id)) return;
    
    let url = null;
    let isSdf = false;
    if (id.startsWith('island_')) {
      url = `/map/islands/${id}.png`;
    } else if (id === 'rock_island') {
      url = `/map/islands/rock_island.png`;
    } else if (id.startsWith('town_')) {
      url = `/map/towns/${id}.png`;
      isSdf = true;
    } else if (id === 'empty_slot') {
      url = `/map/slots/empty_slot.png`;
      isSdf = true;
    }

    if (url) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        if (!mapInstance.hasImage(id)) {
          mapInstance.addImage(id, img, { sdf: isSdf });
          mapInstance.triggerRepaint();
        }
      };
      img.src = url;
    }
  };

  mapInstance.on('styleimagemissing', handleMissingImage);

  // Eagerly pre-load town and slot assets as SDF images (islands are now vector polygons)
  const assetList = [
    { id: 'town_5', url: '/map/towns/town_5.png', sdf: true },
    { id: 'town_4', url: '/map/towns/town_4.png', sdf: true },
    { id: 'town_3', url: '/map/towns/town_3.png', sdf: true },
    { id: 'town_2', url: '/map/towns/town_2.png', sdf: true },
    { id: 'town_1', url: '/map/towns/town_1.png', sdf: true },
    { id: 'town_ghost', url: '/map/towns/town_ghost.png', sdf: true },
    { id: 'empty_slot', url: '/map/slots/empty_slot.png', sdf: true }
  ];

  let loadedCount = 0;
  const total = assetList.length;

  assetList.forEach(({ id, url, sdf }) => {
    if (mapInstance.hasImage(id)) {
      loadedCount++;
      if (loadedCount === total && onComplete) onComplete();
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      if (!mapInstance.hasImage(id)) {
        mapInstance.addImage(id, img, { sdf: Boolean(sdf) });
      }
      loadedCount++;
      if (loadedCount === total) {
        mapInstance.triggerRepaint();
        if (onComplete) onComplete();
      }
    };
    img.onerror = () => {
      loadedCount++;
      if (loadedCount === total && onComplete) onComplete();
    };
    img.src = url;
  });
}
