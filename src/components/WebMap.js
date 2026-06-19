import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Helper component: Forces Leaflet to fly to new coordinates when props change
function ChangeView({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
}

export default function WebMap({ routePoints, employeeName }) {
  // Fallback if no data is passed
  if (!routePoints || routePoints.length === 0) {
    return <div style={{ padding: 20 }}>No route data found for this date.</div>;
  }

  // Set the center to the first coordinate in the employee's route
  const startPosition = routePoints[0];

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer center={startPosition} zoom={14} style={{ height: '100%', width: '100%' }}>
        <ChangeView center={startPosition} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline positions={routePoints} pathOptions={{ color: '#007bff', weight: 4 }} />

        <Marker position={startPosition}>
          <Popup>{employeeName} - Start Location</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}