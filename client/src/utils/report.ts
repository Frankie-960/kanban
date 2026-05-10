import type { ReportType } from '../types';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  WEEKLY: '周报',
  BIWEEKLY: '双周报',
  MONTHLY: '月报',
  QUARTERLY: '季报',
  YEARLY: '年报',
};

export const getReportTypeLabel = (type: ReportType): string => {
  return REPORT_TYPE_LABELS[type] || '报告';
};