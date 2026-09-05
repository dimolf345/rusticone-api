import type { Request } from "express";

import { REFRESH_COOKIE_NAME } from "../config/auth.js";

export function parseRefreshCookie(request: Request): string | null {
  const cookieHeader = request.header("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex < 0 || cookie.slice(0, separatorIndex).trim() !== REFRESH_COOKIE_NAME) {
      continue;
    }

    try {
      return decodeURIComponent(cookie.slice(separatorIndex + 1).trim()) || null;
    } catch {
      return null;
    }
  }

  return null;
}
