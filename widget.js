(function () {
  if (document.getElementById("pulse-speed-widget")) return;

  const endpoint = "https://speed.cloudflare.com";
  const widget = document.createElement("aside");
  widget.id = "pulse-speed-widget";
  widget.innerHTML = `
    <div class="pulse-head">
      <span class="pulse-title" id="pulse-title">Pulse Speed</span>
      <div class="pulse-actions">
        <button class="pulse-icon pulse-theme" id="pulse-theme" title="Toggle theme">◐</button>
        <button class="pulse-icon pulse-collapse" id="pulse-collapse" title="Minimize">−</button>
      </div>
    </div>
    <div class="pulse-body">
      <div class="pulse-status" id="pulse-status">Testing connection...</div>
      <div class="pulse-results">
        <div class="pulse-result"><small>DOWNLOAD</small><div class="pulse-value" id="pulse-download">--</div><div class="pulse-unit">Mbps</div></div>
        <div class="pulse-result"><small>UPLOAD</small><div class="pulse-value" id="pulse-upload">--</div><div class="pulse-unit">Mbps</div></div>
        <div class="pulse-result"><small>LATENCY</small><div class="pulse-value" id="pulse-latency">--</div><div class="pulse-unit">ms</div></div>
        <div class="pulse-result"><small>JITTER</small><div class="pulse-value" id="pulse-jitter">--</div><div class="pulse-unit">ms</div></div>
      </div>
      <button class="pulse-refresh" id="pulse-refresh">TEST AGAIN</button>
    </div>`;
  document.documentElement.appendChild(widget);

  const $ = id => widget.querySelector(`#${id}`);
  const mbps = (bytes, seconds) => (bytes * 8 / seconds / 1000000).toFixed(1);
  const setStatus = text => { $("pulse-status").textContent = text; };
  const updateTitle = () => {
    const download = $("pulse-download").textContent;
    const upload = $("pulse-upload").textContent;
    $("pulse-title").textContent = download === "--" && upload === "--" ? "Pulse Speed" : `↓${download} ↑${upload}`;
  };
  const testLatency = async () => {
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const start = performance.now();
      const response = await fetch(`${endpoint}/cdn-cgi/trace?pulse=${Date.now()}-${i}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Latency request failed");
      samples.push(performance.now() - start);
    }
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    const jitter = Math.sqrt(samples.reduce((a, b) => a + (b - average) ** 2, 0) / samples.length);
    return { latency: average.toFixed(0), jitter: jitter.toFixed(1) };
  };
  const testDownload = async () => {
    const start = performance.now();
    const response = await fetch(`${endpoint}/__down?bytes=${8 * 1024 * 1024}&pulse=${Date.now()}`);
    if (!response.ok) throw new Error("Download request failed");
    const data = await response.arrayBuffer();
    return mbps(data.byteLength, (performance.now() - start) / 1000);
  };
  const testUpload = async () => {
    const bytes = 2 * 1024 * 1024;
    const start = performance.now();
    const response = await fetch(`${endpoint}/__up?pulse=${Date.now()}`, { method: "POST", body: new Uint8Array(bytes) });
    if (!response.ok) throw new Error("Upload request failed");
    return mbps(bytes, (performance.now() - start) / 1000);
  };
  async function runTest() {
    if (runTest.running) return;
    runTest.running = true;
    $("pulse-refresh").disabled = true;
    setStatus("Testing latency...");
    try {
      const ping = await testLatency();
      $("pulse-latency").textContent = ping.latency;
      $("pulse-jitter").textContent = ping.jitter;
      updateTitle();
      setStatus("Testing download + upload...");
      const [download, upload] = await Promise.all([testDownload(), testUpload()]);
      $("pulse-download").textContent = download;
      $("pulse-upload").textContent = upload;
      updateTitle();
      setStatus(`Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setStatus(`Test failed: ${error.message}`);
    } finally {
      runTest.running = false;
      $("pulse-refresh").disabled = false;
    }
  }
  $("pulse-refresh").addEventListener("click", runTest);
  $("pulse-collapse").addEventListener("click", () => {
    widget.classList.remove("pulse-expanded");
    widget.classList.add("pulse-collapsed");
  });
  widget.addEventListener("click", event => {
    if (moved) {
      moved = false;
      return;
    }
    if (widget.classList.contains("pulse-expanded") || event.target.closest("button")) return;
    widget.classList.add("pulse-expanded");
  });
  $("pulse-theme").addEventListener("click", () => {
    const light = widget.dataset.theme !== "light";
    widget.dataset.theme = light ? "light" : "dark";
    widget.style.color = light ? "#152238" : "#eef5ff";
    widget.style.background = light ? "#ffffff" : "#101d31";
  });
  let drag = null;
  let moved = false;
  widget.addEventListener("pointerdown", event => {
    if (widget.classList.contains("pulse-expanded") || event.target.closest("button")) return;
    const rect = widget.getBoundingClientRect();
    drag = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    moved = false;
    widget.classList.add("pulse-dragging");
    widget.setPointerCapture(event.pointerId);
  });
  widget.addEventListener("pointermove", event => {
    if (!drag) return;
    moved = true;
    const left = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, event.clientX - drag.offsetX));
    const top = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, event.clientY - drag.offsetY));
    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;
    widget.style.right = "auto";
  });
  widget.addEventListener("pointerup", () => {
    drag = null;
    widget.classList.remove("pulse-dragging");
  });
  async function runContinuously() {
    while (document.documentElement.contains(widget)) {
      await runTest();
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  runContinuously();
})();
