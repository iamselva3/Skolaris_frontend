import type { Config } from 'tailwindcss';

/**
 * Theme is REPLACED, not extended. Tailwind utilities map 1:1 to CSS vars
 * declared in src/styles/tokens.css. Edit tokens.css to rebrand; nothing else.
 *
 * Stripped:
 *   - boxShadow / dropShadow utilities (use 1px borders)
 *   - bg-gradient utilities
 *   - large fontSize beyond xl (22px) — except the dashboard module card title cap
 *   - large rounded (rounded-xl+) except `rounded-full` for avatars
 *
 * Locked 2026-05-27 to match the ERP-identity prompt §5.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',

      app:     'var(--bg-app)',
      surface: 'var(--bg-surface)',
      subtle:  'var(--bg-subtle)',
      hover:   'var(--bg-hover)',

      'border':        'var(--border)',
      'border-soft':   'var(--border-soft)',
      'border-strong': 'var(--border-strong)',
      'border-focus':  'var(--border-focus)',

      'text':           'var(--text)',
      'text-muted':     'var(--text-muted)',
      'text-faint':     'var(--text-faint)',
      'text-on-primary':'var(--text-on-primary)',

      primary: {
        DEFAULT: 'var(--primary)',
        hover:   'var(--primary-hover)',
        active:  'var(--primary-active)',
        soft:    'var(--primary-soft)',
      },

      branch: {
        bg:     'var(--branch-bg)',
        border: 'var(--branch-border)',
        text:   'var(--branch-text)',
      },
      bell: {
        bg:    'var(--bell-bg)',
        text:  'var(--bell-text)',
        count: 'var(--bell-count)',
      },

      success:        'var(--success)',
      'success-soft': 'var(--success-soft)',
      warning:        'var(--warning)',
      'warning-soft': 'var(--warning-soft)',
      danger:         'var(--danger)',
      'danger-soft':  'var(--danger-soft)',
      info:           'var(--info)',
      'info-soft':    'var(--info-soft)',
      online:         'var(--online)',
    },
    spacing: {
      0: '0',
      px: '1px',
      0.5: '2px',
      1: 'var(--space-1)',     // 4
      1.5: '6px',
      2: 'var(--space-2)',     // 8
      2.5: '10px',
      3: 'var(--space-3)',     // 12
      4: 'var(--space-4)',     // 16
      5: 'var(--space-5)',     // 20
      6: 'var(--space-6)',     // 24
      7: '28px',
      8: 'var(--space-8)',     // 32
      9: '36px',
      10: '40px',
      11: '44px',
      12: '48px',
      14: '56px',
      16: '64px',
      20: '80px',
      24: '96px',
      32: '128px',
      40: '160px',
      48: '192px',
      55: '220px',             // module card height
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',    // 4
      DEFAULT: 'var(--radius)',  // 8
      md: 'var(--radius-md)',    // 12
      full: '9999px',
    },
    borderWidth: { 0: '0', DEFAULT: '1px', 2: '2px' },
    fontSize: {
      '[10px]': ['10px', { lineHeight: '14px' }],
      '[11px]': ['11px', { lineHeight: '15px' }],
      '[12px]': ['12px', { lineHeight: '16px' }],
      '[13px]': ['13px', { lineHeight: '18px' }],
      xs:   ['11px', { lineHeight: '16px' }],
      sm:   ['12px', { lineHeight: '18px' }],
      base: ['14px', { lineHeight: '20px' }],
      md:   ['15px', { lineHeight: '22px' }],
      lg:   ['18px', { lineHeight: '26px' }],
      xl:   ['22px', { lineHeight: '30px' }],
    },
    fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '700' },
    extend: {
      gridTemplateColumns: {
        'modules-5': 'repeat(5, minmax(0, 1fr))',
        'modules-3': 'repeat(3, minmax(0, 1fr))',
        'megamenu-2': 'repeat(2, minmax(0, 1fr))',
        'megamenu-3': 'repeat(3, minmax(0, 1fr))',
        nav: 'repeat(5, minmax(0, 1fr))',
        'stats-5': 'repeat(auto-fit, minmax(180px, 1fr))',
      },
      maxWidth: { auth: '320px', 'auth-pane': '360px' },
      height: {
        topbar: 'var(--topbar-height)',           // 64
        breadcrumb: 'var(--breadcrumb-height)',   // 64
        'module-card': '220px',
      },
    },
    boxShadow: { none: 'none' },
    dropShadow: { none: '0 0 #0000' },
  },
  plugins: [],
};

export default config;
