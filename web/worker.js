export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname.startsWith("terminal.")) {
      if (url.pathname === "/terminal" || url.pathname === "/terminal/") return Response.redirect(new URL("/", url).toString(), 301);
      if (url.pathname === "/" || url.pathname === "") return env.ASSETS.fetch(new Request(new URL("/terminal/" + url.search, url), req));
      if (url.pathname === "/index.txt") return env.ASSETS.fetch(new Request(new URL("/terminal/index.txt" + url.search, url), req));
    }
    return env.ASSETS.fetch(req);
  },
};
