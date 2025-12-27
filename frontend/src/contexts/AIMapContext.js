import React, { createContext, useContext, useState, useCallback } from 'react';

const AIMapContext = createContext();

export const useAIMap = () => {
  const context = useContext(AIMapContext);
  if (!context) {
    throw new Error('useAIMap must be used within AIMapProvider');
  }
  return context;
};

export const AIMapProvider = ({ children }) => {
  const [mapData, setMapData] = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(20000000); // Default to global (20,000 km - matches xyz-wallet)
  const [userLocation, setUserLocation] = useState(null);

  const showMap = (data) => {
    console.log('[AIMapContext] showMap called with data:', {
      type: data?.type,
      hasData: !!data?.data,
      dataCount: data?.data?.length || 0,
      dataIsArray: Array.isArray(data?.data),
      fullData: data // Log full data structure
    });
    
    // Ensure data structure is correct
    if (data && !data.data && data.type) {
      console.warn('[AIMapContext] Map data missing data array, attempting to fix structure');
      // If data has type but no data array, it might be malformed
      // Try to preserve the structure as-is
    }
    
    setMapData(data);
    setMapVisible(true);
    console.log('[AIMapContext] Map should now be visible');
  };

  const hideMap = () => {
    setMapVisible(false);
    // Don't clear mapData - keep it so user can show map again
    // mapData is only cleared when explicitly needed (e.g., new query)
  };

  const updateMap = (data) => {
    setMapData(prev => ({ ...prev, ...data }));
  };

  const updateProximityRadius = (radius) => {
    setProximityRadius(radius);
    console.log('[AIMapContext] Proximity radius updated to:', radius);
  };

  const updateUserLocation = useCallback((location) => {
    // Only update if location actually changed to prevent infinite loops
    setUserLocation(prev => {
      if (prev && location && 
          prev.latitude === location.latitude && 
          prev.longitude === location.longitude) {
        return prev; // No change, return previous value to prevent re-render
      }
      console.log('[AIMapContext] User location updated:', location);
      return location;
    });
  }, []);

  return (
    <AIMapContext.Provider
      value={{
        mapData,
        mapVisible,
        proximityRadius,
        userLocation,
        showMap,
        hideMap,
        updateMap,
        updateProximityRadius,
        updateUserLocation
      }}
    >
      {children}
    </AIMapContext.Provider>
  );
};

