import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useServices(category = null) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchServices = async () => {
      try {
        setLoading(true);
        setError(null);
        const query = category ? `?category=${encodeURIComponent(category)}` : "";
        const data = await apiFetch(`/services${query}`, { signal: controller.signal });
        setServices(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
          console.error(err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchServices();
    return () => controller.abort();
  }, [category]);

  return { services, loading, error };
}
