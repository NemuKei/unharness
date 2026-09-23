import { createRoot } from "react-dom/client";
import { PublicApp } from "./PublicApp";
import "./styles.css";
import "./public.css";

createRoot(document.getElementById("root")!).render(<PublicApp/>);
