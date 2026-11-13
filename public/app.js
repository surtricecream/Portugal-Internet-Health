const TZ = "Europe/Lisbon";
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const buttons = [...document.querySelectorAll("[data-range]")];
const validRanges = buttons.map((b) => b.dataset.range);

const fmt = (opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
const tickFmt = {
  hours: fmt({ weekday: "short", hour: "2-digit", minute: "2-digit" }),
  days: fmt({ day: "2-digit", month: "short" }),
  daysYear: fmt({ day: "2-digit", month: "short", year: "2-digit" }),
};
const tipFmt = {
  hourly: fmt({ weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  daily: fmt({ weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
  weekly: fmt({ day: "2-digit", month: "short", year: "numeric" }),
};

let chart = null;
let seq = 0; // lets us ignore responses from clicks that were superseded

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function tickFormatter(range) {
  if (range === "1d" || range === "7d") return tickFmt.hours;
  if (range === "30d") return tickFmt.days;
  return tickFmt.daysYear;
}

function draw(data, range) {
  const weekly = data.interval === "ONE_WEEK";
  const daily = data.interval === "ONE_DAY";
  const tip = weekly ? tipFmt.weekly : daily ? tipFmt.daily : tipFmt.hourly;
  const tick = tickFormatter(range);

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      labels: data.points.map((p) => tick.format(new Date(p.t))),
      datasets: [{
        data: data.points.map((p) => p.v),
        borderColor: cssVar("--line"),
        backgroundColor: cssVar("--fill"),
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25,
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: {
          min: 0, max: 1,
          title: { display: true, text: "Relative index", color: cssVar("--muted") },
          grid: { color: cssVar("--grid") },
          ticks: { color: cssVar("--muted") },
        },
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8, color: cssVar("--muted") },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const t = tip.format(new Date(data.points[items[0].dataIndex].t));
              return weekly ? `Week of ${t}` : t;
            },
            label: (item) => `Relative traffic: ${item.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
  });
}

async function load(range) {
  const mine = ++seq;
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === range)));
  history.replaceState(null, "", `?range=${range}`);
  statusEl.textContent = "Loading…";

  try {
    const res = await fetch(`/api/traffic?range=${range}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (mine !== seq) return;
    draw(data, range);
    statusEl.textContent = "";
    metaEl.textContent = `Last updated by Radar: ${tipFmt.hourly.format(new Date(data.updated))} (Lisbon time)`;
  } catch (err) {
    if (mine !== seq) return;
    statusEl.textContent = "Could not load data. Please try again later.";
    console.error(err);
  }
}

buttons.forEach((b) => b.addEventListener("click", () => load(b.dataset.range)));

const initial = new URLSearchParams(location.search).get("range");
load(validRanges.includes(initial) ? initial : "7d");