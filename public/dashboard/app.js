// =================================================================
// THE QUANT PARTNERS · CENTRO COMERCIAL AUTÓNOMO (OBSIDIAN PRECISION)
// =================================================================

// State Management
let currentPin = sessionStorage.getItem('qp_client_pin') || '';
let currentOverviewData = null;
let activeLeadPhone = null;
let currentStreamFilter = 'ALL';
let currentSearchQuery = '';
let currentMainView = 'workspace'; // 'workspace' | 'metrics'
let eventSource = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  checkAuth();
});

// 1. Autenticación por PIN
function checkAuth() {
  const pinModal = document.getElementById('pinModal');
  if (currentPin) {
    pinModal.classList.add('hidden');
    fetchOverview();
    initSSE();
  } else {
    pinModal.classList.remove('hidden');
    const input = document.getElementById('pinInput');
    if (input) input.focus();
  }
}

async function handlePinSubmit(e) {
  e.preventDefault();
  const pinInput = document.getElementById('pinInput');
  const pin = pinInput.value.trim();
  const errorEl = document.getElementById('pinError');
  const btn = document.getElementById('pinBtn');

  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<span>Verificando...</span>';

  try {
    const res = await fetch('/api/client/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      currentPin = pin;
      sessionStorage.setItem('qp_client_pin', pin);
      document.getElementById('pinModal').classList.add('hidden');
      fetchOverview();
      initSSE();
    } else {
      errorEl.textContent = data.error || 'PIN incorrecto.';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.textContent = 'Error de conexión con el servidor.';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Acceder al Centro de Mando</span><i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>';
    if (window.lucide) lucide.createIcons();
  }
}

// 2. Carga del Overview consolidado de PostgreSQL
async function fetchOverview() {
  if (!currentPin) return;

  try {
    const res = await fetch('/api/client/overview', {
      headers: { 'x-client-pin': currentPin }
    });

    if (res.status === 401) {
      sessionStorage.removeItem('qp_client_pin');
      currentPin = '';
      checkAuth();
      return;
    }

    const data = await res.json();
    currentOverviewData = data;

    renderHeader(data);
    renderLeadsStream();
    renderMetrics(data);

    // Si hay un lead activo, refrescar su detalle; si no, seleccionar el primero disponible
    if (activeLeadPhone) {
      updateActiveLeadHeader();
    } else {
      const allLeads = getConsolidatedLeads();
      if (allLeads.length > 0) {
        selectLeadForDetail(allLeads[0].phone);
      }
    }
  } catch (err) {
    console.error('Error cargando datos de PostgreSQL:', err);
  }
}

// 3. Render Header y Estado de WhatsApp
function renderHeader(data) {
  const companyEl = document.getElementById('headerCompanyName');
  const serviceEl = document.getElementById('headerServiceName');
  if (companyEl) companyEl.textContent = data.companyName || 'The Quant Partners';
  if (serviceEl) serviceEl.textContent = data.serviceName || 'Licitaciones QP - Compras Estatales';

  const waBadge = document.getElementById('waStatusBadge');
  const waText = document.getElementById('waStatusText');

  if (data.isWhatsAppReady) {
    waBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono cursor-pointer transition hover:bg-emerald-500/15';
    waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>WhatsApp Conectado</span>';
  } else {
    waBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-mono cursor-pointer transition hover:bg-rose-500/15';
    waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span><span>Vincular WhatsApp (QR)</span>';
  }
}

// 4. Consolidar leads desde todas las columnas sin duplicados
function getConsolidatedLeads() {
  if (!currentOverviewData || !currentOverviewData.kanban) return [];

  const kanban = currentOverviewData.kanban;
  const leadMap = new Map();

  // Prioridad de orden de estados para mostrar el más avanzado
  const statusLists = [
    kanban.closedWon || [],
    kanban.qualified || [],
    kanban.replied || [],
    kanban.humanTakeover || [],
    kanban.outreachSent || [],
    kanban.discovered || []
  ];

  statusLists.forEach(list => {
    list.forEach(lead => {
      if (lead && lead.phone && !leadMap.has(lead.phone)) {
        leadMap.set(lead.phone, lead);
      }
    });
  });

  // Enlazar snippets de activeChats si existen
  const activeChats = currentOverviewData.activeChats || [];
  const chatMap = new Map();
  activeChats.forEach(c => chatMap.set(c.leadPhone, c));

  const consolidated = Array.from(leadMap.values()).map(lead => {
    const chat = chatMap.get(lead.phone);
    return {
      ...lead,
      lastMessageSnippet: chat ? chat.lastMessageSnippet : (lead.lastOutreachAt ? 'Mensaje en frío despachado' : 'Pendiente de prospección'),
      lastActivityTime: chat ? chat.lastMessageAt : (lead.updatedAt || lead.createdAt)
    };
  });

  // Ordenar por última actividad descendente
  consolidated.sort((a, b) => new Date(b.lastActivityTime).getTime() - new Date(a.lastActivityTime).getTime());

  return consolidated;
}

// 5. Render Stream de Prospectos (Panel Izquierdo estilo Linear)
function renderLeadsStream() {
  const container = document.getElementById('leadsStreamContainer');
  if (!container) return;

  const allLeads = getConsolidatedLeads();

  // Actualizar contadores en píldoras
  updatePillCounts(allLeads);

  // Filtrar por píldora seleccionada
  let filtered = allLeads.filter(lead => {
    if (currentStreamFilter === 'ALL') return true;
    if (currentStreamFilter === 'REPLIED') return lead.status === 'REPLIED';
    if (currentStreamFilter === 'DISCOVERED') return lead.status === 'DISCOVERED' || lead.status === 'QUEUED';
    if (currentStreamFilter === 'QUALIFIED') return lead.status === 'QUALIFIED' || lead.status === 'MEETING_SCHEDULED';
    if (currentStreamFilter === 'CLOSED_WON') return lead.status === 'CLOSED_WON';
    return true;
  });

  // Filtrar por búsqueda
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(l => 
      (l.companyName || '').toLowerCase().includes(q) || 
      (l.phone || '').includes(q)
    );
  }

  const footerCount = document.getElementById('streamFooterCount');
  if (footerCount) {
    footerCount.textContent = `${filtered.length} de ${allLeads.length} prospectos`;
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-500 font-light space-y-2">
        <i data-lucide="inbox" class="w-6 h-6 mx-auto text-slate-600"></i>
        <p>No hay prospectos en este filtro.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const statusBadgeMap = {
    DISCOVERED: { label: 'Por Contactar', class: 'text-slate-400 border-white/[0.08] bg-white/[0.02]' },
    OUTREACH_SENT: { label: 'Contactado', class: 'text-sky-400 border-sky-500/20 bg-sky-500/5' },
    FOLLOW_UP_SENT: { label: 'Follow-up', class: 'text-sky-400 border-sky-500/20 bg-sky-500/5' },
    REPLIED: { label: 'Respondió', class: 'text-gold border-gold/30 bg-gold/10' },
    QUALIFIED: { label: 'Calificado', class: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
    MEETING_SCHEDULED: { label: 'Cita en Cal', class: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
    CLOSED_WON: { label: 'Ganado', class: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
    HUMAN_TAKEOVER: { label: 'Humano', class: 'text-purple-400 border-purple-500/20 bg-purple-500/5' }
  };

  filtered.forEach(lead => {
    const isSelected = lead.phone === activeLeadPhone;
    const badge = statusBadgeMap[lead.status] || statusBadgeMap.DISCOVERED;
    
    let timeFormatted = '';
    if (lead.lastActivityTime) {
      const date = new Date(lead.lastActivityTime);
      timeFormatted = date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    }

    const item = document.createElement('div');
    item.className = `p-3.5 cursor-pointer transition border-l-2 border-transparent hover:bg-white/[0.02] ${isSelected ? 'active-lead-item' : ''}`;
    item.onclick = () => selectLeadForDetail(lead.phone);

    item.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
        <h3 class="font-medium text-xs text-slate-100 truncate">${escapeHtml(lead.companyName)}</h3>
        <span class="text-[10px] font-mono text-slate-500 flex-shrink-0">${timeFormatted}</span>
      </div>
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="font-mono text-[11px] text-gold/90">+${escapeHtml(lead.phone)}</span>
        <span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.class}">
          ${badge.label}
        </span>
      </div>
      <p class="text-[11px] text-slate-400 font-light truncate">
        ${escapeHtml(lead.lastMessageSnippet || '')}
      </p>
    `;
    container.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function updatePillCounts(allLeads) {
  const countAll = allLeads.length;
  const countReplied = allLeads.filter(l => l.status === 'REPLIED').length;
  const countDiscovered = allLeads.filter(l => l.status === 'DISCOVERED' || l.status === 'QUEUED').length;
  const countQualified = allLeads.filter(l => l.status === 'QUALIFIED' || l.status === 'MEETING_SCHEDULED').length;
  const countWon = allLeads.filter(l => l.status === 'CLOSED_WON').length;

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('count_ALL', countAll);
  setEl('count_REPLIED', countReplied);
  setEl('count_DISCOVERED', countDiscovered);
  setEl('count_QUALIFIED', countQualified);
  setEl('count_CLOSED_WON', countWon);
}

function setStreamFilter(filter) {
  currentStreamFilter = filter;

  ['ALL', 'REPLIED', 'DISCOVERED', 'QUALIFIED', 'CLOSED_WON'].forEach(f => {
    const pill = document.getElementById(`pillFilter_${f}`);
    if (pill) {
      if (f === filter) {
        pill.className = 'stream-filter-pill px-2.5 py-1 rounded-md text-[11px] font-mono tracking-tight transition bg-white/[0.08] text-gold border border-gold/30';
      } else {
        pill.className = 'stream-filter-pill px-2.5 py-1 rounded-md text-[11px] font-mono tracking-tight transition text-slate-400 hover:text-white border border-transparent hover:border-white/[0.06]';
      }
    }
  });

  renderLeadsStream();
}

function handleLeadSearch(val) {
  currentSearchQuery = (val || '').trim();
  renderLeadsStream();
}

// 6. Seleccionar Prospecto y Abrir Detalle / Chat Directo
async function selectLeadForDetail(phone) {
  activeLeadPhone = phone;
  renderLeadsStream(); // Actualizar el resaltado en el stream izquierdo

  const allLeads = getConsolidatedLeads();
  const lead = allLeads.find(l => l.phone === phone);

  if (!lead) return;

  // Header del detalle
  const nameEl = document.getElementById('detailLeadName');
  const phoneEl = document.getElementById('detailLeadPhone');
  const tagEl = document.getElementById('detailLeadStatusTag');
  const actionsEl = document.getElementById('leadDetailActions');
  const waBtn = document.getElementById('detailDirectWaBtn');
  const composer = document.getElementById('chatComposer');
  const statusSelect = document.getElementById('detailStatusSelect');

  if (nameEl) nameEl.textContent = lead.companyName || 'Prospecto';
  if (phoneEl) phoneEl.textContent = `+${lead.phone}`;
  if (tagEl) {
    tagEl.textContent = lead.status;
    tagEl.classList.remove('hidden');
  }
  if (actionsEl) actionsEl.classList.remove('hidden');
  if (waBtn) waBtn.href = `https://wa.me/${lead.phone}`;
  if (composer) composer.classList.remove('hidden');
  if (statusSelect) statusSelect.value = lead.status;

  updateTakeoverUI(lead.status === 'HUMAN_TAKEOVER' || !!lead.humanTakeoverAt);

  // Cargar Mensajes de Chat
  const messagesContainer = document.getElementById('chatMessagesContainer');
  messagesContainer.innerHTML = `
    <div class="h-full flex items-center justify-center text-xs text-gold font-mono gap-2">
      <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
      <span>Sincronizando conversación en tiempo real...</span>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`/api/client/chat/${phone}`, {
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    renderChatMessages(data.messages || []);
  } catch (err) {
    messagesContainer.innerHTML = `<div class="p-6 text-center text-xs text-rose-400 font-mono">Error cargando chat: ${escapeHtml(err.message)}</div>`;
  }

  // Activar Panel Co-Piloto (QPartner)
  const copilotPanel = document.getElementById('copilotPanel');
  if (copilotPanel) {
    copilotPanel.classList.remove('hidden');
    loadCopilotSuggestions(phone);
  }
}

function updateActiveLeadHeader() {
  if (!activeLeadPhone) return;
  const allLeads = getConsolidatedLeads();
  const lead = allLeads.find(l => l.phone === activeLeadPhone);
  if (lead) {
    const statusSelect = document.getElementById('detailStatusSelect');
    if (statusSelect) statusSelect.value = lead.status;
    const tagEl = document.getElementById('detailLeadStatusTag');
    if (tagEl) tagEl.textContent = lead.status;
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById('chatMessagesContainer');
  container.innerHTML = '';

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs font-light space-y-2">
        <i data-lucide="message-square" class="w-6 h-6 text-slate-600"></i>
        <p>Aún no hay mensajes intercambiados con este prospecto.</p>
        <p class="text-[10px] font-mono text-slate-600">Envía un primer contacto o usa el dictamen para iniciar.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  messages.forEach(m => {
    const isOutbound = m.role === 'assistant' || m.role === 'human_agent';
    const bubble = document.createElement('div');
    bubble.className = `flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`;

    const timeStr = new Date(m.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const authorBadge = m.role === 'human_agent' 
      ? '<span class="text-[9px] font-mono text-gold">👤 Kenneth (Socio Consultor)</span>' 
      : (m.role === 'assistant' ? '<span class="text-[9px] font-mono text-slate-400">🤖 Agente IA</span>' : '');

    bubble.innerHTML = `
      <div class="max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
        isOutbound 
          ? 'bg-gold/10 border border-gold/25 text-slate-100 rounded-tr-none' 
          : 'bg-surface border border-white/[0.06] text-slate-200 rounded-tl-none'
      }">
        <div class="flex items-center justify-between gap-4 mb-1">
          ${authorBadge}
          <span class="text-[9px] text-slate-500 font-mono">${timeStr}</span>
        </div>
        <p class="whitespace-pre-wrap select-text font-light">${escapeHtml(m.content)}</p>
      </div>
    `;
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
  if (window.lucide) lucide.createIcons();
}

// 7. Cambio directo de estado comercial
async function handleLeadStatusChange(newStatus) {
  if (!activeLeadPhone) return;

  try {
    const res = await fetch('/api/client/leads/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeLeadPhone, status: newStatus })
    });

    if (res.ok) {
      fetchOverview();
    } else {
      const data = await res.json();
      alert('Error cambiando estado: ' + (data.error || 'Desconocido'));
    }
  } catch (err) {
    console.error('Error actualizando estado:', err);
  }
}

// 8. Control Humano (Takeover)
function updateTakeoverUI(isTakeover) {
  const btn = document.getElementById('takeoverToggleBtn');
  const btnText = document.getElementById('takeoverBtnText');
  if (!btn || !btnText) return;

  if (isTakeover) {
    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 border border-gold/40 bg-gold/15 text-gold';
    btnText.textContent = 'Control Humano Activo';
  } else {
    btn.className = 'px-3 py-1.5 rounded-lg text-xs font-mono transition flex items-center gap-1.5 border border-white/[0.08] bg-surface text-slate-300 hover:text-white hover:border-gold/30';
    btnText.textContent = 'Pausar Bot (Tomar Control)';
  }
}

async function toggleCurrentLeadTakeover() {
  if (!activeLeadPhone) return;

  try {
    const res = await fetch('/api/client/takeover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeLeadPhone })
    });
    const data = await res.json();
    if (res.ok) {
      updateTakeoverUI(data.isHumanTakeover);
      fetchOverview();
    }
  } catch (err) {
    alert('Error alternando control humano: ' + err.message);
  }
}

// 9. Enviar Mensaje Manual por WhatsApp
async function handleSendManualMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatManualInput');
  const message = input.value.trim();
  if (!message || !activeLeadPhone) return;

  input.value = '';

  try {
    const res = await fetch('/api/client/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeLeadPhone, message })
    });
    const data = await res.json();
    if (res.ok) {
      selectLeadForDetail(activeLeadPhone);
    } else {
      alert('Error enviando mensaje: ' + data.error);
    }
  } catch (err) {
    alert('Error de red al enviar mensaje: ' + err.message);
  }
}

// 10. Despachar Dictamen Técnico EsSalud Piura (PDF)
async function handleQuickSendDictamen() {
  if (!activeLeadPhone) {
    alert('Seleccione un prospecto primero.');
    return;
  }

  const confirmed = confirm(
    '¿Deseas despachar el Dictamen Técnico Oficial de EsSalud Piura (CP-03) en PDF a este prospecto por WhatsApp?\n\n' +
    'Archivo: Dictamen_Tecnico_EsSalud_Piura_CP-03_LicitacionesQP.pdf\n' +
    'Destino: +' + activeLeadPhone
  );
  if (!confirmed) return;

  const btn = document.getElementById('chatSendDocBtn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }

  try {
    const res = await fetch('/api/client/chat/send-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        phone: activeLeadPhone,
        filePathOrUrl: 'storage/assets/dictamen_licitaciones_qp_essalud_piura.pdf',
        fileName: 'Dictamen_Tecnico_EsSalud_Piura_CP-03_LicitacionesQP.pdf',
        caption: 'Estimados señores. Cumpliendo con lo coordinado, les adjuntamos el Dictamen Pericial Oficial sobre el concurso de EsSalud Piura (CP-03) elaborado por la División de Licitaciones QP. Quedamos a su disposición para cualquier aclaración técnica.'
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert('✅ Dictamen Técnico despachado exitosamente por WhatsApp.');
      selectLeadForDetail(activeLeadPhone);
    } else {
      alert('Error despachando documento: ' + data.error);
    }
  } catch (err) {
    alert('Error de red despachando documento: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

// =================================================================
// 11. MODO CO-PILOTO IA (QPARTNER)
// =================================================================
let currentSuggestions = [];
let isCopilotCollapsed = localStorage.getItem('qp_copilot_collapsed') === 'true';

function toggleCopilotCollapse() {
  isCopilotCollapsed = !isCopilotCollapsed;
  localStorage.setItem('qp_copilot_collapsed', isCopilotCollapsed ? 'true' : 'false');
  applyCopilotCollapseState();
}

function applyCopilotCollapseState() {
  const container = document.getElementById('copilotSuggestionsContainer');
  const icon = document.getElementById('copilotCollapseIcon');
  const text = document.getElementById('copilotCollapseText');
  if (!container || !icon || !text) return;

  if (isCopilotCollapsed) {
    container.classList.add('hidden');
    text.textContent = 'Expandir';
    icon.setAttribute('data-lucide', 'chevron-down');
  } else {
    container.classList.remove('hidden');
    text.textContent = 'Minimizar';
    icon.setAttribute('data-lucide', 'chevron-up');
  }
  if (window.lucide) lucide.createIcons();
}

async function loadCopilotSuggestions(phone) {
  const container = document.getElementById('copilotSuggestionsContainer');
  if (!container) return;

  applyCopilotCollapseState();

  container.innerHTML = `
    <div class="col-span-full py-4 flex items-center justify-center gap-2 text-xs text-gold font-mono">
      <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
      <span>QPartner analizando contexto e historial comercial...</span>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`/api/client/chat/${phone}/suggest`, {
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error cargando sugerencias');

    currentSuggestions = data.suggestions || [];
    renderCopilotSuggestions(currentSuggestions);
  } catch (err) {
    container.innerHTML = `
      <div class="col-span-full py-2 text-center text-xs text-rose-400 font-mono">
        No se pudieron generar sugerencias: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function renderCopilotSuggestions(suggestions) {
  const container = document.getElementById('copilotSuggestionsContainer');
  if (!container) return;
  container.innerHTML = '';
  applyCopilotCollapseState();

  if (!suggestions || suggestions.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center text-xs text-slate-500 font-mono py-2">Sin sugerencias para este chat.</div>';
    return;
  }

  suggestions.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'bg-surface border border-white/[0.06] hover:border-gold/30 rounded-xl p-3.5 flex flex-col justify-between transition group shadow-sm';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-[9px] font-mono uppercase tracking-wider text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/20">
            ${escapeHtml(s.label)}
          </span>
          <span class="text-[9px] font-mono text-slate-500">Opción ${idx + 1}</span>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed font-light mb-2">
          "${escapeHtml(s.text)}"
        </p>
        <p class="text-[10px] text-slate-400 italic mb-3 font-light">
          💡 ${escapeHtml(s.explanation)}
        </p>
      </div>
      <div class="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
        <button 
          onclick="useCopilotSuggestion(${idx})"
          class="flex-1 py-1 px-2 bg-obsidian hover:bg-white/[0.05] text-slate-300 hover:text-white rounded-lg text-[10px] font-mono transition border border-white/[0.06]"
        >
          Usar / Editar
        </button>
        <button 
          onclick="sendCopilotSuggestionDirectly(${idx})"
          class="flex-1 py-1 px-2 btn-gold rounded-lg text-[10px] font-mono transition"
        >
          Enviar Ya
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function refreshCopilotSuggestions() {
  if (activeLeadPhone) {
    loadCopilotSuggestions(activeLeadPhone);
  }
}

function useCopilotSuggestion(idx) {
  const suggestion = currentSuggestions[idx];
  if (!suggestion) return;
  const input = document.getElementById('chatManualInput');
  if (input) {
    input.value = suggestion.text;
    input.focus();
  }
}

async function sendCopilotSuggestionDirectly(idx) {
  const suggestion = currentSuggestions[idx];
  if (!suggestion || !activeLeadPhone) return;

  const confirmed = confirm(`¿Enviar esta sugerencia táctica por WhatsApp a este prospecto?\n\n"${suggestion.text}"`);
  if (!confirmed) return;

  try {
    const res = await fetch('/api/client/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeLeadPhone, message: suggestion.text })
    });
    const data = await res.json();
    if (res.ok) {
      selectLeadForDetail(activeLeadPhone);
    } else {
      alert('Error enviando mensaje: ' + data.error);
    }
  } catch (err) {
    alert('Error de red al enviar mensaje: ' + err.message);
  }
}

// =================================================================
// 12. VISTA DE MÉTRICAS Y LIQUIDACIÓN SAAR
// =================================================================
function switchMainView(view) {
  currentMainView = view;
  const workspaceView = document.getElementById('viewWorkspace');
  const metricsView = document.getElementById('viewMetrics');
  const btnWorkspace = document.getElementById('tabBtnWorkspace');
  const btnMetrics = document.getElementById('tabBtnMetrics');

  if (view === 'workspace') {
    workspaceView.classList.remove('hidden');
    metricsView.classList.add('hidden');
    btnWorkspace.className = 'px-3.5 py-1 rounded-md text-xs font-medium flex items-center gap-2 transition bg-white/[0.05] text-gold border border-gold/20';
    btnMetrics.className = 'px-3.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white flex items-center gap-2 transition';
  } else {
    workspaceView.classList.add('hidden');
    metricsView.classList.remove('hidden');
    btnMetrics.className = 'px-3.5 py-1 rounded-md text-xs font-medium flex items-center gap-2 transition bg-white/[0.05] text-gold border border-gold/20';
    btnWorkspace.className = 'px-3.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white flex items-center gap-2 transition';
  }
  if (window.lucide) lucide.createIcons();
}

function renderMetrics(data) {
  const m = data.metrics || {};
  document.getElementById('kpiTotalContacted').textContent = m.outreachSent || 0;
  document.getElementById('kpiReplyRate').textContent = `${m.replyRatePercent || 0}%`;
  document.getElementById('kpiRepliedCount').textContent = m.replied || 0;
  document.getElementById('kpiMeetingsScheduled').textContent = m.meetingsScheduled || 0;
  document.getElementById('kpiQualified').textContent = m.qualified || 0;

  if (m.settlement) {
    const s = m.settlement;
    document.getElementById('settlementBaseRetainer').textContent = `${s.currency} ${(s.baseRetainer || 0).toLocaleString()}`;
    document.getElementById('settlementFeePerMeeting').textContent = s.successFeePerMeeting || 200;
    document.getElementById('settlementAttendedCount').textContent = m.attendedMeetings || 0;
    document.getElementById('settlementVariableTotal').textContent = `${s.currency} ${(s.variableTotal || 0).toLocaleString()}`;
    document.getElementById('settlementGrandTotal').textContent = `${s.currency} ${(s.grandTotal || 0).toLocaleString()}`;
  }
}

function copySettlementSummary() {
  if (!currentOverviewData || !currentOverviewData.metrics) return;
  const m = currentOverviewData.metrics;
  const s = m.settlement || { baseRetainer: 2800, successFeePerMeeting: 200, variableTotal: 0, grandTotal: 2800, currency: 'S/.' };
  const company = currentOverviewData.companyName || 'Cliente B2B';
  const service = currentOverviewData.serviceName || 'Licitaciones QP';
  const dateStr = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  const summary = `🧾 *LIQUIDACIÓN COMERCIAL SAAR - THE QUANT PARTNERS*
Periodo: ${dateStr.toUpperCase()}
Cliente: ${company}
Servicio: ${service}

1. *Base Mensual (Retainer)*: ${s.currency} ${(s.baseRetainer).toLocaleString()}
   • Incluye: Servidor aislado, SIM satélite blindada, Scraping B2B y Agente IA WhatsApp.

2. *Éxito Comercial Variable (PPQM)*:
   • Citas agendadas en calendario: ${m.meetingsScheduled || 0}
   • Citas asistidas validadas: ${m.attendedMeetings || 0} (x ${s.currency} ${s.successFeePerMeeting}/cita) = *${s.currency} ${(s.variableTotal).toLocaleString()}*
   • Inasistencias (No-Show): ${m.noShowMeetings || 0} citas (0% de cargo / S/. 0)

*TOTAL A FACTURAR: ${s.currency} ${(s.grandTotal).toLocaleString()}*

Validado transparentemente en QP Outreach Engine v2.0`;

  navigator.clipboard.writeText(summary).then(() => {
    const btn = document.getElementById('copySettlementBtn');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i><span>¡Copiado!</span>';
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = orig;
      if (window.lucide) lucide.createIcons();
    }, 2500);
  });
}

// =================================================================
// 13. CARGA MASIVA DE PROSPECTOS (CSV / BBDD)
// =================================================================
let parsedImportLeads = [];
let currentImportTab = 'csv';

async function openImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;

  await loadImportServices();
  clearImportFile();
  const rawTextArea = document.getElementById('importRawText');
  if (rawTextArea) rawTextArea.value = '';
  parsedImportLeads = [];
  updateImportValidationUI();

  const alertBox = document.getElementById('importAlertBox');
  if (alertBox) {
    alertBox.classList.add('hidden');
    alertBox.innerHTML = '';
  }

  modal.classList.remove('hidden');
  initImportDragAndDrop();
  if (window.lucide) lucide.createIcons();
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.add('hidden');
  clearImportFile();
}

async function loadImportServices() {
  const select = document.getElementById('importServiceSelect');
  if (!select) return;

  try {
    const res = await fetch('/api/client/services', {
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.services && data.services.length > 0) {
        select.innerHTML = '';
        data.services.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.name} (${s.id})${s.isActive ? ' - Activa' : ''}`;
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn('No se pudieron cargar servicios:', err);
  }
}

function switchImportTab(tab) {
  currentImportTab = tab;
  const btnCsv = document.getElementById('importTabBtnCsv');
  const btnText = document.getElementById('importTabBtnText');
  const contentCsv = document.getElementById('importTabCsvContent');
  const contentText = document.getElementById('importTabTextContent');

  if (tab === 'csv') {
    btnCsv.className = 'px-3 py-1 rounded-md text-xs font-mono transition bg-white/[0.08] text-gold border border-gold/30';
    btnText.className = 'px-3 py-1 rounded-md text-xs font-mono text-slate-400 hover:text-white border border-transparent';
    contentCsv.classList.remove('hidden');
    contentText.classList.add('hidden');
  } else {
    btnText.className = 'px-3 py-1 rounded-md text-xs font-mono transition bg-white/[0.08] text-gold border border-gold/30';
    btnCsv.className = 'px-3 py-1 rounded-md text-xs font-mono text-slate-400 hover:text-white border border-transparent';
    contentText.classList.remove('hidden');
    contentCsv.classList.add('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

function handleCsvFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  processCsvFile(file);
}

function processCsvFile(file) {
  document.getElementById('importFileName').textContent = file.name;
  document.getElementById('importFileDetails').classList.remove('hidden');
  document.getElementById('csvDropZone').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target?.result;
    if (typeof content === 'string') {
      parseRawTextLines(content);
    }
  };
  reader.readAsText(file);
  if (window.lucide) lucide.createIcons();
}

function clearImportFile() {
  const input = document.getElementById('csvFileInput');
  if (input) input.value = '';
  const details = document.getElementById('importFileDetails');
  const dropZone = document.getElementById('csvDropZone');
  if (details) details.classList.add('hidden');
  if (dropZone) dropZone.classList.remove('hidden');
  parsedImportLeads = [];
  updateImportValidationUI();
}

function handleRawTextInput(val) {
  parseRawTextLines(val);
}

function parseRawTextLines(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  parsedImportLeads = [];
  let invalidCount = 0;

  lines.forEach((line, idx) => {
    if (idx === 0 && (line.toLowerCase().includes('telefono') || line.toLowerCase().includes('phone') || line.toLowerCase().includes('celular'))) {
      return;
    }

    let parts = line.split(/[;,\t]/).map(p => p.trim());
    if (parts.length === 0) return;

    let phonePartIdx = parts.findIndex(p => {
      const digits = p.replace(/[^0-9]/g, '');
      return digits.length >= 8;
    });

    let rawPhone = '';
    let companyName = 'Empresa B2B';
    let website = '';
    let address = '';

    if (phonePartIdx >= 0) {
      rawPhone = parts[phonePartIdx];
      const otherParts = parts.filter((_, i) => i !== phonePartIdx);
      if (otherParts.length > 0 && otherParts[0]) companyName = otherParts[0];
      if (otherParts.length > 1) {
        if (otherParts[1].includes('.') || otherParts[1].startsWith('http')) {
          website = otherParts[1];
        } else {
          address = otherParts[1];
        }
      }
    } else {
      invalidCount++;
      return;
    }

    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('09') && cleanPhone.length === 10) {
      cleanPhone = cleanPhone.slice(1);
    }

    // Normalizar teléfonos peruanos a 519...
    if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
      cleanPhone = `51${cleanPhone}`;
    }

    const isValidPeruvianMobile = cleanPhone.length === 11 && cleanPhone.startsWith('519');
    const isValidInternational = !cleanPhone.startsWith('51') && cleanPhone.length >= 8 && cleanPhone.length <= 15;

    if (isValidPeruvianMobile || isValidInternational) {
      parsedImportLeads.push({
        phone: cleanPhone,
        name: companyName,
        website: website || undefined,
        address: address || undefined
      });
    } else {
      invalidCount++;
    }
  });

  updateImportValidationUI(lines.length, invalidCount);
}

function updateImportValidationUI(totalLines = 0, invalidCount = 0) {
  const parsedCountEl = document.getElementById('importParsedCount');
  const validCountEl = document.getElementById('importValidCount');
  const invalidCountEl = document.getElementById('importInvalidCount');
  const submitBtn = document.getElementById('importSubmitBtn');
  const previewContainer = document.getElementById('importPreviewContainer');
  const previewList = document.getElementById('importPreviewList');

  const validCount = parsedImportLeads.length;
  if (parsedCountEl) parsedCountEl.textContent = totalLines || validCount;
  if (validCountEl) validCountEl.textContent = validCount;
  if (invalidCountEl) invalidCountEl.textContent = invalidCount;

  if (submitBtn) {
    submitBtn.disabled = validCount === 0;
  }

  if (previewContainer && previewList) {
    if (validCount > 0) {
      previewContainer.classList.remove('hidden');
      previewList.innerHTML = '';
      parsedImportLeads.slice(0, 3).forEach(lead => {
        const item = document.createElement('div');
        item.className = 'p-1.5 bg-obsidian rounded border border-white/[0.04] text-[10px] text-slate-300 flex items-center justify-between font-mono';
        item.innerHTML = `
          <span class="text-gold">+${escapeHtml(lead.phone)}</span>
          <span class="text-slate-400 truncate max-w-[200px] font-sans">${escapeHtml(lead.name)}</span>
          <span class="text-emerald-400">Válido</span>
        `;
        previewList.appendChild(item);
      });
    } else {
      previewContainer.classList.add('hidden');
    }
  }
}

async function submitImportLeads() {
  if (parsedImportLeads.length === 0) return;

  const serviceSelect = document.getElementById('importServiceSelect');
  const serviceId = serviceSelect ? serviceSelect.value : 'licitaciones-qp';
  const submitBtn = document.getElementById('importSubmitBtn');
  const submitText = document.getElementById('importSubmitBtnText');
  const alertBox = document.getElementById('importAlertBox');

  submitBtn.disabled = true;
  submitText.textContent = 'Ingestando a PostgreSQL...';
  if (alertBox) alertBox.classList.add('hidden');

  try {
    const res = await fetch('/api/client/leads/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        serviceId,
        leads: parsedImportLeads
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alertBox.className = 'p-3 rounded-xl text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 block space-y-1 font-mono';
      alertBox.innerHTML = `
        <div class="font-bold flex items-center gap-1.5">
          <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>¡Ingesta completada en PostgreSQL!</span>
        </div>
        <p class="text-[10px] text-slate-300">
          • Nuevos insertados: <strong>${data.inserted}</strong><br>
          • Duplicados omitidos: <strong>${data.skipped}</strong><br>
          • Inválidos descartados: <strong>${data.invalid || 0}</strong>
        </p>
      `;
      if (window.lucide) lucide.createIcons();

      fetchOverview();

      setTimeout(() => {
        closeImportModal();
      }, 2000);
    } else {
      alertBox.className = 'p-3 rounded-xl text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 block font-mono';
      alertBox.textContent = data.error || 'Error al ingestar prospectos';
    }
  } catch (err) {
    alertBox.className = 'p-3 rounded-xl text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 block font-mono';
    alertBox.textContent = 'Error de red al ingestar: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'Ingestar a PostgreSQL';
  }
}

function initImportDragAndDrop() {
  const dropZone = document.getElementById('csvDropZone');
  if (!dropZone || dropZone.dataset.initialized) return;
  dropZone.dataset.initialized = 'true';

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('border-gold', 'bg-gold/5');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('border-gold', 'bg-gold/5');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt?.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  }, false);
}

// =================================================================
// 14. MODAL DE QR DE WHATSAPP
// =================================================================
let qrRefreshInterval = null;

function checkWhatsAppModal() {
  if (currentOverviewData && currentOverviewData.isWhatsAppReady) {
    alert('✅ WhatsApp está actualmente vinculado y conectado con la sesión satélite.');
    return;
  }
  document.getElementById('qrImage').src = `/api/client/qr?t=${Date.now()}`;
  document.getElementById('qrModal').classList.remove('hidden');

  if (qrRefreshInterval) clearInterval(qrRefreshInterval);
  qrRefreshInterval = setInterval(() => {
    const modal = document.getElementById('qrModal');
    if (modal && !modal.classList.contains('hidden')) {
      document.getElementById('qrImage').src = `/api/client/qr?t=${Date.now()}`;
    }
  }, 10000);
}

function closeQrModal() {
  document.getElementById('qrModal').classList.add('hidden');
  if (qrRefreshInterval) {
    clearInterval(qrRefreshInterval);
    qrRefreshInterval = null;
  }
}

// 15. Real-Time SSE
function initSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/client/stream?pin=${currentPin}`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'new_message') {
        if (activeLeadPhone && activeLeadPhone === event.phone) {
          selectLeadForDetail(activeLeadPhone);
        } else {
          fetchOverview();
        }
      }

      if (event.type === 'lead_updated' || event.type === 'appointment_booked' || event.type === 'meeting_attendance_updated') {
        fetchOverview();
      }
    } catch (err) {
      console.error('Error parseando evento SSE:', err);
    }
  };

  eventSource.onerror = () => {
    console.warn('⚠️ [SSE] Reconectando en 5 segundos...');
  };
}

// Utilitario Sanitización XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
