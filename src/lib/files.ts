// Shared file helpers. Previously each admin upload screen carried its own
// copy of formatFileSize; data-URL encoding matches the pattern already used
// by the BTB cleaning schedule (src/app/between-the-buns/cleaning-schedule).

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/** Read a File into a data URL for storage in a *_url TEXT column. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger a browser download. The download attribute applies to data: URLs;
 * for remote URLs the browser falls back to opening them.
 */
export function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
