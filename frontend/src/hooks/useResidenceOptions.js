import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

/**
 * Project -> building -> unit choices for the enrolment form.
 *
 * Projects and buildings exist because a camera was installed for them; the
 * unit codes are the ones an admin entered for the building. Everything is a
 * dropdown so a resident cannot mistype a unit that does not exist.
 */
export function useResidenceOptions() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/units/enrollment-options');
      const result = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(result)) throw new Error('Could not load residences.');
      setProjects(result.filter((project) => project?.project && Array.isArray(project.buildings)));
    } catch (requestError) {
      setProjects([]);
      setError(requestError.message || 'Could not load residences. Check the backend connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { projects, loading, error, reload: load };
}
