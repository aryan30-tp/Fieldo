import React, { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createVectorPin = (color) => {
  return new L.DivIcon({
    html: `
      <svg width="30" height="42" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 4px rgba(0,0,0,0.3));">
        <path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0ZM12 16.5C9.51 16.5 7.5 14.49 7.5 12C7.5 9.51 9.51 7.5 12 7.5C14.49 7.5 16.5 9.51 16.5 12C16.5 14.49 14.49 16.5 12 16.5Z" fill="${color}"/>
      </svg>
    `,
    className: 'custom-vector-pin',
    iconSize: [30, 42],
    iconAnchor: [15, 32],
    popupAnchor: [0, -32]
  });
};

// 🗺️ SMART CAMERA CONTROLLER COMPONENT
function ChangeView({ activePosition, allPoints, isPlaying }) {
  const map = useMap();

  useEffect(() => {
    if (isPlaying && Array.isArray(activePosition) && typeof activePosition[0] === 'number') {
      // 🎥 PLAYBACK MODE: Camera centers on the moving position marker smoothly
      map.setView(activePosition, map.getZoom(), { animate: true, duration: 0.5 });
    } else if (!isPlaying && allPoints && allPoints.length > 0) {
      // 📐 STATIC VIEW: Auto-zoom and scale the window boundaries to capture all routes across cities
      const bounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [activePosition, allPoints, isPlaying, map]);

  return null;
}

export default function WebMap({ routePoints = [], employeeName, visitNotes = [] }) {
  const [visiblePoints, setVisiblePoints] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  
  const playbackIntervalRef = useRef(null);
  const baseSpeedMs = 600;

  useEffect(() => {
    clearInterval(playbackIntervalRef.current);
    setIsPlaying(false);
    setCurrentIndex(routePoints.length); // Render complete static data array initially
    setPlaybackTime(null);
    setSpeedMultiplier(1);
    
    if (routePoints.length > 0) {
      setVisiblePoints(routePoints);
    } else {
      setVisiblePoints([]);
    }
  }, [routePoints]);

  useEffect(() => {
    if (isPlaying) {
      clearInterval(playbackIntervalRef.current);

      if (currentIndex >= routePoints.length) {
        setVisiblePoints([]);
        setCurrentIndex(0);
      }

      const adjustedIntervalMs = baseSpeedMs / speedMultiplier;

      playbackIntervalRef.current = setInterval(() => {
        setCurrentIndex((prevIndex) => {
          if (prevIndex >= routePoints.length - 1) {
            clearInterval(playbackIntervalRef.current);
            setIsPlaying(false);
            return routePoints.length;
          }

          const nextIndex = prevIndex + 1;
          const currentPoint = routePoints[prevIndex];
          
          setVisiblePoints(routePoints.slice(0, nextIndex));
          
          if (currentPoint && currentPoint.timestamp) {
            setPlaybackTime(new Date(currentPoint.timestamp).toLocaleTimeString());
          }

          return nextIndex;
        });
      }, adjustedIntervalMs);
    } else {
      clearInterval(playbackIntervalRef.current);
    }

    return () => clearInterval(playbackIntervalRef.current);
  }, [isPlaying, routePoints, speedMultiplier]);

  // ✂️ CHRONOLOGICAL SEGMENT SPLITTER ENGINE
  const pathSegments = useMemo(() => {
    if (visiblePoints.length === 0) return [];
    
    const segments = [];
    let currentSegment = [[visiblePoints[0].lat, visiblePoints[0].lng]];

    for (let i = 1; i < visiblePoints.length; i++) {
      const prev = visiblePoints[i - 1];
      const curr = visiblePoints[i];

      // 1. Time Gap Validation (e.g., if tracking stopped for more than 20 minutes)
      const timeGapMs = curr.timestamp - prev.timestamp;
      const isTimeGap = timeGapMs > 20 * 60 * 1000; 

      // 2. Distance Jump Validation (e.g., rapid city switching via flight takeoff thresholds)
      const latGap = Math.abs(curr.lat - prev.lat);
      const lngGap = Math.abs(curr.lng - prev.lng);
      const isGeographicJump = latGap > 0.15 || lngGap > 0.15;

      if (isTimeGap || isGeographicJump) {
        segments.push(currentSegment);
        currentSegment = []; // Snaps tracking path line apart completely!
      }
      currentSegment.push([curr.lat, curr.lng]);
    }
    
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
    return segments;
  }, [visiblePoints]);

  if (!Array.isArray(routePoints) || routePoints.length === 0) {
    return (
      <div style={styles.fallbackContainer}>
        <p style={styles.fallbackText}>No operational map route data logged for this selection.</p>
      </div>
    );
  }

  const startPosition = [routePoints[0].lat, routePoints[0].lng];
  const lastIndex = currentIndex > 0 ? (currentIndex >= routePoints.length ? routePoints.length - 1 : currentIndex - 1) : 0;
  const activeEndPosition = [routePoints[lastIndex].lat, routePoints[lastIndex].lng];
  const activeTimestamp = routePoints[lastIndex]?.timestamp || Infinity;

  const validNotes = visitNotes.filter(n => {
    if (!n || typeof n.lat !== 'number') return false;
    const noteDateStr = new Date(n.timestamp).toISOString().split('T')[0];
    const activeRouteDateStr = new Date(routePoints[0].timestamp).toISOString().split('T')[0];
    return noteDateStr === activeRouteDateStr && n.timestamp <= activeTimestamp;
  });

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      
      {/* HUD CONTROL OVERLAY PANEL */}
      <div style={styles.controlPanel}>
        <div style={styles.hudHeader}>
          <span style={styles.hudTitle}>🎥 Route Replay Control</span>
          {playbackTime && <span style={styles.hudClock}>⏱️ {playbackTime}</span>}
        </div>
        
        <div style={styles.buttonGroup}>
          <button 
            style={{ ...styles.hudButton, backgroundColor: isPlaying ? '#EF4444' : '#22C55E' }}
            onClick={() => {
              if (currentIndex >= routePoints.length) {
                setVisiblePoints([]);
                setCurrentIndex(0);
              }
              setIsPlaying(!isPlaying);
            }}
          >
            {isPlaying ? '⏸️ Pause' : (currentIndex >= routePoints.length ? '▶️ Replay' : '▶️ Play')}
          </button>
          
          <button 
            style={{ ...styles.hudButton, backgroundColor: '#64748B' }}
            onClick={() => {
              setIsPlaying(false);
              clearInterval(playbackIntervalRef.current);
              setCurrentIndex(routePoints.length);
              setVisiblePoints(routePoints);
              setPlaybackTime(null);
              setSpeedMultiplier(1);
            }}
          >
            🔄 Reset
          </button>
        </div>

        <div style={styles.speedSelectorStrip}>
          <span style={styles.speedLabel}>Speed Options:</span>
          {[1, 2, 4].map((mult) => (
            <button
              key={mult}
              style={{
                ...styles.speedOptionButton,
                backgroundColor: speedMultiplier === mult ? '#3B82F6' : '#1E293B',
                borderColor: speedMultiplier === mult ? '#60A5FA' : '#334155'
              }}
              onClick={() => setSpeedMultiplier(mult)}
            >
              {mult}x
            </button>
          ))}
        </div>
      </div>

      <MapContainer center={startPosition} zoom={13} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
        {/* 🎥 Connects camera behaviors downstream */}
        <ChangeView activePosition={activeEndPosition} allPoints={routePoints} isPlaying={isPlaying} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 🗺️ Loop segments array mapping individually */}
        {pathSegments.map((pointsArray, idx) => (
          <Polyline 
            key={`segment-${idx}`}
            positions={pointsArray}
            pathOptions={{ color: '#3B82F6', weight: 6, opacity: 0.85, lineJoin: 'round' }}
          />
        ))}

        <Marker position={startPosition} icon={createVectorPin('#22C55E')}>
          <Popup>🟢 {employeeName} - Shift Started Here</Popup>
        </Marker>

        <Marker position={activeEndPosition} icon={createVectorPin('#EF4444')}>
          <Popup>
            🔴 {employeeName} - {currentIndex >= routePoints.length ? "Shift Ended Here" : "Current Replay Position"}
          </Popup>
        </Marker>

        {validNotes.map((note) => (
          <Marker key={note._id || note.timestamp} position={[note.lat, note.lng]} icon={createVectorPin('#0EA5E9')}>
            <Popup>
              <div style={styles.popupContent}>
                <h4 style={styles.popupTitle}>🏢 Client: {note.clientName}</h4>
                <p style={styles.popupSummary}>"{note.summary}"</p>
                <span style={styles.popupTime}>Logged: {new Date(note.timestamp).toLocaleTimeString()}</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

const styles = {
  controlPanel: { position: 'absolute', top: '20px', right: '20px', backgroundColor: 'rgba(15, 23, 42, 0.95)', padding: '14px', borderRadius: '10px', zIndex: 1000, border: '1px solid #334155', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', width: '280px', display: 'flex', flexDirection: 'column', gap: '10px' },
  hudHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hudTitle: { color: '#94A3B8', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' },
  hudClock: { color: '#38BDF8', fontSize: '13px', fontWeight: '700', fontFamily: 'monospace' },
  buttonGroup: { display: 'flex', gap: '8px' },
  hudButton: { flex: 1, border: 'none', color: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  speedSelectorStrip: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', borderTop: '1px solid #334155', paddingTop: '8px' },
  speedLabel: { color: '#94A3B8', fontSize: '11px', fontWeight: '600' },
  speedOptionButton: { border: '1px solid', color: '#FFFFFF', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  fallbackContainer: { flex: 1, height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center', display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '12px', padding: 24 },
  fallbackText: { color: '#64748B', fontSize: '14px', fontWeight: '500', textAlign: 'center' },
  popupContent: { padding: '2px', maxWidth: '220px' },
  popupTitle: { margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0F172A' },
  popupSummary: { margin: '0 0 6px 0', fontSize: '13px', color: '#475569', fontStyle: 'italic', lineHeight: '1.4' },
  popupTime: { fontSize: '11px', color: '#94A3B8', display: 'block' }
};