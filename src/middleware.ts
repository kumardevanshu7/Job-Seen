import { defineMiddleware } from 'astro:middleware';

// In dev mode: rewrites /users/<username> → /users/_shell so the React shell
// can read window.location.pathname and show the right user's jobs.
// In production: Firebase Hosting's catch-all rewrite handles this.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Match /users/<anything> but NOT /users/_shell itself (avoid infinite loop)
  if (/^\/users\/(?!_shell)[^/]+\/?$/.test(pathname)) {
    return context.rewrite('/users/_shell');
  }

  return next();
});
