import { defineMiddleware } from 'astro:middleware';

// In dev mode: rewrite dynamic paths to shells so React can read window.location.
// In production: host catch-all / soft router handles unknown paths.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // /users/<username> → /users/_shell
  if (/^\/users\/(?!_shell)[^/]+\/?$/.test(pathname)) {
    return context.rewrite('/users/_shell');
  }

  // /jobs/<id> → /jobs/_shell
  if (/^\/jobs\/(?!_shell)[^/]+\/?$/.test(pathname)) {
    return context.rewrite('/jobs/_shell');
  }

  return next();
});
