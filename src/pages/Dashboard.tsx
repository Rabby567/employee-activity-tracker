import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { LiveIndicator } from '@/components/dashboard/LiveIndicator';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import { useEmployees } from '@/hooks/useEmployees';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, Clock, UserX } from 'lucide-react';

export default function Dashboard() {
  const { employees, loading, stats } = useEmployees();
  const [connected, setConnected] = useState(true);

  // Track realtime connection status
  useEffect(() => {
    const handleOnline = () => setConnected(true);
    const handleOffline = () => setConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Monitor employee activity in real-time</p>
          </div>
          <LiveIndicator connected={connected} />
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Employees"
            value={stats.total}
            icon={<Users className="h-6 w-6" />}
          />
          <StatsCard
            title="Online"
            value={stats.online}
            icon={<UserCheck className="h-6 w-6" />}
            variant="success"
          />
          <StatsCard
            title="Idle"
            value={stats.idle}
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <StatsCard
            title="Offline"
            value={stats.offline}
            icon={<UserX className="h-6 w-6" />}
            variant="danger"
          />
        </div>

        {/* Employee Table */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <EmployeeTable employees={employees} loading={loading} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
