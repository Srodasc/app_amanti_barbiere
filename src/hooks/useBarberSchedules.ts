'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BarberSchedule, DayOfWeek, TimeSlot } from '@/types';
import { calculateEndTime } from '@/lib/utils';

export function useBarberSchedules(barberId?: string) {
  const [schedules, setSchedules] = useState<BarberSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    let query = supabase
      .from('barber_schedules')
      .select('*')
      .order('day_of_week');

    if (barberId) {
      query = query.eq('barber_id', barberId);
    }

    const { data, error } = await query;

    if (error) {
      setError(error.message);
    } else {
      setSchedules(data || []);
    }
    setIsLoading(false);
  }, [barberId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const addSchedule = async (schedule: Omit<BarberSchedule, 'id' | 'created_at' | 'barber_id'> & { barber_id: string }) => {
    if (!barberId) {
      return { data: null, error: { message: 'Barber ID is required' } };
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('barber_schedules')
      .insert({ ...schedule, barber_id: barberId })
      .select()
      .single();

    if (!error && data) {
      setSchedules((prev) => [...prev, data].sort((a, b) => a.day_of_week - b.day_of_week));
    }
    return { data, error };
  };

  const updateSchedule = async (id: string, updates: Partial<BarberSchedule>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('barber_schedules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? data : s)).sort((a, b) => a.day_of_week - b.day_of_week)
      );
    }
    return { data, error };
  };

  const deleteSchedule = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('barber_schedules')
      .delete()
      .eq('id', id);

    if (!error) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
    return { error };
  };

  const getSchedulesByDay = (day: DayOfWeek) => {
    return schedules.filter((s) => s.day_of_week === day);
  };

  const isWorkingDay = (day: DayOfWeek) => {
    return schedules.some((s) => s.day_of_week === day && s.is_available);
  };

  return {
    schedules,
    isLoading,
    error,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    getSchedulesByDay,
    isWorkingDay,
    refresh: fetchSchedules,
  };
}

export function useAvailableSlots(barberId: string, date: string, serviceDuration: number = 30) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAvailableSlots = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);

    const dayOfWeek = new Date(date).getDay() as DayOfWeek;

    const { data: schedules, error: scheduleError } = await supabase
      .from('barber_schedules')
      .select('*')
      .eq('barber_id', barberId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .single();

    if (scheduleError || !schedules) {
      setSlots([]);
      setIsLoading(false);
      return;
    }

    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('barber_id', barberId)
      .eq('date', date)
      .neq('status', 'cancelled');

    if (appointmentError) {
      setSlots([]);
      setIsLoading(false);
      return;
    }

    const bookedSlots = appointments || [];

    const generateSlots = (start: string, end: string, duration: number): string[] => {
      const slots: string[] = [];
      let current = start;
      while (current < end) {
        slots.push(current);
        current = calculateEndTime(current, duration);
      }
      return slots;
    };

    const availableSlots = generateSlots(
      schedules.start_time,
      schedules.end_time,
      serviceDuration
    );

    const slotsWithAvailability = availableSlots.map((time) => {
      const isBooked = bookedSlots.some((appointment) => {
        return time >= appointment.start_time && time < appointment.end_time;
      });
      return { time, available: !isBooked };
    });

    setSlots(slotsWithAvailability);
    setIsLoading(false);
  }, [barberId, date, serviceDuration]);

  useEffect(() => {
    if (barberId && date) {
      fetchAvailableSlots();
    }
  }, [barberId, date, fetchAvailableSlots]);

  return { slots, isLoading, refresh: fetchAvailableSlots };
}
