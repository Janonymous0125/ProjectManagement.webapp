/* ---------------------------
   Tabs + animation
---------------------------- */
function wireTabs(){
  ui.tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tabName){
  const token = ++tabSwitchToken;

  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const main = document.querySelector(".main");
  const wipe = document.querySelector("#tabWipe");

  const currentPanel = document.querySelector(".tab.is-active");
  const currentName = currentPanel ? currentPanel.dataset.tab : null;
  if(currentName === tabName) return;

  const nextPanel = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if(!nextPanel) return;

  // Determine direction from the live nav order so injected workspace tabs animate consistently.
  const order = Array.from(document.querySelectorAll('.nav__item'))
    .map(btn => btn && btn.dataset ? String(btn.dataset.tab || '') : '')
    .filter(Boolean);
  const currentIndex = Math.max(0, order.indexOf(String(currentName || '')));
  const nextIndex = Math.max(0, order.indexOf(String(tabName || '')));
  const dir = (nextIndex >= currentIndex) ? "forward" : "back";

  // Update nav state immediately.
  ui.tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === tabName));

  if(main){
    main.dataset.dir = dir;
  }

  // Reduced motion: instant swap.
  if(reduceMotion){
    ui.tabPanels.forEach(p => {
      const active = p.dataset.tab === tabName;
      p.classList.toggle("is-active", active);
      p.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
      p.setAttribute("aria-hidden", active ? "false" : "true");
      p.style.opacity = "";
      p.style.transform = "";
      p.style.filter = "";
    });
    if(main) main.classList.remove("is-switching");
    return;
  }

  // Clear inline styles + cancel WAAPI animations that could keep panels stuck.
  [currentPanel, nextPanel].forEach(el => {
    if(!el) return;
    el.style.opacity = "";
    el.style.transform = "";
    el.style.filter = "";
    try{ if(el.getAnimations) el.getAnimations().forEach(a => a.cancel()); }catch{ /* ignore */ }
  });

  // Trigger wipe sweep (restart animation each time).
  if(main && wipe){
    main.classList.remove("is-switching");
    void wipe.offsetWidth; // force reflow so animation restarts
    main.classList.add("is-switching");
    setTimeout(() => {
      if(token !== tabSwitchToken) return;
      main.classList.remove("is-switching");
    }, 1120);
  }

  // EXIT: keep .is-active on the current panel while applying slide-out,
  // so it animates from visible -> hidden instead of disappearing instantly.
  if(currentPanel){
    currentPanel.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
    currentPanel.classList.add(dir === "forward" ? "slide-out-left" : "slide-out-right");
    currentPanel.setAttribute("aria-hidden", "true");
    // Keep pointer events off during the exit.
    currentPanel.style.pointerEvents = "none";
  }

  // ENTER: set a true "from" state (slide-in-*) then remove it next frame to animate to .is-active baseline.
  nextPanel.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
  nextPanel.classList.add("is-active", dir === "forward" ? "slide-in-right" : "slide-in-left");
  nextPanel.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    requestAnimationFrame(() => {
      if(token !== tabSwitchToken) return;
      nextPanel.classList.remove("slide-in-left","slide-in-right");
      animateTabItems_(nextPanel, dir, token);
    });
  }, 140);

  // Cleanup: after transition, fully deactivate the previous panel and clear helper classes.
  if(currentPanel){
    setTimeout(() => {
      if(token !== tabSwitchToken) return;
      currentPanel.classList.remove("slide-out-left","slide-out-right");
      currentPanel.classList.remove("is-active");
      currentPanel.style.pointerEvents = "";
      currentPanel.style.opacity = "";
      currentPanel.style.transform = "";
      currentPanel.style.filter = "";
    }, 980);
  }
}








/* ---------------------------
   HUD item entrance (tab content)
---------------------------- */
function animateTabItems_(panel, dir, token){
  if(!panel) return;

  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if(reduceMotion) return;

  const tab = panel.dataset.tab || "";
  if(!(tab === "dashboard" || tab === "projects" || tab === "milestones" || tab === "checklist")) return;

  /** @type {HTMLElement[]} */
  let targets = [];

  if(tab === "dashboard"){
    targets = Array.from(panel.querySelectorAll("#dashMilestoneList .item, #dashActivityList .item, #hotlist .hot"));
  }else if(tab === "projects"){
    targets = Array.from(panel.querySelectorAll("#projectList .item"));
  }else if(tab === "milestones"){
    targets = Array.from(panel.querySelectorAll("#milestoneList .item"));
  }else if(tab === "checklist"){
    targets = Array.from(panel.querySelectorAll("#taskList .task"));
  }

  // Keep it snappy on very large lists.
  const MAX = 28;
  targets = targets.slice(0, MAX);

  if(!targets.length) return;

  const fromX = (dir === "forward") ? 40 : -40;

  // Prep initial state (avoid leaving inline transforms behind by clearing on complete).
  for(const el of targets){
    el.style.willChange = "transform, opacity";
    el.style.opacity = "0";
    el.style.transform = `translateX(${fromX}px) translateY(10px) translateZ(-18px) scale(0.985)`;
  }

  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets,
      opacity: [0, 1],
      translateX: [fromX, 0],
      translateY: [10, 0],
      translateZ: [-18, 0],
      scale: [0.985, 1],
      delay: (_, i) => 80 + (34 * i),
      duration: 780,
      easing: "easeOutQuad",
      complete: () => {
        if(token !== tabSwitchToken) return;
        for(const el of targets){
          el.style.willChange = "";
          el.style.opacity = "";
          el.style.transform = "";
        }
      },
    });
  });
}

