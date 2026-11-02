import { useEffect, useState } from "react";
import "./app.css";
import { AnswerScreen } from "./trial/AnswerScreen";
import { NewTrial } from "./trial/NewTrial";
import { TimeScreen } from "./trial/TimeScreen";

function useRoute() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const on = () => setH(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
}

export function App() {
  const r = useRoute();
  let body = <p>現場の紙芝居</p>;
  // #/t/<テナント>/trial/new ・ #/t/<テナント>/trial/<回>/time ・ #/t/<テナント>/trial/<回>/answer/<参加者>
  if (r[0] === "t" && r[2] === "trial") {
    const tenant = r[1];
    if (r[3] === "new") body = <NewTrial tenant={tenant} />;
    else if (r[4] === "time") body = <TimeScreen tenant={tenant} id={r[3]} />;
    else if (r[4] === "answer" && r[5]) body = <AnswerScreen tenant={tenant} id={r[3]} participant={r[5]} />;
  }
  return <main data-testid="app">{body}</main>;
}
