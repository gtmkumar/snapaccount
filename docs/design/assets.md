# SnapAccount Design Assets

## Icons

All icons use **Ionicons** via `@expo/vector-icons`. Below is the complete icon inventory used across the app.

### Navigation & Actions
| Icon Name | Usage | Size |
|-----------|-------|------|
| arrow-back | Back navigation button | 22 |
| chevron-forward | Menu item disclosure | 16-18 |
| chevron-down | Dropdown indicator | 14 |
| add | FAB add action | 28 |
| close | Modal/overlay dismiss | 20 |
| search | Search toggle | 16-20 |
| options-outline | Filter/settings | 20 |

### Module Icons
| Icon Name | Module | Color Token |
|-----------|--------|-------------|
| camera / camera-outline | Documents | brand.500 |
| receipt-outline | GST | module.gst (#7C3AED) |
| wallet-outline | Loans | module.loan (#EA580C) |
| document-text-outline | ITR | module.itr (#0891B2) |
| chatbubble-ellipses-outline | Chat | brand.500 |
| notifications-outline | Notifications | accent.500 |

### Status & Feedback
| Icon Name | Usage | Color |
|-----------|-------|-------|
| checkmark-circle | Success/completion | success.500 |
| alert-circle | Warning/urgent | warning.600 |
| warning | Mismatch/error | accent.600 |
| information-circle-outline | Info banners | info.600 |
| shield-checkmark | Security/trust (auth) | brand.500 |
| lock-closed-outline | Data privacy | success.600 |

### Finance & Business
| Icon Name | Usage |
|-----------|-------|
| trending-up | Sales metric card |
| trending-down | Expense metric card |
| arrow-up-circle | Output tax |
| arrow-down-circle | ITC available |
| briefcase-outline | Business loan |
| sync-outline | Working capital |
| business-outline | MSME/Organization |
| calculator-outline | EMI calculator |
| diamond-outline | Loan hub hero |
| scale-outline | Regime comparison |

### Profile & Settings
| Icon Name | Usage |
|-----------|-------|
| person-circle-outline | Profile |
| business-outline | Edit business |
| phone-portrait-outline | Manage devices |
| language-outline | Language settings |
| card-outline | Subscription |
| help-circle-outline | Help/support |
| log-out-outline | Sign out |

## Image Placeholders

| Placeholder | Location | Size | Notes |
|-------------|----------|------|-------|
| App logo "S" | SplashScreen | 110x110 outer, 80x80 inner | Text-based, replace with SVG logo |
| User avatar | Profile, More, Home | 40-80px | Initial letter on brand.500 background |
| CA avatar | ChatList | 48px | Initial letter on brand.500 background |
| Document thumbnail | DocumentDetail | Full width, 240px height | Loaded from API |

## Gradient Definitions

| Name | Colors | Usage |
|------|--------|-------|
| Hero gradient | brand.950 -> brand.700 | Home hero, EMI result |
| Splash gradient | brand.950 -> brand.800 -> brand.700 | Splash screen |
| Loan hero | brand.800 -> brand.600 | Loan hub hero |
| Upload Bill action | brand.500 -> brand.600 | Quick action icon |
| GST action | #7C3AED -> #6D28D9 | Quick action icon |
| Loan action | accent.500 -> accent.600 | Quick action icon |
| ITR action | #0891B2 -> #0E7490 | Quick action icon |

## Typography Scale (Mobile)

| Role | Size | Weight | Letter Spacing |
|------|------|--------|----------------|
| Page title | 22px | 800 | -0.3 |
| Section title | 18px | 700 | -0.3 |
| Card heading | 16-17px | 700 | -0.2 |
| Body | 14-15px | 400-500 | 0 |
| Caption | 12-13px | 500 | 0.2 |
| Overline/label | 11-12px | 600 | 0.3-0.5 |
| Amount (large) | 32-36px | 800 | -0.5 to -1 |
| Amount (medium) | 20px | 700 | -0.3 |
| Amount (small) | 14px | 600 | 0 |
