import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLog } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { isProductiveApp } from '@/lib/productiveApps';

interface UseActivityLogsOptions {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface DailyBreakdownEntry {
  date: string;
  working_seconds: number;
  idle_seconds: number;
}

interface ActivityStats {
  working_seconds: number;
  idle_seconds: number;
  app_usage: Record<string, number>;
  daily_breakdown: DailyBreakdownEntry[];
}

export function useActivityLogs(options: UseActivityLogsOptions = {}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ActivityStats>({ working_seconds: 0, idle_seconds: 0, app_usage: {}, daily_breakdown: [] });
  const { toast } = useToast();

  const fetchStats = async () => {
    const { data, error } = await supabase.rpc('get_activity_stats', {
      p_employee_id: options.employeeId || null,
      p_start_date: options.startDate?.toISOString() || null,
      p_end_date: options.endDate?.toISOString() || null,
    });

    if (!error && data) {
      setStats(data as unknown as ActivityStats);
    }
  };

  const fetchLogs = async () => {
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (options.employeeId) {
      query = query.eq('employee_id', options.employeeId);
    }

    if (options.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }

    if (options.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Error fetching activity logs',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      setLogs(data as ActivityLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();

    // Real-time subscription
    const channel = supabase
      .channel('activity-logs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        (payload) => {
          const newLog = payload.new as ActivityLog;
          if (!options.employeeId || newLog.employee_id === options.employeeId) {
            setLogs(prev => [newLog, ...prev]);
            fetchStats(); // Re-fetch accurate stats
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [options.employeeId, options.startDate?.getTime(), options.endDate?.getTime()]);

  return {
    logs,
    loading,
    appUsage: stats.app_usage,
    dailyBreakdown: stats.daily_breakdown,
    totalWorkingTime: stats.working_seconds,
    totalIdleTime: stats.idle_seconds,
    refetch: () => { fetchLogs(); fetchStats(); }
  };
}
