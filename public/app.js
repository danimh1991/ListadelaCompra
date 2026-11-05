const base = `${location.pathname.startsWith('/listacompra') ? '/listacompra' : ''}/api`;
const state = { items: [], editingId: null, purchasedOpen: false };
const $ = (selector) => document.querySelector(selector);

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

function itemElement(item) {
  const li = document.createElement('li');
  li.className = `item${item.completed ? ' completed' : ''}`;
  li.innerHTML = `
    <input type="checkbox" ${item.completed ? 'checked' : ''} aria-label="${item.completed ? 'Volver a pendientes' : 'Marcar como comprado'}">
    <label></label>
    <span class="actions">
      <button class="icon-button edit" aria-label="Editar">✎</button>
      <button class="icon-button delete" aria-label="Eliminar">×</button>
    </span>`;
  li.querySelector('label').textContent = item.name;
  li.querySelector('input').addEventListener('change', async (event) => {
    try {
      const body = await request(`/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: event.target.checked }) });
      state.items = state.items.map((current) => current.id === item.id ? body.item : current);
      render();
    } catch (error) { event.target.checked = !event.target.checked; toast(error.message); }
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
  const pending = state.items.filter((item) => !item.completed);
  const purchased = state.items.filter((item) => item.completed);
  $('#pending-list').replaceChildren(...pending.map(itemElement));
  $('#purchased-list').replaceChildren(...purchased.map(itemElement));
  $('#pending-count').textContent = pending.length;
  $('#purchased-count').textContent = purchased.length;
  $('#empty-state').hidden = pending.length > 0;
  $('#purchased-section').hidden = purchased.length === 0;
  $('#purchased-list').hidden = !state.purchasedOpen;
  $('#purchased-toggle').setAttribute('aria-expanded', String(state.purchasedOpen));
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
    const body = await request('/items', { method: 'POST', body: JSON.stringify({ name }) });
    state.items.unshift(body.item);
    render();
  } catch (error) { input.value = name; toast(error.message); }
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
    state.items = state.items.map((item) => item.id === state.editingId ? body.item : item);
    $('#edit-dialog').close();
    render();
  } catch (error) { toast(error.message); }
});

request('/items')
  .then((body) => { state.items = body.items; render(); })
  .catch((error) => { render(); toast(error.message); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

