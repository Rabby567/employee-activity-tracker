import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Employee } from '@/types/database';
import { StatusBadge } from './StatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Monitor, ChevronRight } from 'lucide-react';

interface EmployeeTableProps {
  employees: Employee[];
  loading?: boolean;
}

export function EmployeeTable({ employees, loading }: EmployeeTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No employees yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Add your first employee to start tracking activity
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Current App</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Last Seen</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map(employee => (
          <TableRow key={employee.id} className="group">
            <TableCell>
              <div>
                <div className="font-medium">{employee.name}</div>
                <div className="text-sm text-muted-foreground">{employee.employee_code}</div>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={employee.status} />
            </TableCell>
            <TableCell>
              {employee.current_app ? (
                <span className="text-sm">{employee.current_app}</span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {employee.device_name || <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              {employee.last_seen ? (
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(employee.last_seen), { addSuffix: true })}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Never</span>
              )}
            </TableCell>
            <TableCell>
              <Link 
                to={`/employees/${employee.id}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
