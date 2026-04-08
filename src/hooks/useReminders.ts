'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Reminder, ReminderType } from '@/types';
import { getCurrentAdmin } from '@/lib/utils';

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const adminId = await getCurrentAdmin();
    if (!adminId) {
      setReminders([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('admin_id', adminId)
      .order('due_date', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setReminders(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const addReminder = async (reminder: Partial<Reminder> & { title: string; due_date: string; type: ReminderType }) => {
    const supabase = createClient();
    const adminId = await getCurrentAdmin();
    if (!adminId) return { error: 'No admin' };

    const { data, error } = await supabase
      .from('reminders')
      .insert({ ...reminder, admin_id: adminId })
      .select()
      .single();

    if (!error && data) {
      setReminders((prev) => [...prev, data].sort((a, b) => 
        a.due_date.localeCompare(b.due_date)
      ));
    }
    return { data, error };
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? data : r)).sort((a, b) => 
          a.due_date.localeCompare(b.due_date)
        )
      );
    }
    return { data, error };
  };

  const toggleComplete = async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return { error: 'Reminder not found' };
    return updateReminder(id, { is_completed: !reminder.is_completed });
  };

  const deleteReminder = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('reminders').delete().eq('id', id);

    if (!error) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
    }
    return { error };
  };

  const getPendingReminders = () => {
    return reminders.filter((r) => !r.is_completed);
  };

  const getCompletedReminders = () => {
    return reminders.filter((r) => r.is_completed);
  };

  const getOverdueReminders = () => {
    const today = new Date().toISOString().split('T')[0];
    return reminders.filter((r) => !r.is_completed && r.due_date < today);
  };

  const getTodayReminders = () => {
    const today = new Date().toISOString().split('T')[0];
    return reminders.filter((r) => r.due_date === today);
  };

  const getPendingCount = () => {
    return getPendingReminders().length;
  };

  return {
    reminders,
    isLoading,
    error,
    addReminder,
    updateReminder,
    toggleComplete,
    deleteReminder,
    getPendingReminders,
    getCompletedReminders,
    getOverdueReminders,
    getTodayReminders,
    getPendingCount,
    refresh: fetchReminders,
  };
}
