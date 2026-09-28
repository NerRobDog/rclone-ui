const { heroui } = require('@heroui/react')

/**
 * satoru design tokens.
 *
 * Neutrals follow the grading-suite rule: a low-chroma grey surround so the
 * interface never tints the viewer's perception of footage. The only saturated
 * colour is shu (朱) vermilion — the hanko seal and the REC tally light — and it
 * is reserved for primary actions, focus and "live" states.
 */
const shu = {
    50: '#FEF3EF',
    100: '#FDE3D9',
    200: '#FBC4B0',
    300: '#F79C7F',
    400: '#F1714D',
    500: '#E0431C',
    600: '#C23615',
    700: '#9E2B12',
    800: '#7A2312',
    900: '#561A0F',
    DEFAULT: '#E0431C',
    foreground: '#FFFFFF',
}

const sumiDark = {
    50: '#131315',
    100: '#1C1C1F',
    200: '#26262A',
    300: '#34343A',
    400: '#4A4A52',
    500: '#6B6B74',
    600: '#8E8E96',
    700: '#B3B3B9',
    800: '#D6D5D9',
    900: '#EFEEF0',
    DEFAULT: '#34343A',
    foreground: '#ECEAE6',
}

const sumiLight = {
    50: '#FAFAF8',
    100: '#F2F1EE',
    200: '#E6E4E0',
    300: '#D5D3CE',
    400: '#B4B2AC',
    500: '#8E8C87',
    600: '#6C6A66',
    700: '#4E4C49',
    800: '#32312F',
    900: '#1B1A19',
    DEFAULT: '#D5D3CE',
    foreground: '#16161A',
}

const status = {
    success: { DEFAULT: '#3E9B6A', foreground: '#FFFFFF' },
    warning: { DEFAULT: '#D99A1E', foreground: '#16161A' },
    // Raspberry, ~30° away from shu so "destroy" never reads as "primary".
    danger: { DEFAULT: '#D12E5E', foreground: '#FFFFFF' },
    secondary: { DEFAULT: '#5B6E8C', foreground: '#FFFFFF' },
}

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
        './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: [
                    '"Inter Variable"',
                    'Inter',
                    'system-ui',
                    '-apple-system',
                    '"Segoe UI"',
                    'Roboto',
                    'sans-serif',
                ],
                mono: [
                    '"JetBrains Mono Variable"',
                    '"JetBrains Mono"',
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'monospace',
                ],
            },
            colors: {
                shu,
            },
            keyframes: {
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(24px)' },
                    '60%': { opacity: '1' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'show-more': {
                    '0%, 100%': {
                        transform: 'translateY(-25%)',
                        timingFunction: 'cubic-bezier(0.8,0,1,1)',
                    },
                    '60%': {
                        transform: 'none',
                        timingFunction: 'cubic-bezier(0,0,0.2,1)',
                    },
                },
                'show-more-title': {
                    '0%, 100%': {
                        transform: 'translateY(5%)',
                        timingFunction: 'cubic-bezier(0.8,0,1,1)',
                    },
                    '60%': {
                        transform: 'none',
                        timingFunction: 'cubic-bezier(0,0,0.2,1)',
                    },
                },
                tally: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.35' },
                },
            },
            animation: {
                'fade-in-up': 'fade-in-up 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                'show-more': 'show-more 2s infinite',
                'show-more-title': 'show-more-title 2s infinite',
                tally: 'tally 1.6s ease-in-out infinite',
            },
        },
    },
    darkMode: 'class',
    plugins: [
        heroui({
            layout: {
                radius: { small: '4px', medium: '6px', large: '10px' },
                borderWidth: { small: '1px', medium: '1px', large: '1.5px' },
                disabledOpacity: '0.45',
                dividerWeight: '1px',
                fontSize: {
                    tiny: '0.75rem',
                    small: '0.8125rem',
                    medium: '0.875rem',
                    large: '1rem',
                },
                lineHeight: {
                    tiny: '1rem',
                    small: '1.125rem',
                    medium: '1.25rem',
                    large: '1.5rem',
                },
            },
            themes: {
                light: {
                    colors: {
                        background: '#F5F4F1',
                        foreground: { ...sumiLight, DEFAULT: '#16161A' },
                        divider: 'rgba(22, 22, 26, 0.10)',
                        focus: shu.DEFAULT,
                        overlay: '#16161A',
                        content1: { DEFAULT: '#FFFFFF', foreground: '#16161A' },
                        content2: { DEFAULT: '#F2F1EE', foreground: '#16161A' },
                        content3: { DEFAULT: '#E6E4E0', foreground: '#16161A' },
                        content4: { DEFAULT: '#D5D3CE', foreground: '#16161A' },
                        default: sumiLight,
                        primary: { ...shu, DEFAULT: '#C93A18' },
                        ...status,
                    },
                },
                dark: {
                    colors: {
                        background: '#0F0F10',
                        foreground: { ...sumiDark, DEFAULT: '#ECEAE6' },
                        divider: 'rgba(236, 234, 230, 0.08)',
                        focus: shu[400],
                        overlay: '#000000',
                        content1: { DEFAULT: '#17171A', foreground: '#ECEAE6' },
                        content2: { DEFAULT: '#1E1E22', foreground: '#ECEAE6' },
                        content3: { DEFAULT: '#26262B', foreground: '#ECEAE6' },
                        content4: { DEFAULT: '#303036', foreground: '#ECEAE6' },
                        default: sumiDark,
                        primary: {
                            50: shu[900],
                            100: shu[800],
                            200: shu[700],
                            300: shu[600],
                            400: shu[500],
                            500: shu[400],
                            600: shu[300],
                            700: shu[200],
                            800: shu[100],
                            900: shu[50],
                            DEFAULT: shu.DEFAULT,
                            foreground: '#FFFFFF',
                        },
                        ...status,
                    },
                },
            },
        }),
    ],
}
