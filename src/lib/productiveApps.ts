/**
 * Determines if an application is considered "productive" (working).
 * Only Adobe Photoshop, Adobe InDesign, and Adobe Illustrator count as productive.
 * All other applications are considered idle.
 */
export function isProductiveApp(appName: string): boolean {
  if (!appName) return false;
  const lower = appName.toLowerCase();

  // Check file extensions
  const productiveExtensions = ['.psd', '.psb', '.indd', '.ai'];
  for (const ext of productiveExtensions) {
    if (lower.includes(ext)) return true;
  }

  // Check application name patterns
  const productivePatterns = ['photoshop', 'indesign', 'illustrator'];
  for (const pattern of productivePatterns) {
    if (lower.includes(pattern)) return true;
  }

  return false;
}
