/**
 * Asset preloader and MapLibre image registry
 */

export const ALL_ISLAND_TYPES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16,
  37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
  47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60
];

export function registerMapAssets(map, onComplete) {
  if (!map) return;

  const mapInstance = map.getMap ? map.getMap() : map;
  
  // Attach fallback for any missing image
  const handleMissingImage = (e) => {
    const id = e.id;
    if (mapInstance.hasImage(id)) return;
    
    let url = null;
    if (id.startsWith('island_')) {
      url = `/map/islands/${id}.png`;
    } else if (id.startsWith('town_')) {
      url = `/map/towns/${id}.png`;
    } else if (id === 'empty_slot') {
      url = `/map/slots/empty_slot.png`;
    }

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
  };

  mapInstance.on('styleimagemissing', handleMissingImage);

  // Eagerly pre-load all assets
  const assetList = [
    { id: 'town_5', url: '/map/towns/town_5.png' },
    { id: 'town_4', url: '/map/towns/town_4.png' },
    { id: 'town_3', url: '/map/towns/town_3.png' },
    { id: 'town_2', url: '/map/towns/town_2.png' },
    { id: 'town_1', url: '/map/towns/town_1.png' },
    { id: 'empty_slot', url: '/map/slots/empty_slot.png' }
  ];

  ALL_ISLAND_TYPES.forEach(t => {
    assetList.push({ id: `island_${t}`, url: `/map/islands/island_${t}.png` });
  });

  let loadedCount = 0;
  const total = assetList.length;

  assetList.forEach(({ id, url }) => {
    if (mapInstance.hasImage(id)) {
      loadedCount++;
      if (loadedCount === total && onComplete) onComplete();
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      if (!mapInstance.hasImage(id)) {
        mapInstance.addImage(id, img);
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
