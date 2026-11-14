import { useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Save, Sun, Moon, Plus, X, RotateCcw, Globe, AppWindow, Timer, ShieldAlert } from 'lucide-react';

type Rules = { activity_interval_seconds: number; idle_threshold_seconds: number; productive_websites: string[]; productive_apps: string[] };
const DEFAULT_RULES: Rules = { activity_interval_seconds: 30, idle_threshold_seconds: 300, productive_websites: [], productive_apps: [] };

type RuleKind = 'productive_websites' | 'productive_apps';

type RuleListProps = {
  title: string;
  description: string;
  kind: RuleKind;
  input: string;
  setInput: (value: string) => void;
  placeholder: string;
  icon: typeof Globe;
  values: string[];
  onAdd: (kind: RuleKind) => void;
  onRemove: (kind: RuleKind, value: string) => void;
  inputRef: { current: HTMLInputElement | null };
};

// Keep this component outside Settings. Defining it inside Settings caused
// React to unmount/remount the input on every keystroke, which lost focus.
function RuleList({
  title, description, kind, input, setInput, placeholder, icon: Icon,
  values, onAdd, onRemove, inputRef,
}: RuleListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd(kind);
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => onAdd(kind)}>
          <Plus className="h-4 w-4 mr-1" />Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 min-h-8">
        {values.map(value => (
          <Badge key={value} variant="secondary" className="gap-1 py-1.5">
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onRemove(kind, value)}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No productive entries yet. Everything not listed will be unproductive.
          </span>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [loaded, setLoaded] = useState(false);
  const [websiteInput, setWebsiteInput] = useState('');
  const [appInput, setAppInput] = useState('');
  const websiteInputRef = useRef<HTMLInputElement>(null);
  const appInputRef = useRef<HTMLInputElement>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await (supabase as any).from('activitytrack_settings').select('*').eq('id', 1).maybeSingle();
      if (!active) return;
      if (error) toast({ title: 'Could not load productivity settings', description: error.message, variant: 'destructive' });
      else if (data) setRules({
        activity_interval_seconds: data.activity_interval_seconds ?? 30,
        idle_threshold_seconds: data.idle_threshold_seconds ?? 300,
        productive_websites: data.productive_websites ?? [],
        productive_apps: data.productive_apps ?? [],
      });
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [toast]);

  const addValue = (kind: 'productive_websites' | 'productive_apps') => {
    const raw = kind === 'productive_websites' ? websiteInput : appInput;
    const value = raw.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
    if (!value) return;
    const current = rules[kind];
    if (current.some(v => v.toLowerCase() === value.toLowerCase())) return;
    setRules(prev => ({ ...prev, [kind]: [...prev[kind], value] }));
    if (kind === 'productive_websites') setWebsiteInput(''); else setAppInput('');
  };

  const saveRules = async () => {
    setLoading(true);
    const payload = { id: 1, ...rules, updated_at: new Date().toISOString() };
    const { error } = await (supabase as any).from('activitytrack_settings').upsert(payload, { onConflict: 'id' });
    if (error) toast({ title: 'Settings could not be saved', description: error.message, variant: 'destructive' });
    else toast({ title: 'Activity settings saved', description: 'Connected employee agents will receive the new settings automatically.' });
    setLoading(false);
  };

  const resetTestData = async () => {
    if (confirmText !== 'RESET') return;
    setResetting(true);
    const { data, error } = await supabase.functions.invoke('reset-activity-data', { body: { confirmation: 'RESET' } });
    if (error || !data?.success) {
      toast({ title: 'Reset failed', description: error?.message || data?.error || 'Could not reset activity data.', variant: 'destructive' });
    } else {
      toast({ title: 'Activity data reset', description: 'Activity logs, screenshots and live employee states were cleared. Accounts and rules were preserved.' });
    }
    setConfirmText('');
    setResetting(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    if (newPassword.length < 6) { toast({ title: 'Password too short', description: 'Password must be at least 6 characters', variant: 'destructive' }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast({ title: 'Error updating password', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Password updated successfully' }); setNewPassword(''); setConfirmPassword(''); }
    setLoading(false);
  };

  const removeValue = (kind: RuleKind, value: string) => {
    setRules(prev => ({ ...prev, [kind]: prev[kind].filter(v => v !== value) }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div><h1 className="text-3xl font-bold">Settings</h1><p className="text-muted-foreground">Manage tracking, productivity rules and account preferences</p></div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5"/>Activity Tracking</CardTitle><CardDescription>Control how often employee agents send activity heartbeats.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2"><Label htmlFor="activity-interval">Recent Activity Reporting Interval</Label><select id="activity-interval" className="h-10 rounded-md border bg-background px-3 text-sm" value={rules.activity_interval_seconds} onChange={e => setRules(p => ({ ...p, activity_interval_seconds: Number(e.target.value) }))}>{[5,10,15,30,60].map(n => <option key={n} value={n}>{n} seconds</option>)}</select><p className="text-xs text-muted-foreground">How often the agent sends the active application and activity state. Lower intervals create more records.</p></div>
            <div className="grid gap-2"><Label htmlFor="idle-threshold">Idle Threshold</Label><select id="idle-threshold" className="h-10 rounded-md border bg-background px-3 text-sm" value={rules.idle_threshold_seconds} onChange={e => setRules(p => ({ ...p, idle_threshold_seconds: Number(e.target.value) }))}>{[60,120,180,300,600,900].map(n => <option key={n} value={n}>{n >= 60 ? `${n / 60} minute${n > 60 ? 's' : ''}` : `${n} seconds`}</option>)}</select><p className="text-xs text-muted-foreground">No keyboard or mouse input for this duration means genuine Idle. Non-allowlisted apps remain Unproductive, not Idle.</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Productivity Rules</CardTitle><CardDescription>Only entries in these two allowlists count as Productive. Everything else is Unproductive unless the computer is genuinely idle or locked.</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <RuleList
              title="Productive Websites"
              description="Add domains, e.g. adobe.com. Subdomains are included automatically."
              kind="productive_websites"
              input={websiteInput}
              setInput={setWebsiteInput}
              placeholder="example.com"
              icon={Globe}
              values={rules.productive_websites}
              onAdd={addValue}
              onRemove={removeValue}
              inputRef={websiteInputRef}
            />
            <div className="border-t"/>
            <RuleList
              title="Productive Applications"
              description="Add Windows process names, with or without .exe."
              kind="productive_apps"
              input={appInput}
              setInput={setAppInput}
              placeholder="Photoshop.exe or explorer.exe"
              icon={AppWindow}
              values={rules.productive_apps}
              onAdd={addValue}
              onRemove={removeValue}
              inputRef={appInputRef}
            />
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Classification priority: genuine Idle → Idle; matching website domain or application process → Productive; all other foreground activity → Unproductive.</div>
            <Button onClick={saveRules} disabled={loading || !loaded}>{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2"/>}Save Activity Settings</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>System Reset</CardTitle><CardDescription>Clear test activity before handing ActivityTrack over to a client. Employee accounts, API keys, admin accounts, company settings and productivity rules are preserved.</CardDescription></CardHeader>
          <CardContent className="flex items-center justify-between gap-4"><div><p className="font-medium">Reset Activity Data</p><p className="text-sm text-muted-foreground">Deletes activity logs and screenshot records/files, and sets employees offline.</p></div>
            <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive"><RotateCcw className="h-4 w-4 mr-2"/>Reset Data</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive"/>Reset all test data?</AlertDialogTitle><AlertDialogDescription>This permanently deletes activity history and stored screenshots for every employee. Employee accounts, API keys, admin users and productivity settings will remain.</AlertDialogDescription></AlertDialogHeader><div className="space-y-2"><Label htmlFor="reset-confirm">Type RESET to confirm</Label><Input id="reset-confirm" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESET"/></div><AlertDialogFooter><AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel><AlertDialogAction disabled={confirmText !== 'RESET' || resetting} onClick={() => void resetTestData()}>{resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : null}Confirm Reset</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle>Account</CardTitle><CardDescription>Your account information</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-2"><Label>Email</Label><Input value={user?.email || ''} disabled/></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Customize how the dashboard looks</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between"><div className="flex items-center gap-3">{theme === 'dark' ? <Moon className="h-5 w-5"/> : <Sun className="h-5 w-5"/>}<div><p className="font-medium">Dark Mode</p><p className="text-sm text-muted-foreground">Toggle dark theme</p></div></div><Switch checked={theme === 'dark'} onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}/></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Change Password</CardTitle><CardDescription>Update your account password</CardDescription></CardHeader><CardContent><form onSubmit={handlePasswordChange} className="space-y-4"><div className="grid gap-2"><Label htmlFor="new-password">New Password</Label><Input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}/></div><div className="grid gap-2"><Label htmlFor="confirm-password">Confirm New Password</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required/></div><Button type="submit" disabled={loading}><Save className="h-4 w-4 mr-2"/>Update Password</Button></form></CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
