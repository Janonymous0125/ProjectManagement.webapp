/* ---------------------------
   Shared Dropdown Menu
   Reusable dropdown shell for topbar and future action menus.
---------------------------- */
(function(global){
  const registry = new Set();
  let seq = 0;
  let globalsBound = false;

  function tokenList_(value){
    return String(value || '')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function applyClassList_(el, classes){
    tokenList_(classes).forEach((name) => el.classList.add(name));
  }

  function bindGlobals_(){
    if(globalsBound) return;
    globalsBound = true;

    document.addEventListener('click', (ev) => {
      registry.forEach((inst) => {
        if(!inst || !inst.isOpen()) return;
        if(inst.root.contains(ev.target)) return;
        inst.close();
      });
    });

    document.addEventListener('keydown', (ev) => {
      if(ev.key !== 'Escape') return;
      registry.forEach((inst) => {
        if(!inst || !inst.isOpen()) return;
        inst.close({ restoreFocus:true });
      });
    });
  }

  function getFocusableItems_(inst){
    if(!inst || !inst.panel) return [];
    return Array.from(inst.panel.querySelectorAll('.pm-dropdown__item,[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]'))
      .filter((el) => !!el && !el.disabled && !el.hidden && el.getAttribute('aria-hidden') !== 'true');
  }

  function focusItem_(inst, index){
    const items = getFocusableItems_(inst);
    if(!items.length) return;
    const nextIndex = Math.max(0, Math.min(index, items.length - 1));
    const target = items[nextIndex];
    if(target && typeof target.focus === 'function') target.focus();
  }

  function buildItem_(opts){
    const item = document.createElement(opts && opts.tagName ? opts.tagName : 'button');
    if(item.tagName === 'BUTTON') item.type = 'button';
    item.className = 'btn btn--ghost pm-dropdown__item';
    applyClassList_(item, opts && opts.className);
    item.setAttribute('role', (opts && opts.role) || 'menuitem');
    if(opts && opts.text != null) item.textContent = String(opts.text);
    if(opts && opts.title != null) item.title = String(opts.title);
    if(opts && opts.disabled) item.disabled = true;
    if(opts && opts.danger){
      item.classList.add('btn--danger', 'is-danger');
      item.classList.remove('btn--ghost');
    }
    if(opts && typeof opts.onClick === 'function') item.addEventListener('click', opts.onClick);
    return item;
  }

  function createDropdown_(opts){
    bindGlobals_();

    const mount = (opts && opts.mount) || document.body;
    const root = document.createElement('div');
    root.className = 'pm-dropdown';
    applyClassList_(root, opts && opts.rootClassName);
    if(opts && opts.align === 'left') root.classList.add('pm-dropdown--align-left');
    if(opts && opts.align === 'stretch') root.classList.add('pm-dropdown--align-stretch');

    if(opts && opts.dataset && typeof opts.dataset === 'object'){
      Object.entries(opts.dataset).forEach(([key, value]) => {
        if(value == null) return;
        root.dataset[key] = String(value);
      });
    }

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn btn--ghost pm-dropdown__trigger';
    applyClassList_(trigger, opts && opts.triggerClassName);
    trigger.textContent = String((opts && opts.triggerLabel) || 'Menu');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    const panel = document.createElement('div');
    panel.className = 'pm-dropdown__panel';
    applyClassList_(panel, opts && opts.panelClassName);
    panel.setAttribute('role', 'menu');

    seq += 1;
    const panelId = (opts && opts.panelId) || `pmDropdownPanel_${seq}`;
    panel.id = panelId;
    trigger.setAttribute('aria-controls', panelId);

    if(opts && opts.panelMinWidth != null){
      panel.style.minWidth = typeof opts.panelMinWidth === 'number' ? `${opts.panelMinWidth}px` : String(opts.panelMinWidth);
    }

    root.appendChild(trigger);
    root.appendChild(panel);

    const anchor = opts && opts.anchor && opts.anchor.parentElement === mount ? opts.anchor : null;
    if(anchor) mount.insertBefore(root, anchor);
    else mount.appendChild(root);

    const inst = {
      root,
      trigger,
      panel,
      isOpen: () => root.classList.contains('is-open'),
      open(options){
        if(inst.isOpen()) return;
        if(typeof global.pmDropdownCloseAll_ === 'function') global.pmDropdownCloseAll_(inst);
        root.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        if(options && options.focus === 'last') inst.focusLast();
        else if(options && options.focus) inst.focusFirst();
      },
      close(options){
        if(!inst.isOpen()) return;
        root.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if(options && options.restoreFocus && typeof trigger.focus === 'function') trigger.focus();
      },
      toggle(options){
        if(inst.isOpen()) inst.close(options);
        else inst.open(options);
      },
      focusFirst(){ focusItem_(inst, 0); },
      focusLast(){ const items = getFocusableItems_(inst); if(items.length) focusItem_(inst, items.length - 1); },
      getItems(){ return getFocusableItems_(inst); },
      ensureSection(key, label, className){
        let sec = panel.querySelector(`.pm-dropdown__section[data-section-key="${key}"]`);
        if(!sec){
          sec = document.createElement('div');
          sec.className = 'pm-dropdown__section';
          applyClassList_(sec, className);
          sec.dataset.sectionKey = key;
          panel.appendChild(sec);
        }
        if(label != null) sec.textContent = String(label);
        return sec;
      },
      createItem(itemOpts){
        return buildItem_(itemOpts || {});
      },
      destroy(){
        inst.close();
        registry.delete(inst);
        try{ root.remove(); }catch{}
      }
    };

    trigger.addEventListener('click', (ev) => {
      ev.stopPropagation();
      inst.toggle();
    });

    trigger.addEventListener('keydown', (ev) => {
      if(ev.key === 'ArrowDown'){
        ev.preventDefault();
        inst.open({ focus:true });
      }else if(ev.key === 'ArrowUp'){
        ev.preventDefault();
        inst.open({ focus:'last' });
      }else if(ev.key === 'Enter' || ev.key === ' '){
        ev.preventDefault();
        inst.toggle({ focus:true });
      }
    });

    panel.addEventListener('keydown', (ev) => {
      const items = getFocusableItems_(inst);
      if(!items.length) return;
      const currentIndex = items.indexOf(document.activeElement);
      if(ev.key === 'ArrowDown'){
        ev.preventDefault();
        focusItem_(inst, currentIndex < 0 ? 0 : currentIndex + 1);
      }else if(ev.key === 'ArrowUp'){
        ev.preventDefault();
        focusItem_(inst, currentIndex < 0 ? items.length - 1 : currentIndex - 1);
      }else if(ev.key === 'Home'){
        ev.preventDefault();
        inst.focusFirst();
      }else if(ev.key === 'End'){
        ev.preventDefault();
        inst.focusLast();
      }else if(ev.key === 'Tab'){
        inst.close();
      }
    });

    panel.addEventListener('click', (ev) => {
      const target = ev.target instanceof Element ? ev.target.closest('.pm-dropdown__item,[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]') : null;
      if(target && !target.disabled){
        inst.close();
      }
    });

    root._pmDropdownInstance = inst;
    registry.add(inst);
    return inst;
  }

  global.pmDropdownCreate_ = createDropdown_;
  global.pmDropdownCloseAll_ = function(exceptInst){
    registry.forEach((inst) => {
      if(!inst || inst === exceptInst) return;
      inst.close();
    });
  };
})(window);
