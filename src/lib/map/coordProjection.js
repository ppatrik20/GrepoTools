export function worldToLng(x) {
    return (x / 1000) * 360 - 180;
}

export function worldToLat(y) {
    return -((y / 1000) * 180 - 90);
}

export function pixelToLng(px) {
    return (px / 128000) * 360 - 180;
}

export function pixelToLat(py) {
    return -((py / 128000) * 180 - 90);
}

export function lngToWorldX(lng) {
    return Math.round((lng + 180) / 360 * 1000);
}

export function latToWorldY(lat) {
    return Math.round((90 - lat) / 0.18);
}

export function worldToLngLat(x, y) {
    return [worldToLng(x), worldToLat(y)];
}
