import index from "./index.html";
import login from "./login.html";

const server = Bun.serve({
  port: 3050,
  routes: {
    "/": index,
    "/login": login,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
