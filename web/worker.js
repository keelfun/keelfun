export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname.startsWith("terminal.")) {
      const p = url.pathname;
      const go = (to) => Response.redirect(new URL(to + url.search, url).toString(), 301);
      if (p === "/terminal" || p === "/terminal/") return go("/pulse/");
      if (p === "/pulse") return go("/pulse/");
      if (p === "/discover" || p === "/discover/") return go("/");
      const to = p === "/" || p === "" ? "/discover/" : p === "/index.txt" ? "/discover/index.txt" : p.startsWith("/pulse/") ? "/terminal/" + p.slice(7) : null;
      if (to) return env.ASSETS.fetch(new Request(new URL(to + url.search, url), req));
    }
    return env.ASSETS.fetch(req);
  },
};
