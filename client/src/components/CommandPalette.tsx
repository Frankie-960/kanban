import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Input } from 'antd';
import type { InputRef } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

type Result = {
  type: 'item' | 'project' | 'action';
  id: string;
  title: string;
  subtitle?: string;
  action: () => void;
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { items, projects } = useAppStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const go = (path: string) => { onClose(); navigate(path); };

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    const actions: Result[] = [
      { type: 'action', id: 'new-item',    title: '新建事项',     subtitle: '/items/new',  action: () => go('/items/new') },
      { type: 'action', id: 'go-kanban',   title: '跳转 · 看板',  subtitle: '/kanban',     action: () => go('/kanban') },
      { type: 'action', id: 'go-list',     title: '跳转 · 列表',  subtitle: '/list',       action: () => go('/list') },
      { type: 'action', id: 'go-projects', title: '跳转 · 项目',  subtitle: '/projects',   action: () => go('/projects') },
      { type: 'action', id: 'go-dashboard',title: '跳转 · 首页',  subtitle: '/',           action: () => go('/') },
      { type: 'action', id: 'go-reports',  title: '跳转 · 报告',  subtitle: '/reports',    action: () => go('/reports') },
    ];

    const itemMatches = items
      .filter((i) => !term || i.title.toLowerCase().includes(term))
      .slice(0, 8)
      .map<Result>((i) => ({
        type: 'item',
        id: i.id,
        title: i.title,
        subtitle: i.status,
        action: () => go(`/items/${i.id}`),
      }));

    const projMatches = projects
      .filter((p) => !term || (p.code ?? '').toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map<Result>((p) => ({
        type: 'project',
        id: p.id,
        title: p.name,
        subtitle: p.code ?? '',
        action: () => go(`/projects/${p.id}`),
      }));

    if (!term) {
      return [...actions, ...itemMatches.slice(0, 5)];
    }
    const matchedActions = actions.filter((a) => a.title.toLowerCase().includes(term));
    return [...itemMatches, ...projMatches, ...matchedActions];
  }, [q, items, projects]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results, active]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={620}
      className="cmdk-modal"
      destroyOnClose
      maskClosable
      styles={{ body: { padding: 0 } }}
    >
      <Input
        ref={inputRef}
        placeholder="搜索事项/项目，或输入快捷动作…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={handleKey}
        className="cmdk-input"
        variant="borderless"
        autoFocus
      />
      <div className="cmdk-results">
        {results.map((r, i) => (
          <div
            key={`${r.type}-${r.id}`}
            className={`cmdk-row ${i === active ? 'active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => r.action()}
          >
            <span className={`cmdk-tag tag-${r.type}`}>
              {r.type === 'item' ? '事' : r.type === 'project' ? '项' : '⌘'}
            </span>
            <span className="cmdk-title">{r.title}</span>
            {r.subtitle && <span className="cmdk-sub">{r.subtitle}</span>}
          </div>
        ))}
        {results.length === 0 && <div className="cmdk-empty">无匹配</div>}
      </div>
      <div className="cmdk-footer">
        <span>↑↓ 切换</span>
        <span>↵ 选择</span>
        <span>esc 关闭</span>
      </div>
    </Modal>
  );
}
