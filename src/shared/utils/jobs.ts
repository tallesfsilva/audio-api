const RTF_TABLE: Record<string, number> = {
  "large-v3": 0.76,
  "large-v2": 0.76,
  "medium":   0.50,
  "base":     0.34,
};

const DIARIZATION_OVERHEAD = 1.35;

export function estimateProcessingSeconds(
  audioDurationSeconds: number,
  modelSize: string,
  enableDiarization: boolean = false,
): number {
  const rtf = RTF_TABLE[modelSize] ?? 1.77;
  return Math.round(audioDurationSeconds * (enableDiarization ? rtf * DIARIZATION_OVERHEAD : rtf));
}


export function formatDuration(seconds: number): string {
  const totalMin = Math.floor(seconds / 60);
  if (totalMin >= 60) {
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  }
  return `${totalMin}min`;
}