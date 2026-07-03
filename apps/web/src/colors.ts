import { categoryOf, type Activity, type ActivityCategory } from '@fitness/shared';

/** 分类重音色（iOS 系统色板）：只用于运动标签、色点、柱图，不抢 Action Blue 的主角 */
export const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  run: '#FF3B30',
  strength: '#AF52DE',
  swim: '#32ADE6',
  ride: '#34C759',
  ball: '#FF9500',
  yoga: '#FF2D55',
  hike: '#A2845E',
  rest: '#8E8E93',
  other: '#5856D6',
};

export function activityColor(activity: Activity): string {
  return CATEGORY_COLORS[categoryOf(activity)];
}
