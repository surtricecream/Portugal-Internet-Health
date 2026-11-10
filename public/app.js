const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");

// Show times in Lisbon's timezone, whatever the viewer's own timezone is
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

async function load() {
  try {
    const res = await fetch("/api/traffic");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    new Chart(document.getElementById("chart"), {
      type: "line",
      data: {
        labels: data.points.map((p) => fmt.format(new Date(p.t))),
        datasets: [{
          label: "Relative traffic",
          data: data.points.map((p) => p.v),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        }],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 1, title: { display: true, text: "Relative index" } },
          x: { ticks: { maxTicksLimit: 8 } },
        },
        plugins: { legend: { display: false } },
      },
    });

    statusEl.textContent = "";
    metaEl.textContent = `Last updated by Radar: ${fmt.format(new Date(data.updated))} (Lisbon time)`;
  } catch (err) {
    statusEl.textContent = "Could not load data. Please try again later.";
    console.error(err);
  }
}

load();