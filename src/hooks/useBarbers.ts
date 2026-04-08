'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Barber } from '@/types';

export function useBarbers() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBarbers = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('barbers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      setError(error.message);
    } else {
      setBarbers(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchBarbers();
  }, [fetchBarbers]);

  const addBarber = async (barber: Partial<Barber> & { name: string; phone: string }) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('barbers')
      .insert(barber)
      .select()
      .single();

    if (!error && data) {
      setBarbers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return { data, error };
  };

  const updateBarber = async (id: string, updates: Partial<Barber>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('barbers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      setBarbers((prev) =>
        prev.map((b) => (b.id === id ? data : b)).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return { data, error };
  };

  const deleteBarber = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('barbers')
      .update({ is_active: false })
      .eq('id', id);

    if (!error) {
      setBarbers((prev) => prev.filter((b) => b.id !== id));
    }
    return { error };
  };

  const toggleActive = async (id: string) => {
    const barber = barbers.find((b) => b.id === id);
    if (!barber) return { error: 'Barber not found' };
    return updateBarber(id, { is_active: !barber.is_active });
  };

  return {
    barbers,
    isLoading,
    error,
    addBarber,
    updateBarber,
    deleteBarber,
    toggleActive,
    refresh: fetchBarbers,
  };
}
