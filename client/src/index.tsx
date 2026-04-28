/* @refresh reload */
import { render } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import "./app.css";
import Home from "./pages/Home";
import View from "./pages/View";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

render(
  () => (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/v/:id" component={View} />
    </Router>
  ),
  root
);
