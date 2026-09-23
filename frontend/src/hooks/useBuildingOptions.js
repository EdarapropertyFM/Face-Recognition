import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

export function useBuildingOptions() {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBuildings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/buildings/enrollment-options');
      const result = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(result)) throw new Error('Could not load residences.');
      setBuildings(result.filter((building) => building?.code && Array.isArray(building.units)));
    } catch (requestError) {
      setBuildings([]);
      setError(requestError.message || 'Could not load residences. Check the backend connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(loadBuildings, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadBuildings]);

  return { buildings, loading, error, reload: loadBuildings };
}
