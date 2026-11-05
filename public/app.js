const base = `${location.pathname.startsWith('/listacompra') ? '/listacompra' : ''}/api`;
const state = { items: [], editingId: null, purchasedOpen: false, activeList: 'general' };
const $ = (selector) => document.querySelector(selector);

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
    throw new Error(body.error || 'No se pudo completar la operación');
  }
  return response.status === 204 ? null : response.json();
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
}

function updateItem(updated) {
  state.items = state.items.map((item) => item.id === updated.id ? updated : item);
}

function itemElement(item) {
  const li = document.createElement('li');
  li.className = `item${item.completed ? ' completed' : ''}`;
  const mercadonaLabel = item.mercadona ? 'Quitar de Mercadona' : 'Añadir a Mercadona';
  li.innerHTML = `
    <input type="checkbox" ${item.completed ? 'checked' : ''} aria-label="${item.completed ? 'Volver a pendientes' : 'Marcar como comprado'}">
    <label></label>
    <span class="actions">
      <button class="icon-button mercadona-action${item.mercadona ? ' selected' : ''}" aria-label="${mercadonaLabel}" title="${mercadonaLabel}">${storeIcon}</button>
      <button class="icon-button edit" aria-label="Editar" title="Editar">✎</button>
      <button class="icon-button delete" aria-label="Eliminar" title="Eliminar">×</button>
    </span>`;
  li.querySelector('label').textContent = item.name;
  li.querySelector('input').addEventListener('change', async (event) => {
    try {
      const body = await request(`/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: event.target.checked }) });
      updateItem(body.item);
      render();
    } catch (error) { event.target.checked = !event.target.checked; toast(error.message); }
  });
  li.querySelector('.mercadona-action').addEventListener('click', async () => {
    const adding = !item.mercadona;
    try {
      const body = await request(`/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ mercadona: adding }) });
      updateItem(body.item);
      render();
      toast(adding ? 'Añadido a Mercadona' : 'Quitado de Mercadona');
    } catch (error) { toast(error.message); }
  });
  li.querySelector('.edit').addEventListener('click', () => openEdit(item));
  li.querySelector('.delete').addEventListener('click', async () => {
    try {
      await request(`/items/${item.id}`, { method: 'DELETE' });
      state.items = state.items.filter((current) => current.id !== item.id);
      render();
      toast('Artículo eliminado');
    } catch (error) { toast(error.message); }
  });
  return li;
}

function render() {
  const visibleItems = state.activeList === 'mercadona'
    ? state.items.filter((item) => item.mercadona)
    : state.items;
  const pending = visibleItems.filter((item) => !item.completed);
  const purchased = visibleItems.filter((item) => item.completed);
  const generalPending = state.items.filter((item) => !item.completed).length;
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
  $('#empty-copy').textContent = isMercadona ? 'Añade artículos desde aquí o desde la lista general' : 'Añade algo cuando lo necesites';

  document.querySelectorAll('.list-option').forEach((button) => {
    const active = button.dataset.list === state.activeList;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function openEdit(item) {
  state.editingId = item.id;
  $('#edit-name').value = item.name;
  $('#edit-dialog').showModal();
  $('#edit-name').focus();
}

$('#add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#item-name');
  const name = input.value.trim();
  if (!name) return;
  input.value = '';
  try {
    const body = await request('/items', {
      method: 'POST',
      body: JSON.stringify({ name, mercadona: state.activeList === 'mercadona' }),
    });
    state.items.unshift(body.item);
    render();
  } catch (error) { input.value = name; toast(error.message); }
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

$('#edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#edit-name').value.trim();
  if (!name) return;
  try {
    const body = await request(`/items/${state.editingId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    updateItem(body.item);
    $('#edit-dialog').close();
    render();
  } catch (error) { toast(error.message); }
});

request('/items')
  .then((body) => { state.items = body.items; render(); })
  .catch((error) => { render(); toast(error.message); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
