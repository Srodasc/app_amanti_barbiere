'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Appointment, AppointmentStatus } from '@/types';
import { calculateEndTime, getCurrentAdmin } from '@/lib/utils';

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const adminId = await getCurrentAdmin();
    if (!adminId) {
      setAppointments([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(*),
        service:services(*)
      `)
      .eq('admin_id', adminId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setAppointments(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const addAppointment = async (appointment: {
    client_id: string;
    service_id: string;
    date: string;
    start_time: string;
    notes?: string;
  }) => {
    const supabase = createClient();
    const adminId = await getCurrentAdmin();
    if (!adminId) return { error: 'No admin' };

    const { data: serviceData } = await supabase
      .from('services')
      .select('duration_minutes')
      .eq('id', appointment.service_id)
      .single();

    const endTime = serviceData
      ? calculateEndTime(appointment.start_time, serviceData.duration_minutes)
      : appointment.start_time;

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        admin_id: adminId,
        client_id: appointment.client_id,
        service_id: appointment.service_id,
        date: appointment.date,
        start_time: appointment.start_time,
        end_time: endTime,
        status: 'pending',
        notes: appointment.notes || null,
      })
      .select(`
        *,
        client:clients(*),
        service:services(*)
      `)
      .single();

    if (!error && data) {
      setAppointments((prev) => [...prev, data].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.start_time.localeCompare(b.start_time);
      }));
    }
    return { data, error };
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        client:clients(*),
        service:services(*)
      `)
      .single();

    if (!error && data) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? data : a)).sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.start_time.localeCompare(b.start_time);
        })
      );
    }
    return { data, error };
  };

  const updateStatus = async (id: string, status: AppointmentStatus) => {
    return updateAppointment(id, { status });
  };

  const deleteAppointment = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('appointments').delete().eq('id', id);

    if (!error) {
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    }
    return { error };
  };

  const getAppointmentsByDate = (date: string) => {
    return appointments.filter((a) => a.date === date);
  };

  const getTodayAppointments = () => {
    const today = new Date().toISOString().split('T')[0];
    return getAppointmentsByDate(today);
  };

  const getUpcomingAppointments = (limit = 5) => {
    const today = new Date().toISOString().split('T')[0];
    return appointments
      .filter((a) => a.date >= today && a.status !== 'cancelled')
      .slice(0, limit);
  };

  return {
    appointments,
    isLoading,
    error,
    addAppointment,
    updateAppointment,
    updateStatus,
    deleteAppointment,
    getAppointmentsByDate,
    getTodayAppointments,
    getUpcomingAppointments,
    refresh: fetchAppointments,
  };
}
