import type { Joint } from '@ras/shell-spec';

export const JOINTS: Joint[] = ['base', 'shoulder', 'elbow', 'grip'];
export const JOINT_LABEL: Record<Joint, string> = { base: 'Base', shoulder: 'Shoulder', elbow: 'Elbow', grip: 'Grip' };
