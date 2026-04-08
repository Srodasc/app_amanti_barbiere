'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Client } from '@/types';
import { getCurrentAdmin } from '@/lib/utils';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const adminId = await getCurrentAdmin();
    if (!adminId) {
      setClients([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');

    if (error) {
      setError(error.message);
    } else {
      setClients(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const addClient = async (client: Partial<Client> & { name: string; phone: string }) => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('clients')
      .insert(client)
      .select()
      .single();

    if (!error && data) {
      setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return { data, error };
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      setClients((prev) =>
        prev.map((c) => (c.id === id ? data : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    return { data, error };
  };

  const deleteClient = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('clients').delete().eq('id', id);

    if (!error) {
      setClients((prev) => prev.filter((c) => c.id !== id));
    }
    return { error };
  };

  const searchClients = (query: string) => {
    if (!query) return clients;
    const lowerQuery = query.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        (c.phone && c.phone.includes(query)) ||
        (c.email && c.email.toLowerCase().includes(lowerQuery))
    );
  };

  return {
    clients,
    isLoading,
    error,
    addClient,
    updateClient,
    deleteClient,
    searchClients,
    refresh: fetchClients,
  };
}
