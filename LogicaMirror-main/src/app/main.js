import { startApp } from "./App.js";

const root = document.getElementById("app");

if (!root) {
  throw new Error("App root not found");
}

startApp(root);
