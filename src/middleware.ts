import { defineMiddleware } from 'astro:middleware';

// In dev mode: rewrite dynamic paths to static shells / query pages.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // /users/<username> → /users/_shell
  if (/^\/users\/(?!_shell)[^/]+\/?$/.test(pathname)) {
    return context.rewrite('/users/_shell');
  }

  // /jobs/<id> → /job?id=<id> (reliable static page)
  const jobMatch = pathname.match(/^\/jobs\/(?!_shell)([^/]+)\/?$/);
  if (jobMatch) {
    return context.rewrite(`/job?id=${encodeURIComponent(jobMatch[1])}`);
  }

  return next();
});
