const R = 6371000; // rayon terrestre (m)
const toRad = (d) => (d * Math.PI) / 180;

/** Distance en mètres entre deux points {lat,lng} (formule de Haversine). */
function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** GeoJSON Point -> {lat,lng} */
function pointToLatLng(p) {
  if (!p || !Array.isArray(p.coordinates) || p.coordinates.length !== 2) return null;
  return { lat: p.coordinates[1], lng: p.coordinates[0] };
}

/** {lat,lng} -> GeoJSON Point */
function latLngToPoint(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return undefined;
  return { type: 'Point', coordinates: [Number(lng), Number(lat)] };
}

module.exports = { distanceMeters, pointToLatLng, latLngToPoint };
