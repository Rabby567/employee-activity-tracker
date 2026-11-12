import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useEmployees } from '@/hooks/useEmployees';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { CalendarIcon, Download, Clock, TrendingUp, BarChart3, PieChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isProductiveApp } from '@/lib/productiveApps';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

 // Vibrant colors for application usage chart
 const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
 // Colors for daily activity breakdown
 const DAY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

type DateRange = 'today' | 'week' | 'month' | 'custom';

// Normalize app names to show only the application name
const normalizeAppName = (appName: string): string => {
  if (!appName) return 'Unknown';
  
   // File extension to application mapping (check first for filenames like "Untitled-1.indd")
   const extensionMap: Record<string, string> = {
     '.indd': 'Adobe InDesign',
     '.ai': 'Adobe Illustrator',
     '.psd': 'Adobe Photoshop',
     '.psb': 'Adobe Photoshop',
     '.aep': 'Adobe After Effects',
     '.aet': 'Adobe After Effects',
     '.prproj': 'Adobe Premiere Pro',
     '.xd': 'Adobe XD',
     '.fig': 'Figma',
     '.sketch': 'Sketch',
     '.docx': 'Microsoft Word',
     '.doc': 'Microsoft Word',
     '.xlsx': 'Microsoft Excel',
     '.xls': 'Microsoft Excel',
     '.pptx': 'PowerPoint',
     '.ppt': 'PowerPoint',
     '.pdf': 'PDF Viewer',
     '.blend': 'Blender',
     '.c4d': 'Cinema 4D',
     '.max': '3ds Max',
     '.ma': 'Maya',
     '.mb': 'Maya',
   };
   
   // Check for file extensions first
   const lowerName = appName.toLowerCase();
   for (const [ext, app] of Object.entries(extensionMap)) {
     if (lowerName.includes(ext)) {
       return app;
     }
   }
   
  // Common browser patterns - extract browser name
  const browserPatterns = [
    { pattern: /Google Chrome/i, name: 'Google Chrome' },
    { pattern: /Mozilla Firefox/i, name: 'Mozilla Firefox' },
    { pattern: /Microsoft Edge/i, name: 'Microsoft Edge' },
    { pattern: /Safari/i, name: 'Safari' },
    { pattern: /Opera/i, name: 'Opera' },
    { pattern: /Brave/i, name: 'Brave' },
  ];
  
  for (const { pattern, name } of browserPatterns) {
    if (pattern.test(appName)) return name;
  }
  
  // Common application patterns
  const appPatterns = [
    { pattern: /Adobe Photoshop/i, name: 'Adobe Photoshop' },
    { pattern: /Adobe Illustrator/i, name: 'Adobe Illustrator' },
    { pattern: /Adobe Premiere/i, name: 'Adobe Premiere' },
    { pattern: /Adobe After Effects/i, name: 'Adobe After Effects' },
    { pattern: /Adobe XD/i, name: 'Adobe XD' },
    { pattern: /Adobe InDesign/i, name: 'Adobe InDesign' },
    { pattern: /Figma/i, name: 'Figma' },
    { pattern: /Sketch/i, name: 'Sketch' },
    { pattern: /Discord/i, name: 'Discord' },
    { pattern: /Slack/i, name: 'Slack' },
    { pattern: /Microsoft Teams/i, name: 'Microsoft Teams' },
    { pattern: /Zoom/i, name: 'Zoom' },
    { pattern: /Visual Studio Code/i, name: 'VS Code' },
    { pattern: /Code\.exe/i, name: 'VS Code' },
    { pattern: /Sublime Text/i, name: 'Sublime Text' },
    { pattern: /Notepad\+\+/i, name: 'Notepad++' },
    { pattern: /Microsoft Word/i, name: 'Microsoft Word' },
    { pattern: /Microsoft Excel/i, name: 'Microsoft Excel' },
    { pattern: /Microsoft PowerPoint/i, name: 'PowerPoint' },
    { pattern: /Microsoft Outlook/i, name: 'Outlook' },
    { pattern: /Spotify/i, name: 'Spotify' },
    { pattern: /VLC/i, name: 'VLC Media Player' },
    { pattern: /File Explorer/i, name: 'File Explorer' },
    { pattern: /explorer\.exe/i, name: 'File Explorer' },
    { pattern: /Terminal/i, name: 'Terminal' },
    { pattern: /cmd\.exe/i, name: 'Command Prompt' },
    { pattern: /PowerShell/i, name: 'PowerShell' },
    { pattern: /Notion/i, name: 'Notion' },
    { pattern: /Trello/i, name: 'Trello' },
    { pattern: /Postman/i, name: 'Postman' },
    { pattern: /GitHub Desktop/i, name: 'GitHub Desktop' },
    { pattern: /Steam/i, name: 'Steam' },
  ];
  
  for (const { pattern, name } of appPatterns) {
    if (pattern.test(appName)) return name;
  }
  
  // Remove common suffixes like " - filename.txt" or " - Website Title"
  let cleaned = appName.split(' - ')[0].split(' — ')[0].split(' | ')[0];
  
  // Remove file extensions
  cleaned = cleaned.replace(/\.(exe|app|dmg|msi)$/i, '');
  
  // Remove paths
  if (cleaned.includes('\\')) {
    cleaned = cleaned.split('\\').pop() || cleaned;
  }
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/').pop() || cleaned;
  }
  
  // Trim and return
  return cleaned.trim() || 'Unknown';
};

