/* Disclosure navigation: links remain in HTML and retain native navigation. */
(function () {
  'use strict';
  const header = document.querySelector('.join-header');
  if (!header) return;
  const shell = document.getElementById('site-navigation');
  const menuButton = document.getElementById('site-menu-toggle');
  const closeButton = document.getElementById('site-menu-close');
  const mobile = matchMedia('(max-width: 859px)');
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  const triggers = [...header.querySelectorAll('.disclosure-trigger')].filter(button => !button.hidden);
  let active, sheet = false, previousOverflow, scrollY, background = [];
  const timers = new Map();
  const panelFor = button => document.getElementById(button.getAttribute('aria-controls'));
  function cancel(button) { clearTimeout(timers.get(button)); timers.delete(button); }
  function close(restore = false) {
    triggers.forEach(cancel);
    if (!active) return;
    const button = active;
    button.setAttribute('aria-expanded', 'false');
    panelFor(button).hidden = true;
    active = null;
    if (restore) button.focus();
  }
  function position(button) {
    if (mobile.matches) return;
    const panel = panelFor(button);
    panel.style.setProperty('--panel-shift', '0px');
    const rect = panel.getBoundingClientRect();
    const shift = Math.max(16 - rect.left, Math.min(0, innerWidth - 16 - rect.right));
    panel.style.setProperty('--panel-shift', shift + 'px');
  }
  function open(button) {
    close();
    active = button;
    button.setAttribute('aria-expanded', 'true');
    panelFor(button).hidden = false;
    position(button);
  }
  triggers.forEach(button => {
    const disclosure = button.parentElement;
    button.addEventListener('click', () => active === button ? close() : open(button));
    disclosure.addEventListener('pointerenter', () => {
      cancel(button);
      if (hover.matches && !mobile.matches && active !== button) timers.set(button, setTimeout(() => open(button), 120));
    });
    disclosure.addEventListener('pointerleave', () => {
      cancel(button);
      if (hover.matches && !mobile.matches) timers.set(button, setTimeout(() => {
        if (active === button && !disclosure.contains(document.activeElement)) close();
      }, 200));
    });
    disclosure.addEventListener('focusout', () => queueMicrotask(() => {
      if (active === button && !disclosure.contains(document.activeElement)) close();
    }));
  });
  function setSheet(value, restore = true) {
    if (sheet === value) return;
    close();
    sheet = value;
    header.classList.toggle('sheet-open', value);
    menuButton.setAttribute('aria-expanded', String(value));
    if (value) {
      previousOverflow = document.body.style.overflow;
      scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      // Inert every branch outside the sheet, including the wordmark and Menu button.
      for (let node = shell; node !== document.body; node = node.parentElement) {
        [...node.parentElement.children].filter(sibling => sibling !== node && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)).forEach(element => {
          background.push([element, element.inert]); element.inert = true;
        });
      }
      shell.setAttribute('role', 'dialog');
      shell.setAttribute('aria-modal', 'true');
      shell.setAttribute('aria-labelledby', 'sheet-title');
      closeButton.focus();
    } else {
      background.forEach(([element, inert]) => { element.inert = inert; }); background = [];
      document.body.style.overflow = previousOverflow;
      shell.removeAttribute('role'); shell.removeAttribute('aria-modal'); shell.removeAttribute('aria-labelledby');
      window.scrollTo(0, scrollY);
      if (restore) menuButton.focus();
    }
  }
  menuButton.addEventListener('click', () => setSheet(!sheet));
  closeButton.addEventListener('click', () => setSheet(false));
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) { close(); setSheet(false); }
    if (header.contains(event.target) && event.target.closest('a')) { close(); setSheet(false, false); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (active) { event.preventDefault(); close(true); }
      else if (sheet) { event.preventDefault(); setSheet(false); }
    }
    if (sheet && event.key === 'Tab') {
      const items = [...shell.querySelectorAll('button, a[href]')].filter(el => !el.hidden && !el.closest('[hidden]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function route() {
    const url = new URL(location.href);
    header.querySelectorAll('a[href]').forEach(link => {
      const path = new URL(link.href).pathname.replace(/\/$/, '') || '/';
      const current = url.pathname.replace(/\/$/, '') || '/';
      if (path === current && !link.classList.contains('brand')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    close(); setSheet(false, false);
  }
  ['popstate', 'hashchange'].forEach(name => window.addEventListener(name, route));
  document.addEventListener('jm:tool-change', route);
  mobile.addEventListener('change', () => { close(); setSheet(false, false); });
  window.addEventListener('resize', () => { if (active) position(active); });
  route();
}());
