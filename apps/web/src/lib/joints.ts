import type { Joint } from '@ras/shell-spec';

export const JOINTS: Joint[] = ['base', 'shoulder', 'elbow', 'grip'];
/** Firmware routine ids (lento, saludo, recta) shown in English. Unknown ids fall back to the id. */
export const ROUTINE_LABEL: Record<string, string> = { robot: 'Robot', lento: 'Slow', saludo: 'Wave', recta: 'Straight' };
export const routineLabel = (r: string) => ROUTINE_LABEL[r] ?? r;
export const JOINT_LABEL: Record<Joint, string> = { base: 'Base', shoulder: 'Shoulder', elbow: 'Elbow', grip: 'Grip' };
