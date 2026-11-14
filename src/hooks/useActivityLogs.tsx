import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLog } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface UseActivityLogsOptions {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface DailyBreakdownEntry {
  date: string;
  working_seconds: number;
  idle_seconds: number;
  unproductive_seconds: number;
}

interface EmployeeBreakdownEntry {
  employee_id: string;
  working_seconds: number;
  unproductive_seconds: number;
  idle_seconds: number;
}

interface ActivityStats {
  working_seconds: number;
  idle_seconds: number;
  unproductive_seconds: number;
  total_seconds: number;
  app_usage: Record<string, number>;
  website_usage: Record<string, number>;
  employee_breakdown: EmployeeBreakdownEntry[];
  daily_breakdown: DailyBreakdownEntry[];
}

const EMPTY_STATS: ActivityStats = {
  working_seconds: 0,
  idle_seconds: 0,
  unproductive_seconds: 0,
  total_seconds: 0,
  app_usage: {},
  website_usage: {},
  employee_breakdown: [],
  daily_breakdown: [],
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toUsageRecord = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => Boolean(key))
      .map(([key, seconds]) => [key, toNumber(seconds)])
  );
};

const normalizeStats = (value: unknown): ActivityStats => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The get_activity_stats RPC returned an invalid response.');
  }

  const raw = value as Record<string, unknown>;

  const daily = Array.isArray(raw.daily_breakdown) ? raw.daily_breakdown : [];
  const employees = Array.isArray(raw.employee_breakdown) ? raw.employee_breakdown : [];

  return {
    working_seconds: toNumber(raw.working_seconds),
    idle_seconds: toNumber(raw.idle_seconds),
    unproductive_seconds: toNumber(raw.unproductive_seconds),
    total_seconds: toNumber(raw.total_seconds),
    app_usage: toUsageRecord(raw.app_usage),
    website_usage: toUsageRecord(raw.website_usage),
    daily_breakdown: daily
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(item => ({
        date: String(item.date ?? '').slice(0, 10),
        working_seconds: toNumber(item.working_seconds),
        idle_seconds: toNumber(item.idle_seconds),
        unproductive_seconds: toNumber(item.unproductive_seconds),
      }))
      .filter(item => Boolean(item.date)),
    employee_breakdown: employees
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(item => ({
        employee_id: String(item.employee_id ?? ''),
        working_seconds: toNumber(item.working_seconds),
        unproductive_seconds: toNumber(item.unproductive_seconds),
        idle_seconds: toNumber(item.idle_seconds),
      }))
      .filter(item => Boolean(item.employee_id)),
  };
};

export function useActivityLogs(options: UseActivityLogsOptions = {}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ActivityStats>(EMPTY_STATS);
  const { toast } = useToast();

  const employeeId = options.employeeId;
  const startDateMs = options.startDate?.getTime();
  const endDateMs = options.endDate?.getTime();
  const startDateIso = options.startDate?.toISOString() ?? null;
  const endDateIso = options.endDate?.toISOString() ?? null;

  const fetchStats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_activity_stats', {
      p_employee_id: employeeId || null,
      p_start_date: startDateIso,
      p_end_date: endDateIso,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });

    if (error) {
      console.error('[ActivityTrack] get_activity_stats RPC failed:', error);
      toast({
        title: 'Analytics statistics could not be loaded',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    try {
      setStats(normalizeStats(data));
    } catch (normalizationError) {
      console.error('[ActivityTrack] Invalid analytics response:', normalizationError);
      toast({
        title: 'Invalid analytics response',
        description: normalizationError instanceof Error
          ? normalizationError.message
          : 'The server returned unexpected statistics data.',
        variant: 'destructive',
      });
    }
  }, [employeeId, startDateIso, endDateIso, toast]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (employeeId) query = query.eq('employee_id', employeeId);
      if (startDateIso) query = query.gte('created_at', startDateIso);
      if (endDateIso) query = query.lte('created_at', endDateIso);

      const { data, error } = await query;

      if (error) {
        console.error('[ActivityTrack] Activity log query failed:', error);
        toast({
          title: 'Error fetching activity logs',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      setLogs((data ?? []) as ActivityLog[]);
    } catch (error) {
      console.error('[ActivityTrack] Unexpected activity log error:', error);
      toast({
        title: 'Error fetching activity logs',
        description: error instanceof Error ? error.message : 'Unexpected database error.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [employeeId, startDateIso, endDateIso, toast]);

  const refetch = useCallback(() => {
    void Promise.all([fetchLogs(), fetchStats()]);
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      await Promise.all([fetchLogs(), fetchStats()]);
    };

    void load();

    const channel = supabase
      .channel(`activity-logs-changes-${employeeId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        (payload) => {
          if (!active) return;

          const newLog = payload.new as ActivityLog;
          if (employeeId && newLog.employee_id !== employeeId) return;

          const createdAt = new Date(newLog.created_at).getTime();
          if (startDateMs !== undefined && createdAt < startDateMs) return;
          if (endDateMs !== undefined && createdAt > endDateMs) return;

          setLogs(previous => {
            if (previous.some(log => log.id === newLog.id)) return previous;
            return [newLog, ...previous].slice(0, 5000);
          });

          void fetchStats();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[ActivityTrack] Realtime subscription status:', status);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [fetchLogs, fetchStats, employeeId, startDateMs, endDateMs]);

  return {
    logs,
    loading,
    appUsage: stats.app_usage,
    websiteUsage: stats.website_usage,
    employeeBreakdown: stats.employee_breakdown,
    dailyBreakdown: stats.daily_breakdown,
    totalWorkingTime: stats.working_seconds,
    totalIdleTime: stats.idle_seconds,
    totalUnproductiveTime: stats.unproductive_seconds,
    totalTrackedTime: stats.total_seconds,
    refetch,
  };
}
