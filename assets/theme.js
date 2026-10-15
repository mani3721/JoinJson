/* Only enumerated preferences cross the persistence boundary. Never pass JSON here. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({theme:'system', method:'join', key:'id', winner:'later', lists:'concat', format:'pretty', caseInsensitive:false});
  const enums = {theme:['system','light','dark'], method:['join','combine','deep'], winner:['later','earlier'], lists:['concat','unique','replace'], format:['pretty','compact']};
  function valid(name, value) {
    if (!Object.prototype.hasOwnProperty.call(defaults, name)) return false;
    if (name === 'key') return typeof value === 'string' && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(value) && value.length <= 120;
    if (name === 'caseInsensitive') return typeof value === 'boolean';
    return enums[name].includes(value);
  }
  function createStore(provider) {
    const prefix = 'jm:v1:';
    return {
      read(name) {
        if (!Object.prototype.hasOwnProperty.call(defaults, name)) return undefined;
        try { const value = JSON.parse(provider().getItem(prefix + name)); return valid(name,value) ? value : defaults[name]; }
        catch (_) { return defaults[name]; }
      },
      write(name,value) {
        if (!valid(name,value)) return false;
        try { provider().setItem(prefix + name, JSON.stringify(value)); return true; } catch (_) { return false; }
      },
      reset() {
        let success = true;
        Object.keys(defaults).forEach(name => { try { provider().removeItem(prefix + name); } catch (_) { success = false; } });
        return success;
      }
    };
  }
  const api = {createStore,valid,defaults};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  const store = createStore(() => root.localStorage);
  root.JMPreferences = store;
  const theme = document.getElementById('theme');
  const reset = document.getElementById('reset-settings');
  const note = document.getElementById('preference-status') || document.createElement('p');
  if (!note.isConnected) {
    note.id = 'preference-status';
    note.className = 'layout-status';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    document.body.append(note);
  }
  const toggle = document.getElementById('theme-toggle');
  const systemTheme = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  const announce = message => { if (note) note.textContent = message; };
  function isDark() {
    const value = document.documentElement.dataset.theme;
    return value === 'dark' || (value === 'system' && !!systemTheme?.matches);
  }
  function updateToggle() {
    if (!toggle) return;
    const dark = isDark();
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', 'Dark mode');
    toggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    toggle.querySelector('.theme-toggle-label').textContent = dark ? 'Light' : 'Dark';
  }
  function applyTheme(value) {
    document.documentElement.dataset.theme = value;
    if (theme) theme.value = value;
    updateToggle();
  }
  if (systemTheme?.addEventListener) systemTheme.addEventListener('change', updateToggle);
  if (toggle) toggle.addEventListener('click', () => {
    const value = isDark() ? 'light' : 'dark';
    applyTheme(value);
    announce(store.write('theme', value) ? 'Theme saved on this device.' : 'Theme changed for this page; storage is unavailable.');
  });
  applyTheme(store.read('theme'));
  if (theme) theme.addEventListener('change', () => { applyTheme(theme.value); announce(store.write('theme',theme.value) ? 'Theme saved on this device.' : 'Theme changed for this page; storage is unavailable.'); });
  const fields = {method:'method',key:'key',winner:'winner',lists:'lists',format:'format',caseInsensitive:'case-insensitive'};
  function restore() {
    Object.entries(fields).forEach(([name,id]) => {
      const field = document.getElementById(id); if (!field) return;
      if (name === 'caseInsensitive') field.checked = store.read(name); else field.value = store.read(name);
    });
  }
  restore();
  Object.entries(fields).forEach(([name,id]) => {
    const field = document.getElementById(id); if (!field) return;
    field.addEventListener('change', () => {
      const value = name === 'caseInsensitive' ? field.checked : field.value;
      note.textContent = store.write(name,value) ? 'Non-sensitive setting saved. JSON is never stored.' : 'Setting works for this page but was not saved (invalid preference or unavailable storage).';
    });
  });
  if (reset) reset.addEventListener('click', () => {
    const success = store.reset(); applyTheme('system'); restore();
    // Force defaults for this page even if removals were denied.
    Object.entries(fields).forEach(([name,id]) => { const field=document.getElementById(id); if (field) { if(name==='caseInsensitive') field.checked=defaults[name]; else field.value=defaults[name]; } });
    note.textContent = success ? 'Saved preferences reset. Your current JSON has not been changed.' : 'Page preferences reset. Browser blocked removal of saved preferences.';
    document.dispatchEvent(new Event('jm:preferences-reset'));
  });
  document.querySelectorAll('.article pre').forEach((pre,index) => {
    const code = pre.querySelector('code'); if (!code) return;
    const button=document.createElement('button'); button.type='button'; button.className='code-copy'; button.textContent='Copy code'; button.setAttribute('aria-label','Copy code example '+(index+1));
    button.addEventListener('click',async () => { try { await navigator.clipboard.writeText(code.textContent); note.textContent='Code example copied.'; } catch (_) { note.textContent='Clipboard blocked. Select the code and copy it manually.'; } });
    pre.before(button);
  });
}(typeof window === 'undefined' ? globalThis : window));
