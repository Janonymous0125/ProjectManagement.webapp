/* Stark PM — loader (no build step)
   App logic is split into ordered runtime scripts under ./js/
   so each domain stays easier to maintain.
*/
(function(){
  const scriptOrder = [
    './js/core/base.js',
    './js/core/navigation.js',
    './js/features/dropdown-menu.js',
    './js/features/topbar.js',
    './js/features/dashboard.js',
    './js/features/projects.js',
    './js/features/milestones.js',
    './js/features/checklist.js',
    './js/features/import.js',
    './js/core/render.js',
    './js/core/radar.js',
    './js/features/export.js',
    './js/bootstrap.js',
    './js/phases/phase3-5.js',
    './js/phases/phase6.js',
    './js/phases/phase7.js',
    './js/phases/phase8.js',
    './js/phases/phase9.js',
    './js/phases/phase10.js',
    './js/phases/phase11.js',
    './js/phases/phase12.js',
    './js/phases/phase14.js',
    './js/phases/phase15.js',
    './js/phases/phase16.js',
    './js/phases/phase16-ui-cleanup.js',
    './js/phases/phase17.js',
    './js/phases/phase18.js',
    './js/phases/phase19.js',
    './js/phases/phase20.js',
  ];

  const currentScript = document.currentScript;
  const baseUrl = currentScript ? currentScript.src : window.location.href;

  function loadOrdered(index){
    if(index >= scriptOrder.length) return;
    const script = document.createElement('script');
    script.src = new URL(scriptOrder[index], baseUrl).href;
    script.async = false;
    script.onload = function(){ loadOrdered(index + 1); };
    script.onerror = function(){
      console.error('Failed to load Stark PM module:', scriptOrder[index]);
      const bootLog = document.querySelector('#bootLog');
      if(bootLog){
        const line = document.createElement('div');
        line.className = 'boot-log__line';
        line.textContent = 'Module load failed: ' + scriptOrder[index];
        bootLog.appendChild(line);
      }
    };
    document.body.appendChild(script);
  }

  loadOrdered(0);
})();
