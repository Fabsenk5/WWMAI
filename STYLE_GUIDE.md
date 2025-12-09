# Style Guide & Design Systems

## Core Philosophy
- **Modern & Premium**: Use dark aesthetics, gradients, and subtle blurs.
- **Fixed App Shell**: The header and navigation elements (User Icon, Branding, Theme Toggle) are fixed and float above the content.
- **Top-Leaning Layout**: Important content starts at the top 1/3 (15vh-30vh), leaving breathing room at the top.

## Layout Systems

### The App Shell
The application relies on a fixed "shell" that does not scroll:
- **User Icon** (`.user-icon`): Top-left, circular, outlined.
- **Branding** (`.branding-container`): Top-center, floating pill with blurred background.
- **Theme Toggle** (`.theme-toggle`): Top-right, circular, outlined.

**Implementation**:
These are placed in `App.tsx` outside the `.main-content` wrapper.

### The Content Wrapper
All page content must be wrapped in `.main-content` (handled globally in `App.tsx`).
- **Padding**: `15vh` top padding (reduced from 30vh) to align content below floating headers.
- **Scrolling**: Content scrolls internally within `.main-content`. The body does *not* scroll.

```css
.main-content {
  height: 100vh;
  padding-top: 15vh;
  overflow-y: auto;
}
```

## Component Styles

### Form Containers
Forms (Create Game, Join Game, etc.) should look like distinct "Cards" or "Boxes" floating in the space.
- **Style**: Outlined Box
- **Border**: `2px solid var(--border-color)`
- **Shadow**: `var(--shadow-md)`
- **Background**: `var(--bg-card)`
- **Alignment**: Centered horizontally, spaced 15vh from top.

```css
.form-page-container {
    border: 2px solid var(--border-color);
    background-color: var(--bg-card);
    box-shadow: var(--shadow-md);
    margin: 0 auto 50px auto;
}
```

### Floating Icons
Circular action buttons (User, Theme) follow a consistent shape:
- **Size**: 48px x 48px
- **Shape**: Circle (`border-radius: 50%`)
- **Border**: `1px solid var(--border-color)`
- **Background**: `var(--bg-card)`

## Colors & Theming
Global variables are defined in `App.css`.
- **Primary Text**: `var(--text-primary)` (White/Off-white in Dark Mode)
- **Background**: `var(--bg-secondary)` (Dark Gray in Dark Mode)
- **Card Background**: `var(--bg-card)` (Slightly lighter Gray in Dark Mode)
- **Accent**: `var(--accent-color)` (Blue)

## Typography
- **Headings**: 'Outfit' or 'Inter' (San-serif, Geometric).
- **Body**: 'Inter', Roboto, or System Sans.
