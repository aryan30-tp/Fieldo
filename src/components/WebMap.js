import React, { useEffect, useState, useRef } from 'react';
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

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    if (Array.isArray(center) && typeof center[0] === 'number' && typeof center[1] === 'number') {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
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

  // Reset timeline context completely on param shifts
  useEffect(() => {
    clearInterval(playbackIntervalRef.current);
    setIsPlaying(false);
    setCurrentIndex(routePoints.length); // Initialize showing full completed view by default
    setPlaybackTime(null);
    setSpeedMultiplier(1);
    
    if (routePoints.length > 0) {
      setVisiblePoints(routePoints.map(p => [p.lat, p.lng]));
    } else {
      setVisiblePoints([]);
    }
  }, [routePoints]);

  // Main Dynamic Playback Ticker Loop
  useEffect(() => {
    if (isPlaying) {
      clearInterval(playbackIntervalRef.current);

      const adjustedIntervalMs = baseSpeedMs / speedMultiplier;

      playbackIntervalRef.current = setInterval(() => {
        setCurrentIndex((prevIndex) => {
          // 🛑 CRITICAL LOOP FIX: If we match or overshoot array length, immediately clear interval and lock execution state
          if (prevIndex >= routePoints.length - 1) {
            clearInterval(playbackIntervalRef.current);
            setIsPlaying(false);
            return routePoints.length; // Lock at absolute final limit maximum bound
          }

          const nextIndex = prevIndex + 1;
          const currentPoint = routePoints[prevIndex];
          
          setVisiblePoints(routePoints.slice(0, nextIndex).map(p => [p.lat, p.lng]));
          
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

  if (!Array.isArray(routePoints) || routePoints.length === 0) {
    return (
      <div style={styles.fallbackContainer}>
        <p style={styles.fallbackText}>No operational map route data logged for this selection.</p>
      </div>
    );
  }

  const startPosition = [routePoints[0].lat, routePoints[0].lng];
  
  // Guard current target endpoints safely
  const lastIndex = currentIndex > 0 ? (currentIndex >= routePoints.length ? routePoints.length - 1 : currentIndex - 1) : 0;
  const activeEndPosition = [routePoints[lastIndex].lat, routePoints[lastIndex].lng];
  const activeTimestamp = routePoints[lastIndex]?.timestamp || Infinity;

  // 🟢 TIME-SYNC FILTER: CRM visit notes only appear if they match or precede the current route line playback time
  // When not playing and in "Static View", activeTimestamp is the absolute final point, showing ALL notes automatically.
  // 🟢 FIXED DATE-LOCK FILTER: Ensure notes only show up if they match BOTH the location coordinates AND the exact selected shift date
  const validNotes = Array.isArray(visitNotes) 
    ? visitNotes.filter(n => {
        const hasCoords = n && typeof n.lat === 'number' && typeof n.lng === 'number';
        if (!hasCoords) return false;
        
        // 1. Extract the YYYY-MM-DD string from the note's timestamp
        const noteDateStr = new Date(n.timestamp).toISOString().split('T')[0];
        
        // 2. Find the active date currently selected in the attendance panel tracker
        // We look for a point in the active route array to match the current date context
        const activeRouteDateStr = routePoints[0]?.timestamp 
          ? new Date(routePoints[0].timestamp).toISOString().split('T')[0]
          : null;

        // 3. Only pass notes that belong to the active day being displayed
        if (activeRouteDateStr && noteDateStr !== activeRouteDateStr) {
          return false;
        }

        // 4. Chronological playback rule: check if it's within the current replay frame timeline
        return n.timestamp <= activeTimestamp;
      }) 
    : [];

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
                // If at the end, clear views to trigger full timeline rebuild from step zero
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
              setVisiblePoints(routePoints.map(p => [p.lat, p.lng]));
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
        
        <span style={styles.progressLabel}>
          Point {currentIndex >= routePoints.length ? routePoints.length : currentIndex} of {routePoints.length} ({speedMultiplier}x)
        </span>
      </div>

      <MapContainer center={startPosition} zoom={15} style={{ height: '100%', width: '100%', borderRadius: '12px' }}>
        <ChangeView center={activeEndPosition} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {visiblePoints.length > 0 && (
          <Polyline 
            positions={visiblePoints} 
            pathOptions={{ color: '#3B82F6', weight: 6, opacity: 0.85, lineJoin: 'round' }} 
          />
        )}

        {/* Start Location Pin */}
        <Marker position={startPosition} icon={createVectorPin('#22C55E')}>
          <Popup>🟢 {employeeName} - Shift Started Here</Popup>
        </Marker>

        {/* Dynamic Position Pin */}
        <Marker position={activeEndPosition} icon={createVectorPin('#EF4444')}>
          <Popup>
            🔴 {employeeName} - {currentIndex >= routePoints.length ? "Shift Ended Here" : "Current Replay Position"}
          </Popup>
        </Marker>

        {/* 📝 CHRONOLOGICAL CRM VISITS: Pins spawn into existence only when their timestamp conditions clear */}
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
  speedOptionButton: { border: '1px solid', color: '#FFFFFF', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' },
  progressLabel: { color: '#64748B', fontSize: '11px', textAlign: 'center', fontStyle: 'italic' },
  fallbackContainer: { flex: 1, height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center', display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '12px', padding: 24 },
  fallbackText: { color: '#64748B', fontSize: '14px', fontWeight: '500', textAlign: 'center' },
  popupContent: { padding: '2px', maxWidth: '220px' },
  popupTitle: { margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: '#0F172A' },
  popupSummary: { margin: '0 0 6px 0', fontSize: '13px', color: '#475569', fontStyle: 'italic', lineHeight: '1.4' },
  popupTime: { fontSize: '11px', color: '#94A3B8', display: 'block' }
};