const VALID_THEME_NAMES = ['clean-professional', 'flat-motion-graphics', 'minimalist-diagram', 'anime-ghibli'];
const VALID_SCENE_TYPES = ['text_card','stat_card','callout','comparison','hero_title','bar_chart','line_chart','pie_chart','kpi_grid','progress_bar','anime_scene','terminal_scene','screenshot_scene'];

export interface ValidationResult { valid: boolean; errors: string[]; warnings: string[]; }

export function validateProps(props: Record<string, unknown>): ValidationResult {
  const errors: string[] = [], warnings: string[] = [];
  if (!props.cuts || !Array.isArray(props.cuts)) { errors.push('props.cuts must be an array'); return { valid: false, errors, warnings }; }
  const cuts = props.cuts as Record<string, unknown>[];
  if (cuts.length === 0) { errors.push('props.cuts must not be empty'); return { valid: false, errors, warnings }; }
  cuts.forEach((cut, i) => {
    const p = `cuts[${i}]`;
    if (!cut.id || typeof cut.id !== 'string') errors.push(`${p}.id is required`);
    if (typeof cut.in_seconds !== 'number' || cut.in_seconds < 0) errors.push(`${p}.in_seconds must be non-negative`);
    if (typeof cut.out_seconds !== 'number') errors.push(`${p}.out_seconds must be a number`);
    else if (typeof cut.in_seconds === 'number' && cut.out_seconds <= cut.in_seconds) errors.push(`${p}.out_seconds > in_seconds`);
    if (cut.type && !VALID_SCENE_TYPES.includes(cut.type as string)) warnings.push(`${p}.type "${cut.type}" unknown`);
    if ((cut.type === 'bar_chart' || cut.type === 'pie_chart' || cut.type === 'kpi_grid') && cut.chartData && !Array.isArray(cut.chartData)) errors.push(`${p}.chartData must be array`);
    if (cut.type === 'line_chart' && cut.chartSeries && !Array.isArray(cut.chartSeries)) errors.push(`${p}.chartSeries must be array`);
  });
  if (props.theme && typeof props.theme === 'string' && !VALID_THEME_NAMES.includes(props.theme as string)) warnings.push(`theme "${props.theme}" unknown`);
  return { valid: errors.length === 0, errors, warnings };
}
