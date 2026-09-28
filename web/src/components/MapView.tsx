'use client';

import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'agent' | 'agent-off' | 'checkpoint' | 'site' | 'incident' | 'sos' | 'scan-ok' | 'scan-bad' | 'pick';
  label?: string;
  popup?: string; // HTML
  radius?: number; // cercle de tolérance (m)
}

interface Props {
  markers: MapMarker[];
  track?: [number, number][];
  center?: [number, number];
  zoom?: number;
  className?: string;
  onPick?: (lat: number, lng: number) => void;
  fitKey?: string; // change pour recadrer sur les marqueurs
  focus?: { lat: number; lng: number; zoom?: number } | null;
}

const KINSHASA: [number, number] = [-4.325, 15.322];

const STYLE: Record<MapMarker['kind'], { bg: string; ring: string; size: number; glyph: string }> = {
  agent: { bg: '#10b981', ring: '#064e3b', size: 26, glyph: '👮' },
  'agent-off': { bg: '#52525b', ring: '#27272a', size: 24, glyph: '👮' },
  checkpoint: { bg: '#e5e7eb', ring: '#e92026', size: 18, glyph: '' },
  site: { bg: '#18181b', ring: '#e92026', size: 30, glyph: '🏭' },
  incident: { bg: '#f59e0b', ring: '#78350f', size: 28, glyph: '⚠️' },
  sos: { bg: '#e92026', ring: '#fff', size: 34, glyph: '🆘' },
  'scan-ok': { bg: '#10b981', ring: '#064e3b', size: 14, glyph: '' },
  'scan-bad': { bg: '#e92026', ring: '#450a0a', size: 16, glyph: '' },
  pick: { bg: '#e92026', ring: '#fff', size: 22, glyph: '' },
};

function iconHtml(m: MapMarker) {
  const s = STYLE[m.kind];
  const pulse = m.kind === 'sos' ? 'sos-pulse' : '';
  const label = m.label
    ? `<div style="position:absolute;top:${s.size + 2}px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#0b0b0cdd;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid #2a2a2e">${m.label}</div>`
    : '';
  return `<div style="position:relative;width:${s.size}px;height:${s.size}px">
    <div class="${pulse}" style="width:${s.size}px;height:${s.size}px;border-radius:9999px;background:${s.bg};border:2px solid ${s.ring};display:flex;align-items:center;justify-content:center;font-size:${Math.round(s.size * 0.5)}px;box-shadow:0 2px 6px #0008">${s.glyph}</div>
    ${label}
  </div>`;
}

export default function MapView({ markers, track, center, zoom = 13, className, onPick, fitKey, focus }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const fittedKey = useRef<string | undefined>(undefined);
  const drawRef = useRef<() => void>(() => {});

  // Création de la carte (une seule fois, côté navigateur)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center || KINSHASA, zoom);
      const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      });
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagerie &copy; Esri',
      });
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
      dark.addTo(map);
      L.control.layers({ Sombre: dark, Satellite: sat, Plan: osm }, {}, { position: 'topright' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on('click', (e: Leaflet.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
      drawRef.current(); // dernière version des marqueurs (les données ont pu arriver avant Leaflet)
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const m of markers) {
      if (m.lat == null || m.lng == null) continue;
      if (m.radius) {
        L.circle([m.lat, m.lng], {
          radius: m.radius,
          color: m.kind === 'site' ? '#e92026' : '#e5e7eb',
          weight: 1,
          opacity: 0.5,
          fillOpacity: 0.05,
          dashArray: '4 4',
        }).addTo(layer);
      }
      const s = STYLE[m.kind];
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({ html: iconHtml(m), className: '', iconSize: [s.size, s.size], iconAnchor: [s.size / 2, s.size / 2] }),
        zIndexOffset: m.kind === 'sos' ? 1000 : m.kind.startsWith('agent') ? 500 : 0,
      });
      if (m.popup) marker.bindPopup(m.popup);
      marker.addTo(layer);
      bounds.push([m.lat, m.lng]);
    }
    if (track && track.length > 1) {
      L.polyline(track, { color: '#e92026', weight: 3, opacity: 0.8 }).addTo(layer);
      bounds.push(...track);
    }
    if (bounds.length && fittedKey.current !== (fitKey ?? 'init')) {
      fittedKey.current = fitKey ?? 'init';
      if (bounds.length === 1) map.setView(bounds[0], Math.max(map.getZoom(), 16));
      else map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 18 });
    }
  }

  drawRef.current = draw;

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, track, fitKey]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.setView([focus.lat, focus.lng], focus.zoom || 17);
  }, [focus]);

  return <div ref={el} className={className || 'h-full w-full'} style={{ minHeight: 280, cursor: onPick ? 'crosshair' : undefined }} />;
}
