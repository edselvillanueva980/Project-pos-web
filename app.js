// ═══════════════════════════════════════════════════════════════
// POS SYSTEM - Full Web Version (localStorage safe)
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'pos_system_v1';

const UserRole = { ADMIN: 'ADMIN', CASHIER: 'CASHIER' };
const DiscountType = { PERCENT: 'PERCENT', FIXED: 'FIXED', NONE: 'NONE' };

let state = {
  users: [],
  products: [],
  transactions: [],
  auditLog: [],
  discountPresets: [],
  isDarkMode: false,
  currentUser: null,
  screen: 'login',
  cart: [],
  searchQuery: '',
  selectedCategory: 'All',
  selectedStatus: 'All',
  auditGroup: 'All',
  auditActor: ''
};

// ── Helpers ───────────────────────────────────────────────────
const fmtPrice = v => Number(v).toFixed(2);

function fmtDate(d) {
  const date = new Date(d);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function daysUntilExpiry(expirationDate) {
  if (!expirationDate) return null;
  try {
    const exp = new Date(expirationDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((exp - today) / 86400000);
  } catch (e) {
    return null;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Safe Storage (fixes SecurityError on file://) ─────────────
let memoryStore = null;

function canUseLocalStorage() {
  try {
    const test = '__pos_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

const USE_LS = canUseLocalStorage();

function save() {
  const data = {
    users: state.users,
    products: state.products,
    transactions: state.transactions,
    auditLog: state.auditLog,
    discountPresets: state.discountPresets,
    isDarkMode: state.isDarkMode
  };

  if (USE_LS) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage write failed', e);
      memoryStore = data;
    }
  } else {
    memoryStore = data;
  }
}

function load() {
  let data = null;

  if (USE_LS) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      console.warn('localStorage read failed', e);
    }
  }

  if (!data && memoryStore) {
    data = memoryStore;
  }

  if (data) {
    state.users = data.users || [];
    state.products = data.products || [];
    state.transactions = data.transactions || [];
    state.auditLog = data.auditLog || [];
    state.discountPresets = data.discountPresets || [];
    state.isDarkMode = !!data.isDarkMode;
  }

  // Seed default data on first run
  if (state.users.length === 0) {
    state.users = [
      { id: 1, username: 'admin', password: 'admin123', fullName: 'System Admin', email: 'admin@pos.com', role: UserRole.ADMIN },
      { id: 2, username: 'cashier', password: 'cash123', fullName: 'John Cashier', email: 'cashier@pos.com', role: UserRole.CASHIER }
    ];
  }
  if (state.products.length === 0) {
    state.products = [
      { id: '1', sku: 'SKU001', name: 'Whiskas Wet Food', category: 'Cat', price: 55, stock: 13, expirationDate: '2026-04-15' },
      { id: '2', sku: 'SKU002', name: 'Aozi Dog Food', category: 'Dog', price: 55, stock: 32, expirationDate: '2026-04-30' },
      { id: '3', sku: 'SKU003', name: 'Pedigree Dentastix', category: 'Dog', price: 45, stock: 5, expirationDate: '2025-12-20' },
      { id: '4', sku: 'SKU004', name: 'Royal Canin Kitten', category: 'Cat', price: 120, stock: 0, expirationDate: '2026-01-10' },
      { id: '5', sku: 'SKU005', name: 'Whiskas Dry Food', category: 'Cat', price: 75, stock: 8, expirationDate: '2026-05-05' },
      { id: '6', sku: 'SKU006', name: 'Pedigree Adult 3kg', category: 'Dog', price: 210, stock: 20, expirationDate: '2026-06-01' }
    ];
  }
  if (state.discountPresets.length === 0) {
    state.discountPresets = [
      { id: uid(), name: 'Senior Citizen', type: DiscountType.PERCENT, value: 20 },
      { id: uid(), name: 'PWD', type: DiscountType.PERCENT, value: 20 },
      { id: uid(), name: 'Employee', type: DiscountType.PERCENT, value: 10 },
      { id: uid(), name: 'Loyalty', type: DiscountType.FIXED, value: 50 }
    ];
  }

  save();
  applyTheme();
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', state.isDarkMode);
}

// ── Audit ─────────────────────────────────────────────────────
function addAudit(actor, action, resource, resourceId, summary) {
  const nextId = (state.auditLog.reduce((m, e) => Math.max(m, e.id), 0)) + 1;
  state.auditLog.push({
    id: nextId,
    timestamp: new Date().toISOString(),
    actor: actor,
    action: action,
    resource: resource,
    resourceId: resourceId,
    summary: summary
  });
  save();
}

// ── Auth ──────────────────────────────────────────────────────
function authenticate(username, password) {
  return state.users.find(u => u.username === username && u.password === password) || null;
}

// ── Cart helpers ──────────────────────────────────────────────
function cartSubtotal() {
  return state.cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
}

function applyDiscount(subtotal, discount) {
  if (!discount || discount.type === DiscountType.NONE || !discount.value) return 0;
  if (discount.type === DiscountType.PERCENT) return subtotal * (discount.value / 100);
  return Math.min(discount.value, subtotal);
}

// ═══════════════════════════════════════════════════════════════
// RENDER ENGINE
// ═══════════════════════════════════════════════════════════════
const app = document.getElementById('app');

function render() {
  if (!state.currentUser) {
    if (state.screen === 'register') renderRegister();
    else renderLogin();
    return;
  }
  renderShell();
}

function renderLogin() {
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div class="flex justify-center mb-6">
          <div class="w-20 h-20 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-3xl">🛒</div>
        </div>
        <h1 class="text-2xl font-bold text-center mb-1">Welcome Back</h1>
        <p class="text-center text-gray-500 dark:text-gray-400 mb-8">Sign in to your account</p>
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Username</label>
            <input id="loginUser" type="text" required class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="admin or cashier">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Password</label>
            <input id="loginPass" type="password" required class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          </div>
          <p id="loginError" class="text-red-500 text-sm hidden"></p>
          <button type="submit" class="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">Sign In</button>
        </form>
        <p class="text-center mt-6 text-sm">
          Don't have an account?
          <button id="goRegister" class="text-indigo-600 font-medium hover:underline">Create one</button>
        </p>
        <div class="mt-6 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-xs text-gray-500">
          <p><strong>Demo:</strong> admin / admin123 &nbsp;|&nbsp; cashier / cash123</p>
        </div>
      </div>
    </div>`;

  document.getElementById('loginForm').onsubmit = function(e) {
    e.preventDefault();
    var u = document.getElementById('loginUser').value.trim();
    var p = document.getElementById('loginPass').value;
    var user = authenticate(u, p);
    if (user) {
      state.currentUser = user;
      state.screen = 'dashboard';
      addAudit(user.username, 'user.login', 'user', String(user.id), user.fullName + ' signed in');
      render();
    } else {
      var err = document.getElementById('loginError');
      err.textContent = 'Invalid credentials';
      err.classList.remove('hidden');
    }
  };
  document.getElementById('goRegister').onclick = function() {
    state.screen = 'register';
    render();
  };
}

function renderRegister() {
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <h1 class="text-2xl font-bold text-center mb-1">Create Account</h1>
        <p class="text-center text-gray-500 dark:text-gray-400 mb-8">Enter your details to register</p>
        <form id="regForm" class="space-y-3">
          <input id="regFull" type="text" required placeholder="Full Name" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          <input id="regEmail" type="email" required placeholder="Email" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          <input id="regUser" type="text" required placeholder="Username" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          <input id="regPass" type="password" required placeholder="Password (min 6)" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          <input id="regConfirm" type="password" required placeholder="Confirm Password" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
          <p id="regError" class="text-red-500 text-sm hidden"></p>
          <button type="submit" class="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">Register</button>
        </form>
        <p class="text-center mt-6 text-sm">
          Already have an account?
          <button id="goLogin" class="text-indigo-600 font-medium hover:underline">Sign in</button>
        </p>
      </div>
    </div>`;

  document.getElementById('regForm').onsubmit = function(e) {
    e.preventDefault();
    var fullName = document.getElementById('regFull').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var username = document.getElementById('regUser').value.trim();
    var password = document.getElementById('regPass').value;
    var confirm = document.getElementById('regConfirm').value;
    var err = document.getElementById('regError');

    if (password !== confirm) {
      err.textContent = 'Passwords do not match';
      err.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      err.textContent = 'Password must be at least 6 characters';
      err.classList.remove('hidden');
      return;
    }
    if (state.users.some(function(u) { return u.username === username; })) {
      err.textContent = 'Username already taken';
      err.classList.remove('hidden');
      return;
    }

    var newId = (state.users.reduce(function(m, u) { return Math.max(m, u.id); }, 0)) + 1;
    var newUser = { id: newId, username: username, password: password, fullName: fullName, email: email, role: UserRole.CASHIER };
    state.users.push(newUser);
    addAudit(username, 'user.registered', 'user', String(newId), fullName + ' self-registered as CASHIER');
    save();
    state.screen = 'login';
    render();
  };
  document.getElementById('goLogin').onclick = function() {
    state.screen = 'login';
    render();
  };
}

// ── Main Shell ────────────────────────────────────────────────
function renderShell() {
  var isAdmin = state.currentUser.role === UserRole.ADMIN;
  var navItems = [
    { id: 'dashboard', label: 'Home', icon: '🏠' },
    { id: 'pos', label: 'POS', icon: '🛒' }
  ];
  if (isAdmin) {
    navItems.push(
      { id: 'inventory', label: 'Stock', icon: '📦' },
      { id: 'discounts', label: 'Deals', icon: '🏷️' },
      { id: 'reports', label: 'Reports', icon: '📊' },
      { id: 'audit', label: 'Logs', icon: '📋' },
      { id: 'users', label: 'Users', icon: '👥' }
    );
  }

  var navHtml = navItems.map(function(n) {
    var active = state.screen === n.id ? 'text-indigo-600 font-semibold' : 'text-gray-500';
    return '<button data-nav="' + n.id + '" class="flex flex-col items-center justify-center gap-0.5 min-w-[56px] px-2 py-1.5 rounded-xl text-[11px] ' + active + '">' +
      '<span class="text-lg leading-none">' + n.icon + '</span><span class="leading-tight">' + n.label + '</span></button>';
  }).join('');

  app.innerHTML = `
    <div class="flex flex-col h-screen">
      <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">P</div>
          <div>
            <div class="font-bold text-sm">POS System</div>
            <div class="text-xs text-gray-500">${state.currentUser.fullName} · ${state.currentUser.role}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="themeBtn" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-lg">${state.isDarkMode ? '☀️' : '🌙'}</button>
          <button id="logoutBtn" class="px-3 py-1.5 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-sm font-medium">Logout</button>
        </div>
      </header>
      <main id="mainContent" class="flex-1 overflow-auto p-4 pb-28"></main>
      <nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20">
        <div class="flex justify-start overflow-x-auto no-scrollbar px-1 py-2 gap-0.5" style="-webkit-overflow-scrolling: touch;">
          ${navHtml}
        </div>
      </nav>
    </div>`;

  document.getElementById('themeBtn').onclick = function() {
    state.isDarkMode = !state.isDarkMode;
    applyTheme();
    save();
    render();
  };
  document.getElementById('logoutBtn').onclick = function() {
    addAudit(state.currentUser.username, 'user.logout', 'user', String(state.currentUser.id), state.currentUser.fullName + ' signed out');
    state.currentUser = null;
    state.screen = 'login';
    state.cart = [];
    render();
  };
  document.querySelectorAll('[data-nav]').forEach(function(btn) {
    btn.onclick = function() {
      state.screen = btn.dataset.nav;
      render();
    };
  });

  var main = document.getElementById('mainContent');
  if (state.screen === 'dashboard') renderDashboard(main);
  else if (state.screen === 'pos') renderPOS(main);
  else if (state.screen === 'inventory') isAdmin ? renderInventory(main) : accessDenied(main);
  else if (state.screen === 'discounts') isAdmin ? renderDiscounts(main) : accessDenied(main);
  else if (state.screen === 'users') isAdmin ? renderUsers(main) : accessDenied(main);
  else if (state.screen === 'audit') isAdmin ? renderAudit(main) : accessDenied(main);
  else if (state.screen === 'reports') isAdmin ? renderReports(main) : accessDenied(main);
  else renderDashboard(main);
}

function accessDenied(el) {
  el.innerHTML = '<div class="flex flex-col items-center justify-center h-64 text-center"><div class="text-5xl mb-4">🔒</div><h2 class="text-xl font-bold text-red-500">Access Denied</h2><p class="text-gray-500">You don\'t have permission to view this page.</p></div>';
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard(el) {
  var isAdmin = state.currentUser.role === UserRole.ADMIN;
  var relevantTx = isAdmin ? state.transactions : state.transactions.filter(function(t) { return t.cashier === state.currentUser.username; });
  var totalRevenue = relevantTx.reduce(function(s, t) { return s + t.total; }, 0);
  var txCount = relevantTx.length;
  var lowStock = state.products.filter(function(p) { return p.stock >= 1 && p.stock <= 10; }).length;
  var outOfStock = state.products.filter(function(p) { return p.stock === 0; }).length;

  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    var next = new Date(d);
    next.setDate(next.getDate() + 1);
    var total = relevantTx.filter(function(t) {
      var ts = new Date(t.timestamp);
      return ts >= d && ts < next;
    }).reduce(function(s, t) { return s + t.total; }, 0);
    days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), total: total });
  }
  var maxVal = Math.max.apply(null, days.map(function(d) { return d.total; }).concat([1]));

  var chartBars = days.map(function(d) {
    var h = (d.total / maxVal) * 100;
    return '<div class="flex-1 flex flex-col items-center gap-1">' +
      '<div class="w-full bg-indigo-200 dark:bg-indigo-900/40 rounded-t relative" style="height:' + h + '%">' +
      '<div class="absolute inset-x-0 bottom-0 bg-indigo-600 rounded-t" style="height:100%"></div></div>' +
      '<span class="text-[10px] text-gray-500">' + d.label + '</span>' +
      '<span class="text-[10px] font-medium">' + (d.total > 0 ? '₱' + fmtPrice(d.total) : '-') + '</span></div>';
  }).join('');

  el.innerHTML = `
    <div class="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <p class="text-gray-500">Welcome, ${state.currentUser.fullName}</p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">${isAdmin ? 'Revenue' : 'My Revenue'}</div>
          <div class="text-xl font-bold text-indigo-600">₱${fmtPrice(totalRevenue)}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">${isAdmin ? 'Orders' : 'My Orders'}</div>
          <div class="text-xl font-bold">${txCount}</div>
        </div>
        ${isAdmin ? `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">Low Stock</div>
          <div class="text-xl font-bold ${lowStock > 0 ? 'text-amber-500' : ''}">${lowStock}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500 mb-1">Out of Stock</div>
          <div class="text-xl font-bold ${outOfStock > 0 ? 'text-red-500' : ''}">${outOfStock}</div>
        </div>` : ''}
      </div>
      ${isAdmin ? `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 class="font-bold mb-4">Sales — Last 7 Days</h2>
        <div class="flex items-end gap-2 h-40">${chartBars}</div>
      </div>` : `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 class="font-bold mb-3">Recent Transactions</h2>
        ${relevantTx.length === 0 ? '<p class="text-gray-500">No transactions yet</p>' : relevantTx.slice(-5).reverse().map(function(tx) {
          return '<div class="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"><div><div class="font-medium">#' + tx.id + '</div><div class="text-xs text-gray-500">' + fmtDate(tx.timestamp) + '</div></div><div class="font-bold text-indigo-600">₱' + fmtPrice(tx.total) + '</div></div>';
        }).join('')}
      </div>`}
    </div>`;
}

