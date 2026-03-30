import { LocalStorageKeys } from 'librechat-data-provider';

const faviconSelectors = [
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
];

const getAbsoluteIconUrl = (iconPath: string) => {
  try {
    return new URL(iconPath, window.location.origin).toString();
  } catch {
    return iconPath;
  }
};

const updateFaviconLinks = (iconPath: string) => {
  const absoluteIconUrl = getAbsoluteIconUrl(iconPath);

  faviconSelectors.forEach((selector) => {
    document.querySelectorAll<HTMLLinkElement>(selector).forEach((link) => {
      link.href = absoluteIconUrl;
    });
  });
};

export const applyAppTitle = (appTitle?: string) => {
  if (!appTitle) {
    return;
  }

  document.title = appTitle;
  localStorage.setItem(LocalStorageKeys.APP_TITLE, appTitle);
};

export const applyAppIcon = (appIcon?: string) => {
  if (!appIcon) {
    return;
  }

  updateFaviconLinks(appIcon);
  localStorage.setItem(LocalStorageKeys.APP_ICON, appIcon);
};
