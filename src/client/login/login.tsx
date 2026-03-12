import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LoginApp } from "./login-app";
import "@/styles/globals.css";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <LoginApp />
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  createRoot(elem).render(app);
}
