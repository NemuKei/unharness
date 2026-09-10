import { createRoot } from "react-dom/client";
import { PublicApp } from "./PublicApp";
import { consumeConnectionHandoff, PublicConnection } from "./connection";
import "./styles.css";
import "./public.css";

const readHandoff = () => consumeConnectionHandoff(location.href, clean => history.replaceState(history.state, "", clean));
const client = new PublicConnection({ pageOrigin: location.origin, handoff: readHandoff() });
const changed = () => { const handoff = readHandoff(); if (handoff.kind !== "none") client.acceptHandoff(handoff); };
window.addEventListener("hashchange", changed);
createRoot(document.getElementById("root")!).render(<PublicApp client={client}/>);
if (import.meta.hot) import.meta.hot.dispose(() => { window.removeEventListener("hashchange", changed); client.disconnect(); });
