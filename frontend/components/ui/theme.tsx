'use client';
import { createContext, use } from 'react';
export const ThemeContext = createContext<'light' | 'dark'>('light');
export const useTheme = () => use(ThemeContext);
