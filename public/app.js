const isBundledAndroid = location.hostname === 'appassets.androidplatform.net';
const base = isBundledAndroid
  ? 'https://danieta.com/listacompra/api'
  : `${location.pathname.startsWith('/listacompra') ? '/listacompra' : ''}/api`;
const state = { items: [], editingId: null, purchasedOpen: false, activeList: 'general' };
const $ = (selector) => document.querySelector(selector);
const LIST_CACHE_KEY = 'lista-compra:last-known-list:v1';
const SYNC_QUEUE_KEY = 'lista-compra:pending-operations:v1';
const REFRESH_INTERVAL = 4 * 60 * 60 * 1000;
let lastRefreshAt = 0;
let syncInProgress = false;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const storeIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 9h16l-1 11H5L4 9Z"></path>
    <path d="M8 9V7a4 4 0 0 1 8 0v2"></path>
  </svg>`;

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || 'No se pudo completar la operación', response.status);
  }
  return response.status === 204 ? null : response.json();
}

function readCachedList() {
  try {
    const cached = JSON.parse(localStorage.getItem(LIST_CACHE_KEY));
    if (!cached || cached.version !== 1 || !Array.isArray(cached.items)) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheList() {
  try {
    localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({
      version: 1,
      items: state.items,
      updatedAt: Date.now(),
    }));
  } catch {
    // La lista sigue funcionando aunque el navegador no permita almacenamiento local.
  }
}

function readPendingOperations() {
  try {
    const operations = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY));
    return Array.isArray(operations) ? operations : [];
  } catch {
    return [];
  }
}

let pendingOperations = readPendingOperations();

function savePendingOperations() {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(pendingOperations));
  } catch {
    toast('No se pudo guardar el cambio en el teléfono');
  }
}

function uniqueId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function replaceItemId(oldId, newId, serverItem) {
  state.items = state.items.map((item) => item.id === oldId
    ? { ...serverItem, ...item, id: newId }
    : item);
  pendingOperations.forEach((operation) => {
    if (operation.itemId === oldId) operation.itemId = newId;
  });
}

function queueOperation(operation) {
  pendingOperations.push({ operationId: uniqueId(), ...operation });
  savePendingOperations();
  cacheList();
  render();

  if (!navigator.onLine) {
    toast('Guardado en el móvil; se sincronizará al volver la conexión');
    return;
  }
  syncPendingOperations({ notifyOnFailure: true });
}

async function syncPendingOperations({ notifyOnFailure = false, announceSuccess = false } = {}) {
  if (syncInProgress || !pendingOperations.length || !navigator.onLine) return false;
  syncInProgress = true;
  let synchronized = 0;

  try {
    while (pendingOperations.length) {
      const operation = pendingOperations[0];
      try {
        if (operation.type === 'create') {
          const body = await request('/items', {
            method: 'POST',
            body: JSON.stringify({ ...operation.item, clientId: operation.clientId }),
          });
          replaceItemId(operation.itemId, body.item.id, body.item);
        } else if (operation.type === 'patch') {
          await request(`/items/${operation.itemId}`, {
            method: 'PATCH',
            body: JSON.stringify(operation.changes),
          });
        } else if (operation.type === 'delete') {
          await request(`/items/${operation.itemId}`, { method: 'DELETE' });
        }

        pendingOperations.shift();
        savePendingOperations();
        cacheList();
        synchronized += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404
            && (operation.type === 'patch' || operation.type === 'delete')) {
          state.items = state.items.filter((item) => item.id !== operation.itemId);
          pendingOperations.shift();
          savePendingOperations();
          cacheList();
          synchronized += 1;
          continue;
        }

        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          if (operation.type === 'create') {
            state.items = state.items.filter((item) => item.id !== operation.itemId);
          }
          pendingOperations.shift();
          savePendingOperations();
          cacheList();
          render();
          toast(error.message);
          continue;
        }

        if (notifyOnFailure) {
          toast('Cambios guardados en el móvil; el servidor no está disponible');
        }
        break;
      }
    }
  } finally {
    syncInProgress = false;
  }

  if (!pendingOperations.length && synchronized) {
    await refreshList();
    if (announceSuccess) {
      toast(synchronized === 1 ? 'Cambio sincronizado' : `${synchronized} cambios sincronizados`);
    }
  }
  return synchronized > 0;
}

async function refreshList({ notifyOnFailure = false } = {}) {
  if (pendingOperations.length) return false;
  try {
    const body = await request('/items');
    if (!Array.isArray(body.items) || pendingOperations.length) return false;
    state.items = body.items;
    lastRefreshAt = Date.now();
    cacheList();
    render();
    return true;
  } catch {
    if (notifyOnFailure) {
      toast(readCachedList()
        ? 'Sin conexión: mostrando la última lista guardada'
        : 'No se pudo cargar la lista');
    }
    return false;
  }
}

function refreshIfStale() {
  if (pendingOperations.length) {
    syncPendingOperations();
    return;
  }
  if (document.visibilityState === 'visible' && Date.now() - lastRefreshAt >= REFRESH_INTERVAL) {
    refreshList();
  }
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
}

function updateLocalItem(id, changes) {
  state.items = state.items.map((item) => item.id === id ? { ...item, ...changes } : item);
  cacheList();
}

function itemElement(item) {
  const li = document.createElement('li');
  li.className = `item${item.completed ? ' completed' : ''}`;
  const mercadonaLabel = item.mercadona ? 'Mover a General' : 'Mover a Mercadona';
  li.innerHTML = `
    <input type="checkbox" ${item.completed ? 'checked' : ''} aria-label="${item.completed ? 'Volver a pendientes' : 'Marcar como comprado'}">
    <label><span class="item-name"></span>${item.quantity ? '<small class="item-quantity"></small>' : ''}</label>
    <span class="actions">
      <button class="icon-button mercadona-action${item.mercadona ? ' selected' : ''}" aria-label="${mercadonaLabel}" title="${mercadonaLabel}">${storeIcon}</button>
      <button class="icon-button edit" aria-label="Editar" title="Editar">✎</button>
      <button class="icon-button delete" aria-label="Eliminar" title="Eliminar">×</button>
    </span>`;
  li.querySelector('.item-name').textContent = item.name;
  if (item.quantity) li.querySelector('.item-quantity').textContent = item.quantity;
  li.querySelector('input').addEventListener('change', (event) => {
    const completed = event.target.checked;
    updateLocalItem(item.id, { completed });
    queueOperation({ type: 'patch', itemId: item.id, changes: { completed } });
  });
  li.querySelector('.mercadona-action').addEventListener('click', () => {
    const adding = !item.mercadona;
    updateLocalItem(item.id, { mercadona: adding });
    queueOperation({ type: 'patch', itemId: item.id, changes: { mercadona: adding } });
  });
  li.querySelector('.edit').addEventListener('click', () => openEdit(item));
  li.querySelector('.delete').addEventListener('click', () => {
    state.items = state.items.filter((current) => current.id !== item.id);
    queueOperation({ type: 'delete', itemId: item.id });
    toast('Artículo eliminado');
  });
  return li;
}

function render() {
  const visibleItems = state.activeList === 'mercadona'
    ? state.items.filter((item) => item.mercadona)
    : state.items.filter((item) => !item.mercadona);
  const pending = visibleItems.filter((item) => !item.completed);
  const purchased = visibleItems.filter((item) => item.completed);
  const generalPending = state.items.filter((item) => !item.mercadona && !item.completed).length;
  const mercadonaPending = state.items.filter((item) => item.mercadona && !item.completed).length;
  const isMercadona = state.activeList === 'mercadona';

  $('#pending-list').replaceChildren(...pending.map(itemElement));
  $('#purchased-list').replaceChildren(...purchased.map(itemElement));
  $('#pending-count').textContent = pending.length;
  $('#general-count').textContent = generalPending;
  $('#mercadona-count').textContent = mercadonaPending;
  $('#purchased-count').textContent = purchased.length;
  $('#empty-state').hidden = pending.length > 0;
  $('#purchased-section').hidden = purchased.length === 0;
  $('#purchased-list').hidden = !state.purchasedOpen;
  $('#purchased-toggle').setAttribute('aria-expanded', String(state.purchasedOpen));
  $('#list-title').textContent = isMercadona ? 'Mercadona' : 'Lista general';
  $('#list-eyebrow').textContent = isMercadona ? 'LISTA SECUNDARIA' : 'MI LISTA';
  $('#item-name').placeholder = isMercadona ? 'Añadir a Mercadona…' : 'Añadir a la lista general…';
  $('#empty-title').textContent = isMercadona ? 'Nada pendiente en Mercadona' : 'Todo comprado';
  $('#empty-copy').textContent = isMercadona ? 'Añade algo aquí o mueve un artículo desde General' : 'Añade algo cuando lo necesites';

  document.querySelectorAll('.list-option').forEach((button) => {
    const active = button.dataset.list === state.activeList;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function openEdit(item) {
  state.editingId = item.id;
  $('#edit-name').value = item.name;
  $('#edit-quantity').value = item.quantity || '';
  $('#edit-dialog').showModal();
  $('#edit-name').focus();
}

$('#add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#item-name');
  const quantityInput = $('#item-quantity');
  const name = input.value.trim();
  const quantity = quantityInput.value.trim();
  if (!name) return;
  input.value = '';
  quantityInput.value = '';
  const clientId = uniqueId();
  const temporaryId = `offline:${clientId}`;
  const now = new Date().toISOString();
  const item = {
    id: temporaryId,
    name,
    quantity: quantity || null,
    completed: false,
    mercadona: state.activeList === 'mercadona',
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
  state.items.unshift(item);
  queueOperation({ type: 'create', itemId: temporaryId, clientId, item: {
    name: item.name,
    quantity: item.quantity,
    mercadona: item.mercadona,
  } });
});

document.querySelectorAll('.list-option').forEach((button) => {
  button.addEventListener('click', () => {
    state.activeList = button.dataset.list;
    state.purchasedOpen = false;
    render();
    $('#item-name').focus();
  });
});

$('#purchased-toggle').addEventListener('click', () => {
  state.purchasedOpen = !state.purchasedOpen;
  render();
});

$('#edit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#edit-name').value.trim();
  const quantity = $('#edit-quantity').value.trim();
  if (!name) return;
  const current = state.items.find((item) => item.id === state.editingId);
  if (!current) return;
  const changes = {};
  if (name !== current.name) changes.name = name;
  if ((quantity || null) !== current.quantity) changes.quantity = quantity || null;
  $('#edit-dialog').close();
  if (!Object.keys(changes).length) return;
  updateLocalItem(state.editingId, changes);
  queueOperation({ type: 'patch', itemId: state.editingId, changes });
});

const cachedList = readCachedList();
if (cachedList) {
  state.items = cachedList.items;
  lastRefreshAt = cachedList.updatedAt || 0;
}
render();
if (pendingOperations.length) {
  syncPendingOperations({ notifyOnFailure: true, announceSuccess: true });
} else {
  refreshList({ notifyOnFailure: true });
}

window.addEventListener('online', () => {
  if (pendingOperations.length) {
    syncPendingOperations({ notifyOnFailure: true, announceSuccess: true });
  }
  else refreshList();
});
document.addEventListener('visibilitychange', refreshIfStale);
setInterval(refreshIfStale, REFRESH_INTERVAL);

if (!isBundledAndroid && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
