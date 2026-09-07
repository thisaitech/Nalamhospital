export function formatPunchLocationLabel(params: {
  placeName?: string | null;
  punchRadiusMeters: number;
}): string {
  const name = params.placeName?.trim();
  if (name) {
    return `${name} · ${params.punchRadiusMeters} m radius`;
  }
  return `Saved location · ${params.punchRadiusMeters} m radius`;
}
