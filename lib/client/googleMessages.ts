// Plain-language messages for the Google sign-in / Gmail import redirects (?error=… in the URL).
export const GOOGLE_ERRORS: Record<string, string> = {
  google_exists: 'An account with this email already exists. Sign in with your password, then connect Google in Settings.',
  google_in_use: 'That Google account is already connected to another SafeSpend account.',
  google_failed: 'Google sign-in didn’t work. Please try again.',
  google_cancelled: 'Google sign-in was cancelled.',
  google_unverified: 'Your Google email address is not verified, so it can’t be used to sign in.',
  google_not_configured: 'Google sign-in is not set up on this server yet.',
  gmail_denied: 'You didn’t allow SafeSpend to read Gmail, so nothing was imported.',
};

export function googleErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return GOOGLE_ERRORS[code] ?? GOOGLE_ERRORS.google_failed;
}
