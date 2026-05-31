import { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Switch, Button, message } from 'antd';
import {
  DashboardOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  LogoutOutlined,
  UserOutlined,
  BellOutlined,
  SafetyOutlined,
  SunOutlined,
  MoonOutlined,
  AppstoreOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { CommandPalette } from './CommandPalette';
import { authAPI } from '../services/api';

const { Header, Sider, Content } = AntLayout;

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, currentView, setCurrentView } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    document.body.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const isDark = darkMode;
  const bgColor = isDark ? '#0d1117' : '#f5f5f7';
  const headerBg = isDark ? '#161b22' : '#ffffff';
  const siderBg = isDark ? '#161b22' : '#ffffff';
  const textPrimary = isDark ? '#e6edf3' : '#1d1d1f';
  const accentColor = isDark ? '#4096FF' : '#1677FF';
  const borderColor = isDark ? '#30363d' : '#d2d2d7';

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '首页看板' },
    { key: '/kanban', icon: <AppstoreOutlined />, label: '看板视图' },
    { key: '/list', icon: <UnorderedListOutlined />, label: '列表视图' },
    { key: '/projects', icon: <FolderOutlined />, label: '项目管理' },
    { key: '/reports', icon: <FileTextOutlined />, label: '报告中心' },
    { key: '/department', icon: <TeamOutlined />, label: '部门管理' },
    { key: '/reminders', icon: <BellOutlined />, label: '提醒管理' },
    { key: '/settings', icon: <SettingOutlined />, label: '设置' },
    ...(user?.role === 'ADMIN' ? [{ key: '/admin', icon: <SafetyOutlined />, label: '用户管理' }] : []),
  ];

  const userMenuItems = [
    {
      key: 'theme',
      icon: darkMode ? <SunOutlined /> : <MoonOutlined />,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {darkMode ? '浅色模式' : '深色模式'}
        </span>
      ),
    },
    { key: 'profile', icon: <UserOutlined />, label: user?.name || '用户' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const handleResendVerification = async () => {
    try {
      await authAPI.resendVerification();
      message.success('激活邮件已发送，请查收');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送失败');
    }
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout();
      navigate('/login');
    } else if (key === 'theme') {
      setDarkMode(!darkMode);
    }
  };

  return (
    <AntLayout style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: bgColor }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme={darkMode ? 'dark' : 'light'}
        style={{
          borderRight: `1px solid ${borderColor}`,
          background: siderBg,
        }}
        width={220}
        collapsedWidth={72}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          <img
            src="/logo.jpg"
            alt="Logo"
            style={{
              height: collapsed ? 32 : 36,
              width: 'auto',
              objectFit: 'contain',
            }}
          />
          {!collapsed && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 15,
                fontWeight: 600,
                color: textPrimary,
                letterSpacing: -0.3,
              }}
            >
              采购看板
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          theme={darkMode ? 'dark' : 'light'}
          style={{
            background: 'transparent',
            border: 'none',
            marginTop: 8,
          }}
        />
      </Sider>
      <AntLayout style={{ background: bgColor, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          style={{
            background: headerBg,
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${borderColor}`,
            height: 64,
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <button
              onClick={() => setCurrentView(currentView === 'personal' ? 'department' : 'personal')}
              style={{
                background: currentView === 'personal'
                  ? (isDark ? '#238636' : '#34c759')
                  : (isDark ? '#4096FF' : '#1677FF'),
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {currentView === 'personal' ? '个人视图' : '部门视图'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="cmdk-hint-btn"
              onClick={() => setCmdkOpen(true)}
              title="全局搜索 / 快捷动作"
            >
              <span>搜索</span>
              <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
              <kbd>K</kbd>
            </button>
            <Switch
              checked={darkMode}
              onChange={setDarkMode}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
              size="small"
            />
            <Dropdown
              menu={{ items: userMenuItems, onClick: handleUserMenuClick }}
              placement="bottomRight"
            >
              <Avatar
                icon={<UserOutlined />}
                style={{
                  cursor: 'pointer',
                  background: accentColor,
                }}
              />
            </Dropdown>
          </div>
        </Header>
        <Content
          style={{
            padding: 24,
            background: bgColor,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {user && user.emailVerified === false ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 16,
              padding: 40,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 48 }}>📧</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: isDark ? '#e6edf3' : '#1d1d1f' }}>
                请验证您的邮箱
              </div>
              <div style={{ fontSize: 14, color: isDark ? '#8b949e' : '#86868b', maxWidth: 360, lineHeight: 1.7 }}>
                我们已向 <strong>{user.email}</strong> 发送了激活链接。<br />
                请查收邮件并点击链接完成验证后，才能使用系统功能。
              </div>
              <Button
                type="primary"
                size="large"
                onClick={handleResendVerification}
                style={{ borderRadius: 10, marginTop: 8 }}
              >
                重新发送验证邮件
              </Button>
              <Button
                type="link"
                size="small"
                style={{ color: isDark ? '#8b949e' : '#86868b' }}
                onClick={() => { logout(); navigate('/login'); }}
              >
                退出登录，换个账号
              </Button>
            </div>
          ) : (
            <Outlet />
          )}
        </Content>
      </AntLayout>
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </AntLayout>
  );
}
