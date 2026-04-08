'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Expense, ExpenseCategory } from '@/types';
import { getCurrentAdmin } from '@/lib/utils';

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    const adminId = await getCurrentAdmin();
    if (!adminId) {
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('admin_id', adminId)
      .order('expense_date', { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setExpenses(data || []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const addExpense = async (expense: Partial<Expense> & { concept: string; amount: number; category: ExpenseCategory; expense_date: string }) => {
    const supabase = createClient();
    const adminId = await getCurrentAdmin();
    if (!adminId) return { error: 'No admin' };

    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, admin_id: adminId })
      .select()
      .single();

    if (!error && data) {
      setExpenses((prev) => [data, ...prev].sort((a, b) => 
        b.expense_date.localeCompare(a.expense_date)
      ));
    }
    return { data, error };
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      setExpenses((prev) =>
        prev.map((e) => (e.id === id ? data : e)).sort((a, b) => 
          b.expense_date.localeCompare(a.expense_date)
        )
      );
    }
    return { data, error };
  };

  const deleteExpense = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('expenses').delete().eq('id', id);

    if (!error) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
    return { error };
  };

  const getExpensesByCategory = (category: ExpenseCategory) => {
    return expenses.filter((e) => e.category === category);
  };

  const getExpensesByDateRange = (startDate: string, endDate: string) => {
    return expenses.filter((e) => 
      e.expense_date >= startDate && e.expense_date <= endDate
    );
  };

  const getTotalExpenses = () => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  };

  const getTotalExpensesByCategory = () => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return totals;
  };

  const getExpensesThisMonth = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    return getExpensesByDateRange(startOfMonth, endOfMonth);
  };

  return {
    expenses,
    isLoading,
    error,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpensesByCategory,
    getExpensesByDateRange,
    getTotalExpenses,
    getTotalExpensesByCategory,
    getExpensesThisMonth,
    refresh: fetchExpenses,
  };
}
