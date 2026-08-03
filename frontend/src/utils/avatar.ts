// Avatar helpers: avatar_url can be a regular image URL OR a built-in
// "initial:<n>" variant that renders colored initials (no external dependency).

export const AVATAR_COLORS = ['#f5c518', '#5b9df6', '#3ddc84', '#f6534f', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

export const isInitialAvatar = (url: string | null | undefined): boolean => {
    return !!url && /^initial:\d+$/.test(url);
};

export const getAvatarColor = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const match = url.match(/^initial:(\d+)$/);
    return match ? AVATAR_COLORS[parseInt(match[1], 10) % AVATAR_COLORS.length] : null;
};
