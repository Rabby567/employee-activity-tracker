import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Screenshot } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface UseScreenshotsOptions {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
}

export function useScreenshots(options: UseScreenshotsOptions = {}) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchScreenshots = async () => {
    let query = supabase
      .from('screenshots')
      .select('*')
      .order('created_at', { ascending: false });

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
        title: 'Error fetching screenshots',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      setScreenshots(data as Screenshot[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchScreenshots();

    // Real-time subscription for new screenshots
    const channel = supabase
      .channel('screenshots-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'screenshots' },
        (payload) => {
          const newScreenshot = payload.new as Screenshot;
          if (!options.employeeId || newScreenshot.employee_id === options.employeeId) {
            setScreenshots(prev => [newScreenshot, ...prev]);
            toast({ title: 'New screenshot received' });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [options.employeeId, options.startDate?.getTime(), options.endDate?.getTime()]);

  const getSignedUrl = async (imagePath: string) => {
    const { data, error } = await supabase.storage
      .from('screenshots')
      .createSignedUrl(imagePath, 3600);

    if (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
    return data.signedUrl;
  };

  return {
    screenshots,
    loading,
    getSignedUrl,
    refetch: fetchScreenshots
  };
}
