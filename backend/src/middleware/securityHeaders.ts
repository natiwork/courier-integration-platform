import type { RequestHandler } from 'express';

// A few headers for a JSON API, set by hand instead of with helmet: most of helmet's headers (Content-Security-Policy
// and friends) protect HTML pages, and those are served by nginx (frontend/security-headers.conf), not by this API.
//   nosniff        the browser must treat a response as the declared JSON, never guess another type;
//   no-referrer    our URLs (order ids, searches with names) are not passed on to other sites;
//   no-store       responses contain customer data: no browser or proxy cache keeps a copy.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
};