// ── POS Screen ────────────────────────────────────────────────
function renderPOS(el) {
  var categories = ['All'].concat(Array.from(new Set(state.products.map(function(p) { return p.category; }))).sort());
  var q = state.searchQuery.toLowerCase();
  var filtered = state.products.filter(function(p) {
    var matchCat = state.selectedCategory === 'All' || p.category === state.selectedCategory;
    var matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  var subtotal = cartSubtotal();
  if (!window._discount) window._discount = { type: DiscountType.NONE, value: 0, label: '' };
  var discAmt = applyDiscount(subtotal, window._discount);
  var total = subtotal - discAmt;

  var catButtons = categories.map(function(c) {
    var active = state.selectedCategory === c ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700';
    return '<button data-cat="' + c + '" class="px-3 py-1.5 rounded-full text-sm whitespace-nowrap ' + active + '">' + c + '</button>';
  }).join('');

  var productCards = filtered.map(function(p) {
    var cartItem = state.cart.find(function(i) { return i.product.id === p.id; });
    var cartQty = cartItem ? cartItem.quantity : 0;
    var virtual = p.stock - cartQty;
    var days = daysUntilExpiry(p.expirationDate);
    var expired = days !== null && days < 0;
    var available = virtual > 0 && !expired;
    var badge = cartQty > 0 ? '<span class="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">' + cartQty + '</span>' : '';
    var overlay = '';
    if (expired) overlay = '<span class="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center text-white text-xs font-bold">EXPIRED</span>';
    else if (virtual <= 0) overlay = '<span class="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center text-white text-xs font-bold">OUT</span>';

    return '<button data-add="' + p.id + '" ' + (!available ? 'disabled' : '') + ' class="text-left bg-white dark:bg-gray-800 rounded-2xl p-3 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow transition disabled:opacity-50 disabled:cursor-not-allowed relative">' +
      '<div class="h-16 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-2xl font-bold text-indigo-600 mb-2">' + p.name[0] + '</div>' +
      badge + overlay +
      '<div class="font-medium text-sm truncate">' + p.name + '</div>' +
      '<div class="text-xs text-gray-500">' + p.category + '</div>' +
      '<div class="flex justify-between items-center mt-1">' +
      '<span class="font-bold text-indigo-600">₱' + fmtPrice(p.price) + '</span>' +
      '<span class="text-xs ' + (virtual <= 5 ? 'text-red-500' : 'text-gray-500') + '">' + virtual + ' left</span></div></button>';
  }).join('');

  var cartItems = state.cart.length === 0
    ? '<p class="text-center text-gray-400 py-8 text-sm">Cart is empty</p>'
    : state.cart.map(function(item) {
        return '<div class="flex items-center gap-2 py-2 border-b border-gray-50 dark:border-gray-700/50">' +
          '<div class="flex-1 min-w-0"><div class="font-medium text-sm truncate">' + item.product.name + '</div>' +
          '<div class="text-xs text-gray-500">₱' + fmtPrice(item.product.price) + ' each</div></div>' +
          '<div class="flex items-center gap-1">' +
          '<button data-dec="' + item.product.id + '" class="w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 text-sm">−</button>' +
          '<span class="w-6 text-center text-sm font-bold">' + item.quantity + '</span>' +
          '<button data-inc="' + item.product.id + '" class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 text-sm">+</button></div>' +
          '<div class="w-16 text-right text-sm font-bold">₱' + fmtPrice(item.product.price * item.quantity) + '</div></div>';
      }).join('');

  var cartCount = state.cart.reduce(function(s,i){return s+i.quantity;},0);
  el.innerHTML = `
    <div class="max-w-6xl mx-auto pb-32">
      <!-- Products -->
      <div class="mb-4">
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <input id="posSearch" type="search" value="${state.searchQuery}" placeholder="Search name or SKU..." class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500">
          <div class="flex gap-1 overflow-x-auto pb-1">${catButtons}</div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${productCards}</div>
      </div>

      <!-- Fixed bottom cart bar (mobile friendly) -->
      <div id="cartBar" class="fixed left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-10" style="bottom: 56px;">
        <div class="max-w-6xl mx-auto">
          <!-- Collapsed summary (always visible) -->
          <button id="cartToggle" class="w-full px-4 py-3 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-lg">🛒</span>
              <span class="font-bold">Cart</span>
              <span class="text-sm text-gray-500">(${cartCount} item${cartCount !== 1 ? 's' : ''})</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-bold text-indigo-600">₱${fmtPrice(total)}</span>
              <span id="cartChevron" class="text-gray-400">▲</span>
            </div>
          </button>

          <!-- Expandable cart details -->
          <div id="cartDetails" class="hidden border-t border-gray-100 dark:border-gray-700">
            <div class="max-h-48 overflow-y-auto p-3 space-y-2">${cartItems}</div>
            <div class="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
              ${discAmt > 0 ? '<div class="flex justify-between text-sm"><span>Subtotal</span><span>₱' + fmtPrice(subtotal) + '</span></div><div class="flex justify-between text-sm text-amber-600"><span>Discount</span><span>-₱' + fmtPrice(discAmt) + '</span></div>' : ''}
              <div class="flex justify-between font-bold text-lg"><span>Total</span><span class="text-indigo-600">₱${fmtPrice(total)}</span></div>
              <button id="checkoutBtn" ${state.cart.length === 0 ? 'disabled' : ''} class="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">Checkout</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('posSearch').oninput = function(e) {
    state.searchQuery = e.target.value;
    render();
  };
  document.querySelectorAll('[data-cat]').forEach(function(b) {
    b.onclick = function() {
      state.selectedCategory = b.dataset.cat;
      render();
    };
  });
  document.querySelectorAll('[data-add]').forEach(function(b) {
    b.onclick = function() {
      var p = state.products.find(function(x) { return x.id === b.dataset.add; });
      if (!p) return;
      var existing = state.cart.find(function(i) { return i.product.id === p.id; });
      if (existing) {
        if (existing.quantity < p.stock) existing.quantity++;
      } else {
        state.cart.push({ product: p, quantity: 1 });
      }
      render();
    };
  });
  document.querySelectorAll('[data-inc]').forEach(function(b) {
    b.onclick = function() {
      var item = state.cart.find(function(i) { return i.product.id === b.dataset.inc; });
      if (item && item.quantity < item.product.stock) {
        item.quantity++;
        render();
      }
    };
  });
  document.querySelectorAll('[data-dec]').forEach(function(b) {
    b.onclick = function() {
      var idx = state.cart.findIndex(function(i) { return i.product.id === b.dataset.dec; });
      if (idx === -1) return;
      if (state.cart[idx].quantity > 1) state.cart[idx].quantity--;
      else state.cart.splice(idx, 1);
      render();
    };
  });
  var checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) checkoutBtn.onclick = showCheckoutDialog;

  // Cart expand/collapse
  var cartDetails = document.getElementById('cartDetails');
  var cartChevron = document.getElementById('cartChevron');
  var cartOpen = false;
  document.getElementById('cartToggle').onclick = function() {
    cartOpen = !cartOpen;
    if (cartOpen) {
      cartDetails.classList.remove('hidden');
      cartChevron.textContent = '▼';
    } else {
      cartDetails.classList.add('hidden');
      cartChevron.textContent = '▲';
    }
  };
}

function showCheckoutDialog() {
  var subtotal = cartSubtotal();
  var presets = state.discountPresets;
  var disc = Object.assign({}, window._discount);
  var amountPaid = '';

  var modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
      <h2 class="text-xl font-bold mb-4">🛒 Checkout</h2>
      <div class="space-y-2 mb-4 max-h-32 overflow-y-auto text-sm" id="cartSummary"></div>
      <div class="mb-4" id="presetArea"></div>
      <div id="totals" class="space-y-1 mb-4 text-sm"></div>
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Amount Tendered (₱)</label>
        <input id="paidInput" type="number" step="0.01" min="0" class="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00">
      </div>
      <div id="changeBox" class="mb-4 hidden"></div>
      <p id="chkError" class="text-red-500 text-sm mb-3 hidden"></p>
      <div class="flex gap-2">
        <button id="chkCancel" class="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600">Cancel</button>
        <button id="chkConfirm" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold">Confirm Payment</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('cartSummary').innerHTML = state.cart.map(function(i) {
    return '<div class="flex justify-between"><span>' + i.product.name + ' ×' + i.quantity + '</span><span>₱' + fmtPrice(i.product.price * i.quantity) + '</span></div>';
  }).join('');

  if (presets.length) {
    document.getElementById('presetArea').innerHTML = '<div class="text-sm font-medium mb-2">Discount</div><div class="flex flex-wrap gap-2" id="presetButtons"></div>';
    var btnBox = document.getElementById('presetButtons');
    presets.forEach(function(p) {
      var btn = document.createElement('button');
      btn.className = 'px-3 py-1 rounded-full text-xs border ' + (disc.label === p.name ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600');
      btn.textContent = p.name + ' · ' + (p.type === DiscountType.PERCENT ? p.value + '%' : '₱' + fmtPrice(p.value));
      btn.onclick = function() {
        if (disc.label === p.name) disc = { type: DiscountType.NONE, value: 0, label: '' };
        else disc = { type: p.type, value: p.value, label: p.name };
        updateTotals();
        Array.from(btnBox.children).forEach(function(b, i) {
          var pr = presets[i];
          b.className = 'px-3 py-1 rounded-full text-xs border ' + (disc.label === pr.name ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600');
        });
      };
      btnBox.appendChild(btn);
    });
  }

  function updateTotals() {
    var discAmt = applyDiscount(subtotal, disc);
    var total = subtotal - discAmt;
    var paid = parseFloat(amountPaid) || 0;
    var change = paid - total;
    document.getElementById('totals').innerHTML =
      '<div class="flex justify-between"><span>Subtotal</span><span>₱' + fmtPrice(subtotal) + '</span></div>' +
      (discAmt > 0 ? '<div class="flex justify-between text-amber-600"><span>Discount (' + disc.label + ')</span><span>-₱' + fmtPrice(discAmt) + '</span></div>' : '') +
      '<div class="flex justify-between font-bold text-base"><span>Total</span><span class="text-indigo-600">₱' + fmtPrice(total) + '</span></div>';
    var box = document.getElementById('changeBox');
    if (paid > 0) {
      box.classList.remove('hidden');
      box.innerHTML = '<div class="p-3 rounded-xl ' + (change >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600') + ' flex justify-between font-bold">' +
        '<span>' + (change >= 0 ? 'Change' : 'Insufficient') + '</span><span>' + (change >= 0 ? '₱' + fmtPrice(change) : '₱' + fmtPrice(-change) + ' short') + '</span></div>';
    } else {
      box.classList.add('hidden');
    }
  }
  updateTotals();

  document.getElementById('paidInput').oninput = function(e) {
    amountPaid = e.target.value;
    updateTotals();
  };
  document.getElementById('chkCancel').onclick = function() { modal.remove(); };
  document.getElementById('chkConfirm').onclick = function() {
    var discAmt = applyDiscount(subtotal, disc);
    var total = subtotal - discAmt;
    var paid = parseFloat(amountPaid) || 0;
    if (paid < total) {
      var err = document.getElementById('chkError');
      err.textContent = 'Amount paid is less than total';
      err.classList.remove('hidden');
      return;
    }
    var txId = (state.transactions.reduce(function(m, t) { return Math.max(m, t.id); }, 0)) + 1;
    var newTx = {
      id: txId,
      timestamp: new Date().toISOString(),
      cashier: state.currentUser.username,
      items: state.cart.map(function(i) { return { product: Object.assign({}, i.product), quantity: i.quantity }; }),
      subtotal: subtotal,
      discountAmount: discAmt,
      total: total,
      amountPaid: paid,
      discountLabel: disc.label || ''
    };
    state.transactions.push(newTx);
    state.cart.forEach(function(item) {
      var p = state.products.find(function(x) { return x.id === item.product.id; });
      if (p) p.stock = Math.max(0, p.stock - item.quantity);
    });
    addAudit(state.currentUser.username, 'sale.completed', 'sale', String(txId), 'Sale of ' + state.cart.length + ' item(s), total ₱' + fmtPrice(total));
    save();
    state.cart = [];
    window._discount = { type: DiscountType.NONE, value: 0, label: '' };
    modal.remove();
    showReceipt(newTx);
    render();
  };
}

function showReceipt(tx) {
  var modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl" id="receipt-print">
      <h2 class="text-xl font-bold text-center mb-1">Payment Successful</h2>
      <p class="text-center text-sm text-gray-500 mb-4">Transaction #${tx.id}<br>${fmtDate(tx.timestamp)}</p>
      <div class="space-y-1 text-sm mb-4">
        ${tx.items.map(function(i) {
          return '<div class="flex justify-between"><span>' + i.product.name + ' ×' + i.quantity + '</span><span>₱' + fmtPrice(i.product.price * i.quantity) + '</span></div>';
        }).join('')}
      </div>
      <hr class="my-3 border-gray-200 dark:border-gray-600">
      ${tx.discountAmount > 0 ? '<div class="flex justify-between text-sm"><span>Subtotal</span><span>₱' + fmtPrice(tx.subtotal) + '</span></div><div class="flex justify-between text-sm text-amber-600"><span>Discount (' + tx.discountLabel + ')</span><span>-₱' + fmtPrice(tx.discountAmount) + '</span></div>' : ''}
      <div class="flex justify-between font-bold text-lg mt-1"><span>TOTAL</span><span>₱${fmtPrice(tx.total)}</span></div>
      <div class="flex justify-between text-sm"><span>Paid</span><span>₱${fmtPrice(tx.amountPaid)}</span></div>
      <div class="flex justify-between text-sm"><span>Change</span><span>₱${fmtPrice(tx.amountPaid - tx.total)}</span></div>
      <p class="text-center text-xs text-gray-400 mt-6">Thank you for your purchase!</p>
      <div class="flex gap-2 mt-6">
        <button id="rcptPrint" class="flex-1 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm">Print</button>
        <button id="rcptDone" class="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-semibold">Done</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('rcptDone').onclick = function() { modal.remove(); };
  document.getElementById('rcptPrint').onclick = function() { window.print(); };
}

// ── Inventory ─────────────────────────────────────────────────
function renderInventory(el) {
  var html = `
    <div class="max-w-4xl mx-auto">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">Inventory</h1>
        <button id="addProductBtn" class="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-sm">+ Add Product</button>
      </div>
      <div class="space-y-3">`;

  state.products.forEach(function(p) {
    var days = daysUntilExpiry(p.expirationDate);
    var badge = 'In Stock', badgeCls = 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
    if (p.stock === 0) { badge = 'Out of Stock'; badgeCls = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'; }
    else if (p.stock <= 10) { badge = 'Low Stock'; badgeCls = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'; }
    else if (days !== null && days < 0) { badge = 'Expired'; badgeCls = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'; }

    html += `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <div class="font-bold truncate">${p.name}</div>
          <div class="text-xs text-gray-500">SKU: ${p.sku} · ${p.category}</div>
          <div class="text-sm text-indigo-600 mt-0.5">₱${fmtPrice(p.price)} · Stock: ${p.stock} · Exp: ${p.expirationDate || 'N/A'}</div>
          <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${badgeCls}">${badge}</span>
        </div>
        <button data-edit="${p.id}" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-lg">✏️</button>
        <button data-del="${p.id}" class="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 text-lg">🗑️</button>
      </div>`;
  });
  html += '</div></div>';
  el.innerHTML = html;

  document.getElementById('addProductBtn').onclick = function() { showProductDialog(null); };
  document.querySelectorAll('[data-edit]').forEach(function(b) {
    b.onclick = function() {
      var p = state.products.find(function(x) { return x.id === b.dataset.edit; });
      showProductDialog(p);
    };
  });
  document.querySelectorAll('[data-del]').forEach(function(b) {
    b.onclick = function() {
      if (!confirm('Delete this product?')) return;
      var p = state.products.find(function(x) { return x.id === b.dataset.del; });
      if (p) {
        addAudit(state.currentUser.username, 'product.deleted', 'product', p.id, 'Deleted product: ' + p.name);
        state.products = state.products.filter(function(x) { return x.id !== p.id; });
        save();
        render();
      }
    };
  });
}

function showProductDialog(initial) {
  var modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <h2 class="text-xl font-bold mb-4">${initial ? 'Edit Product' : 'Add Product'}</h2>
      <div class="space-y-3">
        <input id="pName" type="text" value="${initial ? initial.name : ''}" placeholder="Product Name *" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <input id="pSku" type="text" value="${initial ? initial.sku : ''}" placeholder="SKU *" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <input id="pCat" type="text" value="${initial ? initial.category : ''}" placeholder="Category *" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <div class="flex gap-2">
          <input id="pPrice" type="number" step="0.01" value="${initial ? initial.price : ''}" placeholder="Price (₱) *" class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
          <input id="pStock" type="number" value="${initial ? initial.stock : ''}" placeholder="Stock *" class="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        </div>
        <input id="pExp" type="date" value="${initial ? (initial.expirationDate || '') : ''}" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <p id="pError" class="text-red-500 text-sm hidden"></p>
      </div>
      <div class="flex gap-2 mt-6">
        <button id="pCancel" class="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600">Cancel</button>
        <button id="pSave" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('pCancel').onclick = function() { modal.remove(); };
  document.getElementById('pSave').onclick = function() {
    var name = document.getElementById('pName').value.trim();
    var sku = document.getElementById('pSku').value.trim();
    var cat = document.getElementById('pCat').value.trim();
    var price = parseFloat(document.getElementById('pPrice').value);
    var stock = parseInt(document.getElementById('pStock').value);
    var exp = document.getElementById('pExp').value;
    var err = document.getElementById('pError');

    if (!name || !sku || !cat || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
      err.textContent = 'Please fill all required fields correctly';
      err.classList.remove('hidden');
      return;
    }
    var product = {
      id: initial ? initial.id : uid(),
      sku: sku, name: name, category: cat, price: price, stock: stock, expirationDate: exp
    };
    if (initial) {
      var idx = state.products.findIndex(function(x) { return x.id === initial.id; });
      state.products[idx] = product;
      addAudit(state.currentUser.username, 'product.edited', 'product', product.id, 'Edited product: ' + name);
    } else {
      state.products.push(product);
      addAudit(state.currentUser.username, 'product.added', 'product', product.id, 'Added product: ' + name);
    }
    save();
    modal.remove();
    render();
  };
}

// ── Discounts ─────────────────────────────────────────────────
function renderDiscounts(el) {
  var html = `
    <div class="max-w-3xl mx-auto">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h1 class="text-2xl font-bold">Discount Presets</h1>
          <p class="text-sm text-gray-500">Manage reusable discounts</p>
        </div>
        <button id="addDiscBtn" class="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-sm">+ Add</button>
      </div>
      <div class="space-y-3">`;

  if (state.discountPresets.length === 0) {
    html += '<p class="text-center text-gray-400 py-12">No discount presets yet</p>';
  } else {
    state.discountPresets.forEach(function(p) {
      html += `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xl">🏷️</div>
          <div class="flex-1">
            <div class="font-bold">${p.name}</div>
            <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${p.type === DiscountType.PERCENT ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'}">
              ${p.type === DiscountType.PERCENT ? p.value + '% off' : '₱' + fmtPrice(p.value) + ' off'}
            </span>
          </div>
          <button data-edit="${p.id}" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700">✏️</button>
          <button data-del="${p.id}" class="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500">🗑️</button>
        </div>`;
    });
  }
  html += '</div></div>';
  el.innerHTML = html;

  document.getElementById('addDiscBtn').onclick = function() { showDiscountDialog(null); };
  document.querySelectorAll('[data-edit]').forEach(function(b) {
    b.onclick = function() {
      var p = state.discountPresets.find(function(x) { return x.id === b.dataset.edit; });
      showDiscountDialog(p);
    };
  });
  document.querySelectorAll('[data-del]').forEach(function(b) {
    b.onclick = function() {
      if (!confirm('Delete this discount?')) return;
      var p = state.discountPresets.find(function(x) { return x.id === b.dataset.del; });
      if (p) {
        addAudit(state.currentUser.username, 'discount.deleted', 'discount', p.id, 'Deleted discount: ' + p.name);
        state.discountPresets = state.discountPresets.filter(function(x) { return x.id !== p.id; });
        save();
        render();
      }
    };
  });
}

function showDiscountDialog(initial) {
  var modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  var type = initial ? initial.type : DiscountType.PERCENT;
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
      <h2 class="text-xl font-bold mb-4">${initial ? 'Edit Discount' : 'Add Discount'}</h2>
      <div class="space-y-3">
        <input id="dName" type="text" value="${initial ? initial.name : ''}" placeholder="Discount Name" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <div class="flex gap-2">
          <button data-type="PERCENT" class="flex-1 py-2 rounded-xl border ${type === DiscountType.PERCENT ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600'}">% Percent</button>
          <button data-type="FIXED" class="flex-1 py-2 rounded-xl border ${type === DiscountType.FIXED ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600'}">₱ Fixed</button>
        </div>
        <input id="dValue" type="number" step="0.01" value="${initial ? initial.value : ''}" placeholder="Value" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <p id="dError" class="text-red-500 text-sm hidden"></p>
      </div>
      <div class="flex gap-2 mt-6">
        <button id="dCancel" class="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600">Cancel</button>
        <button id="dSave" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-type]').forEach(function(b) {
    b.onclick = function() {
      type = b.dataset.type;
      modal.querySelectorAll('[data-type]').forEach(function(btn) {
        btn.className = 'flex-1 py-2 rounded-xl border ' + (btn.dataset.type === type ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600');
      });
    };
  });

  document.getElementById('dCancel').onclick = function() { modal.remove(); };
  document.getElementById('dSave').onclick = function() {
    var name = document.getElementById('dName').value.trim();
    var value = parseFloat(document.getElementById('dValue').value);
    var err = document.getElementById('dError');
    if (!name || isNaN(value) || value <= 0) { err.textContent = 'Invalid name or value'; err.classList.remove('hidden'); return; }
    if (type === DiscountType.PERCENT && value > 100) { err.textContent = 'Percentage cannot exceed 100%'; err.classList.remove('hidden'); return; }

    var preset = { id: initial ? initial.id : uid(), name: name, type: type, value: value };
    if (initial) {
      var idx = state.discountPresets.findIndex(function(x) { return x.id === initial.id; });
      state.discountPresets[idx] = preset;
      addAudit(state.currentUser.username, 'discount.edited', 'discount', preset.id, 'Edited discount: ' + name);
    } else {
      state.discountPresets.push(preset);
      addAudit(state.currentUser.username, 'discount.added', 'discount', preset.id, 'Added discount: ' + name);
    }
    save();
    modal.remove();
    render();
  };
}

// ── Users ─────────────────────────────────────────────────────
function renderUsers(el) {
  var html = `
    <div class="max-w-3xl mx-auto">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-bold">User Management</h1>
        <button id="addUserBtn" class="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium text-sm">+ Add User</button>
      </div>
      <div class="space-y-3">`;

  state.users.forEach(function(u) {
    html += `
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 font-bold">${u.fullName[0]}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold">${u.fullName}${u.id === state.currentUser.id ? ' <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded">You</span>' : ''}</div>
          <div class="text-xs text-gray-500">@${u.username} · ${u.role}</div>
          <div class="text-xs text-gray-500">${u.email}</div>
        </div>
        <button data-edit="${u.id}" class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700">✏️</button>
        <button data-del="${u.id}" ${u.id === state.currentUser.id ? 'disabled' : ''} class="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-30">🗑️</button>
      </div>`;
  });
  html += '</div></div>';
  el.innerHTML = html;

  document.getElementById('addUserBtn').onclick = function() { showUserDialog(null); };
  document.querySelectorAll('[data-edit]').forEach(function(b) {
    b.onclick = function() {
      var u = state.users.find(function(x) { return x.id === +b.dataset.edit; });
      showUserDialog(u);
    };
  });
  document.querySelectorAll('[data-del]').forEach(function(b) {
    b.onclick = function() {
      if (b.disabled) return;
      if (!confirm('Delete this user?')) return;
      var u = state.users.find(function(x) { return x.id === +b.dataset.del; });
      if (u && u.id !== state.currentUser.id) {
        addAudit(state.currentUser.username, 'user.deleted', 'user', String(u.id), 'Deleted user: ' + u.username);
        state.users = state.users.filter(function(x) { return x.id !== u.id; });
        save();
        render();
      }
    };
  });
}

function showUserDialog(initial) {
  var modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4';
  var role = initial ? initial.role : UserRole.CASHIER;
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
      <h2 class="text-xl font-bold mb-4">${initial ? 'Edit User' : 'Add User'}</h2>
      <div class="space-y-3">
        <input id="uFull" type="text" value="${initial ? initial.fullName : ''}" placeholder="Full Name" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <input id="uEmail" type="email" value="${initial ? initial.email : ''}" placeholder="Email" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <input id="uUser" type="text" value="${initial ? initial.username : ''}" ${initial ? 'disabled' : ''} placeholder="Username" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60">
        <input id="uPass" type="password" value="${initial ? initial.password : ''}" placeholder="Password" class="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
        <div class="flex gap-2">
          <button data-role="ADMIN" class="flex-1 py-2 rounded-xl border ${role === UserRole.ADMIN ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600'}">Admin</button>
          <button data-role="CASHIER" class="flex-1 py-2 rounded-xl border ${role === UserRole.CASHIER ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600'}">Cashier</button>
        </div>
        <p id="uError" class="text-red-500 text-sm hidden"></p>
      </div>
      <div class="flex gap-2 mt-6">
        <button id="uCancel" class="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600">Cancel</button>
        <button id="uSave" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-role]').forEach(function(b) {
    b.onclick = function() {
      role = b.dataset.role;
      modal.querySelectorAll('[data-role]').forEach(function(btn) {
        btn.className = 'flex-1 py-2 rounded-xl border ' + (btn.dataset.role === role ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600');
      });
    };
  });

  document.getElementById('uCancel').onclick = function() { modal.remove(); };
  document.getElementById('uSave').onclick = function() {
    var fullName = document.getElementById('uFull').value.trim();
    var email = document.getElementById('uEmail').value.trim();
    var username = document.getElementById('uUser').value.trim();
    var password = document.getElementById('uPass').value;
    var err = document.getElementById('uError');
    if (!fullName || !email || !username || !password) { err.textContent = 'All fields required'; err.classList.remove('hidden'); return; }
    if (!initial && state.users.some(function(u) { return u.username === username; })) {
      err.textContent = 'Username taken'; err.classList.remove('hidden'); return;
    }

    var user = {
      id: initial ? initial.id : (state.users.reduce(function(m, u) { return Math.max(m, u.id); }, 0) + 1),
      username: username, password: password, fullName: fullName, email: email, role: role
    };
    if (initial) {
      var idx = state.users.findIndex(function(x) { return x.id === initial.id; });
      state.users[idx] = user;
      addAudit(state.currentUser.username, 'user.edited', 'user', String(user.id), 'Edited user: ' + username);
    } else {
      state.users.push(user);
      addAudit(state.currentUser.username, 'user.added', 'user', String(user.id), 'Added user: ' + username);
    }
    save();
    modal.remove();
    render();
  };
}

// ── Audit Log ─────────────────────────────────────────────────
function renderAudit(el) {
  var filtered = state.auditLog.slice().reverse();
  var html = `
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold mb-4">Audit Log</h1>
      <p class="text-sm text-gray-500 mb-3">${filtered.length} event(s)</p>
      <div class="space-y-2">`;
  if (filtered.length === 0) {
    html += '<p class="text-center text-gray-400 py-12">No events yet</p>';
  } else {
    filtered.forEach(function(e) {
      html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
          <div class="flex justify-between">
            <span class="text-xs font-bold uppercase text-indigo-600">${e.action}</span>
            <span class="text-xs text-gray-400">${fmtDate(e.timestamp)}</span>
          </div>
          <div class="text-sm mt-1">${e.summary}</div>
          <div class="text-xs text-gray-500">By: ${e.actor}</div>
        </div>`;
    });
  }
  html += '</div></div>';
  el.innerHTML = html;
}

// ── Reports ───────────────────────────────────────────────────
function renderReports(el) {
  var totalRev = state.transactions.reduce(function(s, t) { return s + t.total; }, 0);
  el.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">Reports</h1>
          <p class="text-sm text-gray-500">Analytics overview</p>
        </div>
        <button id="exportCsvBtn" class="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">Export CSV</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500">Total Revenue</div>
          <div class="text-xl font-bold text-indigo-600">₱${fmtPrice(totalRev)}</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500">Transactions</div>
          <div class="text-xl font-bold">${state.transactions.length}</div>
        </div>
      </div>
    </div>`;
  document.getElementById('exportCsvBtn').onclick = exportCsv;
}

function exportCsv() {
  var csv = '# POS SYSTEM Export\nGenerated: ' + new Date().toLocaleString() + '\n\n';
  csv += 'ID,Date,Cashier,Total\n';
  state.transactions.forEach(function(tx) {
    csv += tx.id + ',"' + fmtDate(tx.timestamp) + '","' + tx.cashier + '",' + tx.total + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'pos_report.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Boot ──────────────────────────────────────────────────────
load();
render();
