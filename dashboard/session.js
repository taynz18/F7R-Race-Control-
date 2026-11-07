(() => {
  const preferenceKey = 'f7r-remember-session';
  const memory = new Map();
  const safely = (action, fallback) => {
    try { return action(); } catch { return fallback; }
  };
  let remember = safely(() => sessionStorage.getItem(preferenceKey) !== 'no', true);
  const store = () => remember ? localStorage : sessionStorage;
  const storage = {
    getItem(key) { return safely(() => store().getItem(key), memory.get(key) ?? null); },
    setItem(key, value) {
      safely(() => store().setItem(key, value));
      memory.set(key, value);
    },
    removeItem(key) {
      safely(() => store().removeItem(key));
      memory.delete(key);
    }
  };
  window.F7RAuth = {
    options: () => ({persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage}),
    bindPreference() {
      const field = document.getElementById('remember-sign-in');
      if (field) field.checked = remember;
    },
    choosePreference() {
      const field = document.getElementById('remember-sign-in');
      if (!field) return;
      remember = field.checked;
      safely(() => sessionStorage.setItem(preferenceKey, remember ? 'yes' : 'no'));
    }
  };
})();
