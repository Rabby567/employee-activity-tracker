

## Add Forgot Password / Reset Password Flow

### What Will Change

Users will be able to recover their account by clicking "Forgot password?" on the login page, entering their Gmail, and receiving a reset link. Clicking the link takes them to a page where they set a new password.

### User Flow

```text
Login page → Click "Forgot password?"
        ↓
Enter Gmail address → Click "Send Reset Link"
        ↓
Check Gmail inbox → Click reset link
        ↓
/reset-password page → Enter new password → Confirm
        ↓
Password updated → Sign in with new password
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/ResetPassword.tsx` | **New** — Page that handles the recovery token and lets users set a new password |
| `src/pages/Login.tsx` | Add "Forgot password?" link and inline forgot password form |
| `src/App.tsx` | Add `/reset-password` route |

### Implementation Details

**1. Login.tsx** — Add forgot password UI:
- Add a "Forgot password?" button below the Sign In button
- When clicked, show a form asking for Gmail address (with existing Gmail validation)
- On submit, call `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Show success screen: "Check your Gmail for a password reset link"
- "Back to Login" button to return to normal login

**2. ResetPassword.tsx** — New page:
- Listen for `PASSWORD_RECOVERY` auth event and check URL hash for `type=recovery`
- If not a valid recovery session, show "Invalid or expired link" with back-to-login button
- If valid, show "New Password" and "Confirm Password" fields
- Validate min 6 characters and matching passwords
- Call `supabase.auth.updateUser({ password })` to save
- On success, sign out and show "Password Updated!" with link back to login

**3. App.tsx** — Add route:
- Import `ResetPassword` and add `<Route path="/reset-password" element={<ResetPassword />} />`

