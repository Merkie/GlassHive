import { Match, Show, Switch } from "solid-js";
import {
  TbOutlineMessagePlus,
  TbOutlineArrowBackUp,
  TbFillArrowBigUp,
  TbFillArrowBigDown,
  TbOutlineAlertTriangle,
  TbOutlineSparkles,
  TbOutlineCircleCheck,
  TbOutlinePencil,
} from "solid-icons/tb";
import type { Activity } from "../types";

export default function ActivityLine(props: { event: Activity }) {
  return (
    <div class="flex items-start gap-1.5 py-0.5">
      <Switch>
        <Match when={props.event.kind === "post-created" && props.event}>
          {(e) => (
            <>
              <TbOutlineMessagePlus size={12} class="mt-0.5 shrink-0 text-orange-400" />
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                <span class="text-neutral-300">"{e().title.slice(0, 80)}"</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "comment-created" && props.event}>
          {(e) => (
            <>
              <TbOutlineArrowBackUp size={12} class="mt-0.5 shrink-0 text-fuchsia-400" />
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                <span class="text-neutral-300">"{e().body.slice(0, 80)}"</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "vote" && props.event}>
          {(e) => (
            <>
              <Show
                when={e().type === "up"}
                fallback={<TbFillArrowBigDown size={12} class="mt-0.5 shrink-0 text-rose-400" />}
              >
                <TbFillArrowBigUp size={12} class="mt-0.5 shrink-0 text-emerald-400" />
              </Show>
              <span>
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600"> → </span>
                <span class="text-neutral-500">{e().entityId.slice(0, 8)}</span>
                <span class="text-neutral-700"> ({e().result})</span>
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "tool-error" && props.event}>
          {(e) => (
            <>
              <TbOutlineAlertTriangle size={12} class="mt-0.5 shrink-0 text-rose-400" />
              <span class="text-rose-300">
                <span class="text-neutral-400">{e().tool}</span>{" "}
                <span class="text-neutral-300">u/{e().username}</span>
                <span class="text-neutral-600">: </span>
                {e().error.slice(0, 100)}
              </span>
            </>
          )}
        </Match>
        <Match when={props.event.kind === "phase" && props.event}>
          {(e) => (
            <>
              <Switch
                fallback={
                  <TbOutlinePencil size={12} class="mt-0.5 shrink-0 animate-pulse text-sky-400" />
                }
              >
                <Match when={e().tone === "success"}>
                  <TbOutlineCircleCheck size={12} class="mt-0.5 shrink-0 text-emerald-400" />
                </Match>
                <Match when={e().tone === "start"}>
                  <TbOutlineSparkles size={12} class="mt-0.5 shrink-0 text-orange-400" />
                </Match>
              </Switch>
              <span
                class={
                  e().tone === "success"
                    ? "font-semibold text-emerald-300"
                    : e().tone === "start"
                      ? "font-semibold text-orange-300"
                      : "font-semibold text-sky-300"
                }
              >
                {e().label}
              </span>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}
