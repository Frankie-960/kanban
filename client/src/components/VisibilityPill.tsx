import { Dropdown } from 'antd';
import type { Visibility } from '../types';

const LABEL: Record<Visibility, string> = { PRIVATE: '私有', DEPARTMENT: '部门', SHARED: '公开' };
const ICON: Record<Visibility, string> = { PRIVATE: '◔', DEPARTMENT: '◑', SHARED: '◉' };

interface VisibilityPillProps {
  value: Visibility;
  onChange?: (v: Visibility) => void;
  compact?: boolean;
}

export function VisibilityPill({ value, onChange, compact = false }: VisibilityPillProps) {
  const pill = (
    <span
      className={`vis-pill vis-${value.toLowerCase()}${compact ? ' vis-compact' : ''}`}
      onClick={(e) => e.stopPropagation()}
      title={`可见范围：${LABEL[value]}`}
    >
      <span className="vis-icon">{ICON[value]}</span>
      {!compact && <span className="vis-label">{LABEL[value]}</span>}
    </span>
  );
  if (!onChange) return pill;

  const items = (['PRIVATE', 'DEPARTMENT', 'SHARED'] as Visibility[]).map((v) => ({
    key: v,
    label: `${ICON[v]}  ${LABEL[v]}`,
    disabled: v === value,
  }));

  return (
    <Dropdown
      menu={{ items, onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); onChange(key as Visibility); } }}
      trigger={['click']}
    >
      {pill}
    </Dropdown>
  );
}
