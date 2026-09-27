import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// driver.js base styles must load before index.css so the theme overrides win.
import "driver.js/dist/driver.css";
import "./index.css";
import "./lib/i18n";

createRoot(document.getElementById("root")!).render(<App />);
