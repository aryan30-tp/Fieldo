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
  // Fallback if no data is passed or if the first segment is empty
  if (!routePoints || routePoints.length === 0 || !routePoints[0] || routePoints[0].length === 0) {
    return <div style={{ padding: 20 }}>No route data found for this date.</div>;
  }

  // Set the center to the first coordinate of the FIRST segment
  const startPosition = routePoints[0][0];
  
  // Find the very last coordinate of the LAST segment for the current location marker
  const lastSegment = routePoints[routePoints.length - 1];
  const endPosition = lastSegment[lastSegment.length - 1];

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer center={startPosition} zoom={14} style={{ height: '100%', width: '100%' }}>
        <ChangeView center={startPosition} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* ✂️ Loop through the segments and draw a separate line for each chunk! */}
        {routePoints.map((segment, index) => (
          <Polyline 
            key={index} 
            positions={segment} 
            pathOptions={{ color: '#007bff', weight: 4 }} 
          />
        ))}

        {/* Start Location Marker */}
        <Marker position={startPosition}>
          <Popup>{employeeName} - Shift Started Here</Popup>
        </Marker>

        {/* Last Known / Current Location Marker */}
        {startPosition !== endPosition && (
          <Marker position={endPosition}>
            <Popup>{employeeName} - Last Known Location</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}