export default function Analytics() {
  const { employees } = useEmployees();
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { startDate: startOfDay(now), endDate: endOfDay(now) };
      case 'week':
        return { startDate: startOfWeek(now), endDate: endOfWeek(now) };
      case 'month':
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
      case 'custom':
        return { startDate: customStart, endDate: customEnd };
      default:
        return { startDate: subDays(now, 7), endDate: now };
    }
  }, [dateRange, customStart, customEnd]);

  const { logs, appUsage, dailyBreakdown, totalWorkingTime, totalIdleTime } = useActivityLogs({
    employeeId: selectedEmployee === 'all' ? undefined : selectedEmployee,
    startDate,
    endDate
  });

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatHours = (seconds: number) => {
    return (seconds / 3600).toFixed(1);
  };

  const exportEmployeeCSV = (employeeId: string, employeeName: string) => {
    const employeeLogs = logs.filter(log => log.employee_id === employeeId);
    
    const headers = ['App', 'Status', 'Duration (seconds)', 'Duration (formatted)', 'Timestamp'];
    const rows = employeeLogs.map(log => [
      log.app_name,
      log.status,
      log.duration_seconds,
      formatDuration(log.duration_seconds),
      log.created_at
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${employeeName.replace(/\s+/g, '-')}-activity-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prepare chart data
  // Group by normalized app names
  const normalizedAppUsage = logs.reduce((acc, log) => {
    const normalizedName = normalizeAppName(log.app_name);
    acc[normalizedName] = (acc[normalizedName] || 0) + log.duration_seconds;
    return acc;
  }, {} as Record<string, number>);

  const appUsageData = Object.entries(normalizedAppUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.slice(0, 15), value, hours: (value / 3600).toFixed(1) }));

  const productivityData = [
    { name: 'Working', value: totalWorkingTime, color: '#10B981' },
    { name: 'Idle', value: totalIdleTime, color: '#F59E0B' }
  ];

  const productivityScore = totalWorkingTime + totalIdleTime > 0
    ? Math.round((totalWorkingTime / (totalWorkingTime + totalIdleTime)) * 100)
    : 0;

  // Daily breakdown - uses server-side aggregated data (no row limit)
  const dailyData = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    const interval = eachDayOfInterval({ start: startDate, end: endDate > new Date() ? new Date() : endDate });
    const useShortLabel = dateRange === 'today' || interval.length <= 7;
    
    // Pre-populate all days with zero values in chronological order
    const dayMap = new Map<string, { name: string; working: number; idle: number }>();
    interval.forEach(date => {
      const key = format(date, 'yyyy-MM-dd');
      const label = useShortLabel ? format(date, 'EEE') : format(date, 'MMM dd');
      dayMap.set(key, { name: label, working: 0, idle: 0 });
    });
    
    // Fill in data from server-side daily breakdown (aggregates ALL rows, no limit)
    dailyBreakdown?.forEach(day => {
      const entry = dayMap.get(day.date);
      if (!entry) return;
      entry.working += (day.working_seconds || 0) / 3600;
      entry.idle += (day.idle_seconds || 0) / 3600;
    });
    
    return Array.from(dayMap.values()).map(d => ({
      name: d.name,
      working: Number(d.working.toFixed(1)),
      idle: Number(d.idle.toFixed(1)),
    }));
  }, [dailyBreakdown, startDate, endDate, dateRange]);

  // Employee productivity ranking
  const employeeRanking = useMemo(() => {
    const ranking: Record<string, { working: number; idle: number; name: string }> = {};
    
    logs.forEach(log => {
      const emp = employees.find(e => e.id === log.employee_id);
      if (!emp) return;
      
      if (!ranking[log.employee_id]) {
        ranking[log.employee_id] = { working: 0, idle: 0, name: emp.name };
      }
      
      if (isProductiveApp(log.app_name)) {
        ranking[log.employee_id].working += log.duration_seconds;
      } else {
        ranking[log.employee_id].idle += log.duration_seconds;
      }
    });

    return Object.entries(ranking)
      .map(([id, data]) => ({
        id,
        name: data.name,
        score: data.working + data.idle > 0
          ? Math.round((data.working / (data.working + data.idle)) * 100)
          : 0,
        hours: (data.working / 3600).toFixed(1)
      }))
      .sort((a, b) => b.score - a.score);
  }, [logs, employees]);

  const exportToCSV = () => {
    const headers = ['Employee', 'App', 'Status', 'Duration (seconds)', 'Timestamp'];
    const rows = logs.map(log => {
      const emp = employees.find(e => e.id === log.employee_id);
      return [emp?.name || 'Unknown', log.app_name, log.status, log.duration_seconds, log.created_at];
    });
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Productivity Analytics</h1>
            <p className="text-muted-foreground">Analyze team performance and activity patterns</p>
          </div>
          <Button onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>

          {dateRange === 'custom' && (
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(!customStart && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customStart ? format(customStart, 'PPP') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={customStart} onSelect={setCustomStart} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn(!customEnd && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customEnd ? format(customEnd, 'PPP') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Hours</p>
                  <p className="text-2xl font-bold">{formatHours(totalWorkingTime + totalIdleTime)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/10 p-3">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Productive Time</p>
                  <p className="text-2xl font-bold">{formatHours(totalWorkingTime)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-500/10 p-3">
                  <BarChart3 className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Idle Time</p>
                  <p className="text-2xl font-bold">{formatHours(totalIdleTime)}h</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-3">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Productivity Score</p>
                  <p className="text-2xl font-bold">{productivityScore}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data for selected period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailyData}>
                    <XAxis dataKey="name" />
                    <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="working" name="Working" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="idle" name="Idle" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Working vs Idle Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {totalWorkingTime === 0 && totalIdleTime === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data for selected period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={productivityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {productivityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatDuration(value)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Application Usage Time</CardTitle>
            </CardHeader>
            <CardContent>
              {appUsageData.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data for selected period</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={appUsageData}>
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      height={80}
                      interval={0}
                    />
                    <YAxis 
                      label={{ value: 'Hours', angle: -90, position: 'insideLeft' }}
                      tickFormatter={(v) => `${(v / 3600).toFixed(1)}h`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatDuration(value), 'Time Used']} 
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {appUsageData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="grid gap-4 lg:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Employee Productivity Ranking</CardTitle>
            </CardHeader>
            <CardContent>
              {employeeRanking.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No data for selected period</p>
              ) : (
                <div className="space-y-3">
                  {employeeRanking.slice(0, 10).map((emp, index) => (
                    <div key={emp.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                          index === 0 && 'bg-amber-500 text-white',
                          index === 1 && 'bg-gray-400 text-white',
                          index === 2 && 'bg-amber-700 text-white',
                          index > 2 && 'bg-muted text-muted-foreground'
                        )}>
                          {index + 1}
                        </span>
                        <span className="font-medium">{emp.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="font-bold text-primary">{emp.score}%</span>
                          <span className="text-sm text-muted-foreground ml-2">({emp.hours}h)</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => exportEmployeeCSV(emp.id, emp.name)}
                          title={`Download ${emp.name}'s activity report`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
