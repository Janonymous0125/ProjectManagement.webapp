/* ---------------------------
   Radar animation (ambient)
---------------------------- */
// NOTE: boot() runs before the file finishes executing. Using `var` avoids
// a temporal-dead-zone crash when initRadar() references radarTimer early.
var radarTimer = null;

function initRadar(){
  const radarSweep = $("#radarSweep");
  const radarBlips = $("#radarBlips");

  // Radar UI is optional now (dashboard keeps counters only).
  if(!radarSweep || !radarBlips){
    if(radarTimer){
      clearInterval(radarTimer);
      radarTimer = null;
    }
    return;
  }

  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: radarSweep,
      rotate: [0, 360],
      duration: 2400,
      easing: "linear",
      loop: true,
    });
  });

  // create a few blips (positions updated later)
  radarBlips.innerHTML = "";
  for(let i=0;i<8;i++){
    const b = document.createElement("div");
    b.className = "blip";
    b.style.left = `${10 + Math.random()*80}%`;
    b.style.top = `${10 + Math.random()*80}%`;
    radarBlips.appendChild(b);
  }

  if(radarTimer) clearInterval(radarTimer);
  radarTimer = setInterval(() => {
    const blips = $$("#radarBlips .blip");
    safeAnime(() => {
      const { animate } = anime;
      const pick = blips[Math.floor(Math.random() * blips.length)];
      if(!pick) return;
      animate({
        targets: pick,
        opacity: [0, 1, 0],
        scale: [1, 1.8, 1],
        duration: 900,
        easing: "easeOutQuad"
      });
    });
  }, 520);
}

function refreshRadarBlips(counts){
  const blips = $$("#radarBlips .blip");
  if(!blips.length) return;
  // reposition lightly based on totals for "alive" feel
  const energy = Math.min(1, (counts.tasks + counts.milestones + counts.projects) / 60);
  blips.forEach((b, i) => {
    const base = 10 + (i * 9) % 80;
    const jitter = (Math.random()*10 - 5) * (0.3 + energy);
    b.style.left = `${clamp(base + jitter, 6, 94)}%`;
    b.style.top = `${clamp(18 + (i*11)%70 + jitter, 6, 94)}%`;
  });
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function animateNumber(el, next){
  const cur = Number(el.textContent || "0");
  if(cur === next) return;
  safeAnime(() => {
    const { animate } = anime;
    const obj = { v: cur };
    animate({
      targets: obj,
      v: next,
      duration: 380,
      easing: "easeOutQuad",
      update: () => { el.textContent = String(Math.round(obj.v)); }
    });
  });
  if(!window.anime) el.textContent = String(next);
}


