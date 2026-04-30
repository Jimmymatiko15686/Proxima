import React, { createContext, useContext, useState } from 'react';
import { colors } from './theme';

type Theme = typeof colors.dark;

type ThemeContextType = {
  theme: Theme;
  fonts: typeof colors.fonts;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: colors.dark,
  fonts: colors.fonts,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? colors.dark : colors.light;
  const fonts = colors.fonts;
  const toggleTheme = () => setIsDark(prev => !prev);

  return (
    <ThemeContext.Provider value={{ theme, fonts, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}