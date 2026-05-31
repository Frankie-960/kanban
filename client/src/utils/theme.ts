export const getTheme = () => {
  const isDark = localStorage.getItem('darkMode') === 'true';
  return {
    isDark,
    cardBg: isDark ? '#161b22' : '#ffffff',
    textPrimary: isDark ? '#e6edf3' : '#1d1d1f',
    textSecondary: isDark ? '#8b949e' : '#86868b',
    borderColor: isDark ? '#30363d' : '#d2d2d7',
    accentColor: isDark ? '#4096FF' : '#1677FF',
  };
};

export const useTheme = () => {
  return getTheme();
};