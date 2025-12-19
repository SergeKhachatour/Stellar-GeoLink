import React, { createContext, useContext, useState } from 'react';

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

  const showMap = (data) => {
    console.log('[AIMapContext] showMap called with data:', data);
    setMapData(data);
    setMapVisible(true);
    console.log('[AIMapContext] Map should now be visible');
  };

  const hideMap = () => {
    setMapVisible(false);
    setMapData(null);
  };

  const updateMap = (data) => {
    setMapData(prev => ({ ...prev, ...data }));
  };

  return (
    <AIMapContext.Provider
      value={{
        mapData,
        mapVisible,
        showMap,
        hideMap,
        updateMap
      }}
    >
      {children}
    </AIMapContext.Provider>
  );
};

