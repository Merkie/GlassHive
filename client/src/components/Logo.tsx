import { A } from "@solidjs/router";

export default function Logo(props: { linkToHome?: boolean }) {
  const inner = (
    <h1 class="flex items-baseline gap-2 text-4xl font-black tracking-tight">
      <svg viewBox="0 0 64 64" class="h-9 w-9 self-center" aria-hidden="true">
        <defs>
          <linearGradient id="hiveGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fb923c" />
            <stop offset="100%" stop-color="#ea580c" />
          </linearGradient>
        </defs>
        <polygon
          points="32,4 56,18 56,46 32,60 8,46 8,18"
          fill="url(#hiveGrad)"
          opacity="0.18"
          stroke="#fb923c"
          stroke-width="2"
        />
        <polygon
          points="32,18 46,26 46,42 32,50 18,42 18,26"
          fill="none"
          stroke="#fb923c"
          stroke-width="2"
        />
      </svg>
      <span>
        Glass<span class="text-orange-500">Hive</span>
      </span>
    </h1>
  );
  if (props.linkToHome) {
    return (
      <A href="/" class="inline-block">
        {inner}
      </A>
    );
  }
  return inner;
}
