import { Bell, Check, X, AlertTriangle, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAgentRequests } from '@/hooks/useAgentRequests';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function NotificationBell() {
  const { requests, pendingCount, respondToRequest } = useAgentRequests();
  const pendingRequests = requests.filter(r => r.status === 'pending');

  const handleApprove = async (requestId: string, requestType: string) => {
    const success = await respondToRequest(requestId, 'approved');
    if (success) {
      toast.success(`${requestType === 'close' ? 'Close' : 'Uninstall'} request approved`);
    } else {
      toast.error('Failed to approve request');
    }
  };

  const handleDeny = async (requestId: string) => {
    const success = await respondToRequest(requestId, 'denied');
    if (success) {
      toast.success('Request denied');
    } else {
      toast.error('Failed to deny request');
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">Agent Requests</h4>
          <p className="text-xs text-muted-foreground">
            {pendingCount === 0 ? 'No pending requests' : `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {pendingRequests.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              All caught up! No pending requests.
            </div>
          ) : (
            pendingRequests.map((request) => (
              <div key={request.id} className="p-3 border-b last:border-b-0 hover:bg-muted/50">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${request.request_type === 'uninstall' ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                    {request.request_type === 'uninstall' ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Power className="h-4 w-4 text-warning" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {request.employee?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Wants to <span className="font-medium">{request.request_type}</span> agent
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 ml-11">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => handleApprove(request.id, request.request_type)}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleDeny(request.id)}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Deny
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
