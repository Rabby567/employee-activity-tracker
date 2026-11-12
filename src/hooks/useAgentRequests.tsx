import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AgentRequest {
  id: string;
  employee_id: string;
  request_type: 'close' | 'uninstall';
  status: 'pending' | 'approved' | 'denied';
  reason: string | null;
  created_at: string;
  responded_at: string | null;
  employee?: {
    name: string;
    employee_code: string;
  };
}

export function useAgentRequests() {
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_requests')
        .select(`
          *,
          employee:employees(name, employee_code)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const typedData = (data || []).map(item => ({
        ...item,
        request_type: item.request_type as 'close' | 'uninstall',
        status: item.status as 'pending' | 'approved' | 'denied',
        employee: item.employee as { name: string; employee_code: string } | undefined
      }));

      setRequests(typedData);
      setPendingCount(typedData.filter(r => r.status === 'pending').length);
    } catch (error) {
      console.error('Error fetching agent requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const respondToRequest = async (requestId: string, status: 'approved' | 'denied', reason?: string) => {
    try {
      const { error } = await supabase
        .from('agent_requests')
        .update({
          status,
          reason: reason || null,
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      
      await fetchRequests();
      return true;
    } catch (error) {
      console.error('Error responding to request:', error);
      return false;
    }
  };

  useEffect(() => {
    fetchRequests();

    // Set up realtime subscription
    const channel = supabase
      .channel('agent_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_requests'
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    requests,
    pendingCount,
    loading,
    respondToRequest,
    refetch: fetchRequests
  };
}
