-- Create agent_requests table for close/uninstall permission requests
CREATE TABLE public.agent_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('close', 'uninstall')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.agent_requests ENABLE ROW LEVEL SECURITY;

-- Admins can view all requests
CREATE POLICY "Admins can view all agent requests"
ON public.agent_requests
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
));

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update agent requests"
ON public.agent_requests
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
));

-- Admins can insert requests (for edge function with service role)
CREATE POLICY "Admins can insert agent requests"
ON public.agent_requests
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
));

-- Enable realtime for agent_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_requests;

-- Create index for faster queries
CREATE INDEX idx_agent_requests_employee_id ON public.agent_requests(employee_id);
CREATE INDEX idx_agent_requests_status ON public.agent_requests(status);