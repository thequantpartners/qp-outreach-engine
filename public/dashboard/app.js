// =================================================================
// THE QUANT PARTNERS · CENTRO COMERCIAL AUTÓNOMO (OBSIDIAN PRECISION)
// =================================================================

// State Management
let currentPin = sessionStorage.getItem('qp_client_pin') || '';
let currentOverviewData = null;
let activeLeadPhone = null;
let currentStreamFilter = 'ALL';
let currentSearchQuery = '';
let currentRepFilter = 'ALL';
let currentTeamReps = [];
let currentMainView = 'workspace'; // 'workspace' | 'discovery' | 'metrics'
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

    if (data.salesReps && Array.isArray(data.salesReps)) {
      currentTeamReps = data.salesReps;
    }

    renderHeader(data);
    renderLeadsStream();
    renderMetrics(data);
    updateOnboardingBanner(data);

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

  // Poblar selector de filtro por Asesor (Round Robin)
  const repSelect = document.getElementById('streamRepFilter');
  if (repSelect) {
    let repOptionsHtml = '<option value="ALL">Todos los asesores</option><option value="UNASSIGNED">Sin asignar</option>';
    currentTeamReps.forEach(rep => {
      repOptionsHtml += `<option value="${escapeHtml(rep.name)}">👤 ${escapeHtml(rep.name)}</option>`;
    });
    repSelect.innerHTML = repOptionsHtml;
    repSelect.value = currentRepFilter;
  }

  // Filtrar por píldora de estado seleccionada
  let filtered = allLeads.filter(lead => {
    if (currentStreamFilter === 'ALL') return true;
    if (currentStreamFilter === 'REPLIED') return lead.status === 'REPLIED';
    if (currentStreamFilter === 'DISCOVERED') return lead.status === 'DISCOVERED' || lead.status === 'QUEUED';
    if (currentStreamFilter === 'QUALIFIED') return lead.status === 'QUALIFIED' || lead.status === 'MEETING_SCHEDULED';
    if (currentStreamFilter === 'CLOSED_WON') return lead.status === 'CLOSED_WON';
    return true;
  });

  // Filtrar por asesor Round Robin
  if (currentRepFilter === 'UNASSIGNED') {
    filtered = filtered.filter(l => !l.assignedRepName);
  } else if (currentRepFilter !== 'ALL') {
    filtered = filtered.filter(l => l.assignedRepName === currentRepFilter);
  }

  // Filtrar por búsqueda
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(l => 
      (l.companyName || '').toLowerCase().includes(q) || 
      (l.phone || '').includes(q) ||
      (l.assignedRepName || '').toLowerCase().includes(q)
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

    const repLabel = lead.assignedRepName || 'Sin asignar';

    item.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
        <h3 class="font-medium text-xs text-slate-100 truncate">${escapeHtml(lead.companyName)}</h3>
        <span class="text-[10px] font-mono text-slate-500 flex-shrink-0">${timeFormatted}</span>
      </div>
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="font-mono text-[11px] text-gold/90">+${escapeHtml(lead.phone)}</span>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-[9px] font-mono text-slate-400 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.06] flex items-center gap-1" title="Asesor Asignado: ${escapeHtml(repLabel)}">
            <i data-lucide="user" class="w-2.5 h-2.5 text-gold"></i>
            <span class="max-w-[70px] truncate">${escapeHtml(repLabel)}</span>
          </span>
          <span class="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.class}">
            ${badge.label}
          </span>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 font-light truncate">
        ${escapeHtml(lead.lastMessageSnippet || '')}
      </p>
    `;
    container.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

function handleRepFilterChange(repName) {
  currentRepFilter = repName;
  renderLeadsStream();
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

  // Header del detalle central (Columna 2)
  const nameEl = document.getElementById('detailLeadName');
  const phoneEl = document.getElementById('detailLeadPhone');
  const tagEl = document.getElementById('detailLeadStatusTag');
  const actionsEl = document.getElementById('leadDetailActions');
  const waBtn = document.getElementById('detailDirectWaBtn');
  const composer = document.getElementById('chatComposer');
  const avatarEl = document.getElementById('detailLeadAvatar');

  if (nameEl) nameEl.textContent = lead.companyName || 'Prospecto';
  if (phoneEl) phoneEl.textContent = `+${lead.phone}`;
  if (tagEl) {
    tagEl.textContent = lead.status;
    tagEl.classList.remove('hidden');
  }
  if (actionsEl) actionsEl.classList.remove('hidden');
  if (waBtn) waBtn.href = `https://wa.me/${lead.phone}`;
  if (composer) composer.classList.remove('hidden');
  if (avatarEl) {
    const initials = (lead.companyName || 'WA').slice(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }

  updateTakeoverUI(lead.status === 'HUMAN_TAKEOVER' || !!lead.humanTakeoverAt);

  // Panel de Inteligencia Comercial & Ficha (Columna 3)
  const intelPlaceholder = document.getElementById('intelPlaceholder');
  const intelLeadCard = document.getElementById('intelLeadCard');
  if (intelPlaceholder) intelPlaceholder.classList.add('hidden');
  if (intelLeadCard) intelLeadCard.classList.remove('hidden');

  const intelAssignedBadge = document.getElementById('intelAssignedBadge');
  if (intelAssignedBadge) {
    intelAssignedBadge.textContent = lead.assignedRepName || 'Sin asignar';
  }

  const intelRepSelect = document.getElementById('intelRepSelect');
  if (intelRepSelect) {
    let repOptionsHtml = '<option value="">Reasignar asesor...</option>';
    currentTeamReps.forEach(r => {
      const isSel = lead.assignedRepName === r.name ? 'selected' : '';
      repOptionsHtml += `<option value="${escapeHtml(r.name)}" ${isSel}>👤 ${escapeHtml(r.name)} (${escapeHtml(r.phone || 'Sin tel')})</option>`;
    });
    intelRepSelect.innerHTML = repOptionsHtml;
  }

  const intelStatusSelect = document.getElementById('intelStatusSelect');
  if (intelStatusSelect) {
    intelStatusSelect.value = lead.status;
  }

  // Ficha de la Empresa en Columna 3
  const webEl = document.getElementById('intelWebsite');
  const webRow = document.getElementById('intelWebsiteRow');
  const addrEl = document.getElementById('intelAddress');
  const catEl = document.getElementById('intelCategory');
  if (webEl && webRow) {
    if (lead.website) {
      webEl.href = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
      webEl.textContent = lead.website.replace(/^https?:\/\//, '');
      webRow.classList.remove('hidden');
    } else {
      webRow.classList.add('hidden');
    }
  }
  if (addrEl) addrEl.textContent = lead.address || 'Lima, Perú';
  if (catEl) catEl.textContent = lead.category || lead.source || 'Prospección B2B';

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

  // Activar Panel Co-Piloto IA dentro del Chat
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
    const intelStatusSelect = document.getElementById('intelStatusSelect');
    if (intelStatusSelect) intelStatusSelect.value = lead.status;
    const tagEl = document.getElementById('detailLeadStatusTag');
    if (tagEl) tagEl.textContent = lead.status;
    const intelAssignedBadge = document.getElementById('intelAssignedBadge');
    if (intelAssignedBadge) intelAssignedBadge.textContent = lead.assignedRepName || 'Sin asignar';
  }
}

async function handleReassignLead(repName) {
  if (!activeLeadPhone || !repName) return;
  const selectedRep = currentTeamReps.find(r => r.name === repName);
  const repPhone = selectedRep ? selectedRep.phone : '';

  try {
    const res = await fetch('/api/client/leads/reassign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        phone: activeLeadPhone,
        repName,
        repPhone
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const intelBadge = document.getElementById('intelAssignedBadge');
      if (intelBadge) intelBadge.textContent = repName;

      // Actualizar en el objeto en memoria
      const allLeads = getConsolidatedLeads();
      const lead = allLeads.find(l => l.phone === activeLeadPhone);
      if (lead) {
        lead.assignedRepName = repName;
        lead.assignedRepPhone = repPhone;
      }
      renderLeadsStream();
    } else {
      alert('Error reasignando asesor: ' + (data.error || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error al reasignar asesor: ' + err.message);
  }
}

async function handleLeadStatusChange(newStatus) {
  if (!activeLeadPhone || !newStatus) return;
  try {
    const res = await fetch('/api/client/leads/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeLeadPhone, status: newStatus })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const allLeads = getConsolidatedLeads();
      const lead = allLeads.find(l => l.phone === activeLeadPhone);
      if (lead) {
        lead.status = newStatus;
      }
      const tagEl = document.getElementById('detailLeadStatusTag');
      if (tagEl) tagEl.textContent = newStatus;
      renderLeadsStream();
    } else {
      alert('Error al actualizar etapa: ' + (data.error || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error al actualizar etapa: ' + err.message);
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
    card.className = 'bg-surface/80 border border-white/[0.06] hover:border-gold/30 rounded-xl p-3 flex flex-col justify-between transition group shadow-sm space-y-2';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[9px] font-mono uppercase tracking-wider text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/20 font-semibold">
            ${escapeHtml(s.label)}
          </span>
          <span class="text-[9px] font-mono text-slate-500">Opción ${idx + 1}</span>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed font-light mb-1.5 bg-obsidian/60 p-2.5 rounded-lg border border-white/[0.03]">
          "${escapeHtml(s.text)}"
        </p>
        <p class="text-[10px] text-slate-400 italic font-light">
          💡 ${escapeHtml(s.explanation)}
        </p>
      </div>
      <div class="flex items-center gap-1.5 pt-1.5 border-t border-white/[0.04]">
        <button 
          onclick="useCopilotSuggestion(${idx})"
          class="flex-1 py-1 px-2 bg-obsidian hover:bg-white/[0.05] text-slate-300 hover:text-white rounded-lg text-[10px] font-mono transition border border-white/[0.06]"
        >
          Usar / Editar
        </button>
        <button 
          onclick="sendCopilotSuggestionDirectly(${idx})"
          class="flex-1 py-1 px-2 btn-gold rounded-lg text-[10px] font-mono transition font-medium"
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
// 12. VISTAS Y NAVEGACIÓN PRINCIPAL
// =================================================================
function switchMainView(view) {
  currentMainView = view;
  const workspaceView = document.getElementById('viewWorkspace');
  const discoveryView = document.getElementById('viewDiscovery');
  const metricsView = document.getElementById('viewMetrics');
  const btnWorkspace = document.getElementById('tabBtnWorkspace');
  const btnDiscovery = document.getElementById('tabBtnDiscovery');
  const btnMetrics = document.getElementById('tabBtnMetrics');

  const activeClass = 'px-3.5 py-1 rounded-md text-xs font-medium flex items-center gap-2 transition bg-white/[0.05] text-gold border border-gold/20';
  const inactiveClass = 'px-3.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white flex items-center gap-2 transition';

  if (workspaceView) workspaceView.classList.add('hidden');
  if (discoveryView) discoveryView.classList.add('hidden');
  if (metricsView) metricsView.classList.add('hidden');

  if (btnWorkspace) btnWorkspace.className = inactiveClass;
  if (btnDiscovery) btnDiscovery.className = inactiveClass;
  if (btnMetrics) btnMetrics.className = inactiveClass;

  if (view === 'workspace') {
    if (workspaceView) workspaceView.classList.remove('hidden');
    if (btnWorkspace) btnWorkspace.className = activeClass;
  } else if (view === 'discovery') {
    if (discoveryView) discoveryView.classList.remove('hidden');
    if (btnDiscovery) btnDiscovery.className = activeClass;
    loadDiscoveryServices();
  } else if (view === 'metrics') {
    if (metricsView) metricsView.classList.remove('hidden');
    if (btnMetrics) btnMetrics.className = activeClass;
  }

  if (window.lucide) lucide.createIcons();
}

// =================================================================
// 12b. DESCUBRIMIENTO & PROSPECCIÓN IA MULTI-FUENTE
// =================================================================
let currentDiscoveredLeads = [];
let scrapeTimerInterval = null;

async function loadDiscoveryServices() {
  const select = document.getElementById('previewServiceSelect');
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
    console.warn('Error cargando servicios de prospección:', err);
  }
}

async function handleGenerateScrapeStrategy() {
  const nicheInput = document.getElementById('discoveryNicheInput');
  const locationInput = document.getElementById('discoveryLocationInput');
  const btn = document.getElementById('btnGenerateStrategy');
  const resultBox = document.getElementById('strategyResultBox');

  const niche = nicheInput ? nicheInput.value.trim() : '';
  const location = locationInput ? locationInput.value.trim() : 'Lima, Peru';

  if (!niche) {
    alert('Por favor ingresa un nicho o sector objetivo (ej: Estudios de abogados corporativos).');
    if (nicheInput) nicheInput.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Diseñando Estrategia...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/client/scrape/suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ niche, location })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al generar sugerencia');

    const badge = document.getElementById('strategySourceBadge');
    const maxLeadsEl = document.getElementById('strategyMaxLeadsText');
    const explanationEl = document.getElementById('strategyExplanationText');
    const angleEl = document.getElementById('strategyAngleText');
    const queriesContainer = document.getElementById('strategyQueriesContainer');

    const sourceLabels = {
      google_maps: '🗺️ Google Maps (Locales)',
      meta_ads: '📢 Meta Ads Library (Con Pauta)',
      instagram: '📸 Instagram Business',
      multi_source: '🎯 Multi-Fuente (Maps + Ads)'
    };

    if (badge) {
      badge.textContent = sourceLabels[data.recommendedSource] || data.recommendedSource;
    }
    if (maxLeadsEl) maxLeadsEl.textContent = `${data.recommendedMaxLeads} prospectos`;
    if (explanationEl) explanationEl.textContent = data.sourceExplanation;
    if (angleEl) angleEl.textContent = data.commercialAngle;

    const sourceSelect = document.getElementById('scrapeSourceSelect');
    if (sourceSelect) sourceSelect.value = data.recommendedSource;

    const maxResultsSelect = document.getElementById('scrapeMaxResultsSelect');
    if (maxResultsSelect) maxResultsSelect.value = String(data.recommendedMaxLeads);

    if (queriesContainer) {
      queriesContainer.innerHTML = '';
      (data.suggestedQueries || []).forEach(q => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'px-3 py-1.5 rounded-lg text-xs font-mono transition bg-white/[0.04] hover:bg-gold/15 text-slate-200 hover:text-gold border border-white/[0.08] hover:border-gold/30 flex items-center gap-1.5 cursor-pointer';
        chip.innerHTML = `<i data-lucide="arrow-right" class="w-3 h-3 text-gold"></i><span>${escapeHtml(q)}</span>`;
        chip.onclick = () => {
          const queryInput = document.getElementById('scrapeQueryInput');
          if (queryInput) {
            queryInput.value = q;
            queryInput.classList.add('border-gold');
            setTimeout(() => queryInput.classList.remove('border-gold'), 1200);
            queryInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        };
        queriesContainer.appendChild(chip);
      });
    }

    if (data.suggestedQueries && data.suggestedQueries.length > 0) {
      const queryInput = document.getElementById('scrapeQueryInput');
      if (queryInput && !queryInput.value.trim()) {
        queryInput.value = data.suggestedQueries[0];
      }
    }

    if (resultBox) resultBox.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    alert('Error al diseñar estrategia con IA: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="brain-circuit" class="w-4 h-4"></i><span>Diseñar Estrategia con IA</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handleExecuteScraping() {
  const queryInput = document.getElementById('scrapeQueryInput');
  const sourceSelect = document.getElementById('scrapeSourceSelect');
  const maxResultsSelect = document.getElementById('scrapeMaxResultsSelect');
  const locationInput = document.getElementById('discoveryLocationInput');
  const btn = document.getElementById('btnExecuteScrape');
  const progressBox = document.getElementById('scrapeProgressBox');
  const progressTimer = document.getElementById('scrapeProgressTimer');
  const previewCard = document.getElementById('scrapePreviewCard');

  const query = queryInput ? queryInput.value.trim() : '';
  const source = sourceSelect ? sourceSelect.value : 'google_maps';
  const maxResults = maxResultsSelect ? parseInt(maxResultsSelect.value, 10) : 15;
  const location = locationInput ? locationInput.value.trim() : 'Lima, Peru';

  if (!query) {
    alert('Por favor ingresa un término de búsqueda (ej: clinicas odontologicas surco).');
    if (queryInput) queryInput.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }

  if (progressBox) progressBox.classList.remove('hidden');
  if (previewCard) previewCard.classList.add('hidden');

  let seconds = 0;
  if (progressTimer) progressTimer.textContent = '0s';
  if (scrapeTimerInterval) clearInterval(scrapeTimerInterval);
  scrapeTimerInterval = setInterval(() => {
    seconds++;
    if (progressTimer) progressTimer.textContent = `${seconds}s`;
  }, 1000);

  try {
    const res = await fetch('/api/client/scrape/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ source, query, location, maxResults, countryCode: 'pe' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al ejecutar scraping');

    currentDiscoveredLeads = data.leads || [];
    renderScrapedLeadsPreview(currentDiscoveredLeads);

    if (previewCard) {
      previewCard.classList.remove('hidden');
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

  } catch (err) {
    alert('Error al ejecutar scraping en Apify: ' + err.message);
  } finally {
    if (scrapeTimerInterval) {
      clearInterval(scrapeTimerInterval);
      scrapeTimerInterval = null;
    }
    if (progressBox) progressBox.classList.add('hidden');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

function renderScrapedLeadsPreview(leads) {
  const tbody = document.getElementById('scrapePreviewTableBody');
  const countBadge = document.getElementById('previewCountBadge');
  const selectAll = document.getElementById('previewSelectAllCheckbox');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (selectAll) selectAll.checked = true;

  if (countBadge) {
    const newCount = leads.filter(l => !l.alreadyInDatabase && !!l.phoneClean).length;
    countBadge.textContent = `${leads.length} encontrados (${newCount} nuevos para importar)`;
  }

  if (leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-500 font-mono">
          No se obtuvieron registros para esta búsqueda. Prueba modificando el término o la fuente.
        </td>
      </tr>
    `;
    updateInjectButtonCount();
    return;
  }

  leads.forEach((l, idx) => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-white/[0.02] transition ${l.alreadyInDatabase ? 'opacity-50' : ''}`;

    const isSelectable = !l.alreadyInDatabase && !!l.phoneClean;
    const isChecked = isSelectable && l.selected !== false;

    const webHtml = l.website 
      ? `<a href="${escapeHtml(l.website)}" target="_blank" class="text-gold hover:underline font-mono text-[11px] truncate max-w-[180px] inline-block">${escapeHtml(l.website.replace(/^https?:\/\/(www\.)?/, ''))}</a>`
      : '<span class="text-slate-600 font-mono">---</span>';

    const statusBadge = l.alreadyInDatabase
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-white/[0.06]">Ya Registrado</span>'
      : (l.phoneClean ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Listo</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-400">Sin Celular</span>');

    tr.innerHTML = `
      <td class="p-3">
        <input 
          type="checkbox" 
          ${isChecked ? 'checked' : ''} 
          ${!isSelectable ? 'disabled' : ''} 
          onchange="toggleLeadSelection(${idx}, this.checked)"
          class="rounded bg-obsidian border-white/[0.2] text-gold focus:ring-0 cursor-pointer"
        >
      </td>
      <td class="p-3 font-medium text-slate-200">${escapeHtml(l.title)}</td>
      <td class="p-3 font-mono text-xs ${l.phoneClean ? 'text-gold' : 'text-slate-500'}">${escapeHtml(l.phone || 'No detectado')}</td>
      <td class="p-3">${webHtml}</td>
      <td class="p-3 text-slate-400 truncate max-w-[200px]">${escapeHtml(l.address || l.categoryName || '---')}</td>
      <td class="p-3 text-right">${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });

  updateInjectButtonCount();
  if (window.lucide) lucide.createIcons();
}

function toggleLeadSelection(idx, isChecked) {
  if (currentDiscoveredLeads[idx]) {
    currentDiscoveredLeads[idx].selected = isChecked;
  }
  updateInjectButtonCount();
}

function toggleSelectAllPreview(isChecked) {
  currentDiscoveredLeads.forEach(l => {
    if (!l.alreadyInDatabase && !!l.phoneClean) {
      l.selected = isChecked;
    }
  });
  renderScrapedLeadsPreview(currentDiscoveredLeads);
}

function updateInjectButtonCount() {
  const selectedCount = currentDiscoveredLeads.filter(l => l.selected && !l.alreadyInDatabase && !!l.phoneClean).length;
  const btnCount = document.getElementById('btnInjectCount');
  const btn = document.getElementById('btnInjectApproved');
  if (btnCount) btnCount.textContent = selectedCount;
  if (btn) btn.disabled = selectedCount === 0;
}

async function handleInjectApprovedLeads() {
  const selected = currentDiscoveredLeads.filter(l => l.selected && !l.alreadyInDatabase && !!l.phoneClean);
  if (selected.length === 0) {
    alert('No hay prospectos válidos seleccionados para importar.');
    return;
  }

  const serviceSelect = document.getElementById('previewServiceSelect');
  const serviceId = serviceSelect ? serviceSelect.value : 'licitaciones-qp';

  const btn = document.getElementById('btnInjectApproved');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Inyectando al Pipeline...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const leadsPayload = selected.map(l => ({
      name: l.title,
      phone: l.phoneClean,
      website: l.website,
      address: l.address
    }));

    const res = await fetch('/api/client/leads/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ serviceId, leads: leadsPayload })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error importando leads');

    alert(`✅ ${data.inserted} prospectos inyectados exitosamente a la campaña "${serviceId}".\n\nQuedan listos en estado "Por Contactar" para su prospección escalonada.`);

    selected.forEach(l => {
      l.alreadyInDatabase = true;
      l.selected = false;
    });
    renderScrapedLeadsPreview(currentDiscoveredLeads);

    fetchOverview();

  } catch (err) {
    alert('Error inyectando prospectos: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="user-plus" class="w-4 h-4"></i><span>Inyectar al Pipeline (<span id="btnInjectCount">0</span>)</span>';
      updateInjectButtonCount();
      if (window.lucide) lucide.createIcons();
    }
  }
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

      if (event.type === 'lead_updated' || event.type === 'appointment_booked' || event.type === 'meeting_attendance_updated' || event.type === 'settings_updated' || event.type === 'whatsapp_disconnected') {
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

// =================================================================
// 16. ONBOARDING & ACTIVACIÓN RÁPIDA (LINEAR STYLE)
// =================================================================
function toggleOnboardingBanner(show) {
  const banner = document.getElementById('onboardingBanner');
  if (!banner) return;
  if (show === false) {
    banner.classList.add('hidden');
    localStorage.setItem('qp_hide_onboarding', 'true');
  } else {
    banner.classList.remove('hidden');
    localStorage.removeItem('qp_hide_onboarding');
  }
}

function updateOnboardingBanner(data) {
  const banner = document.getElementById('onboardingBanner');
  if (!banner) return;

  if (localStorage.getItem('qp_hide_onboarding') === 'true') {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');

  const step1Done = Boolean(data?.isWhatsAppReady);
  const step2Done = Boolean(data?.serviceName && data.serviceName.length > 0);
  const step3Done = Boolean(data?.metrics?.totalLeads && data.metrics.totalLeads > 0);
  const step4Done = Boolean(
    (data?.activeChats && data.activeChats.length > 0) ||
    (data?.metrics && (data.metrics.replied > 0 || data.metrics.outreachSent > 0))
  );

  const steps = [
    { elId: 'stepWhatsApp', iconId: 'stepWhatsAppIcon', num: 1, done: step1Done },
    { elId: 'stepService', iconId: 'stepServiceIcon', num: 2, done: step2Done },
    { elId: 'stepLeads', iconId: 'stepLeadsIcon', num: 3, done: step3Done },
    { elId: 'stepChat', iconId: 'stepChatIcon', num: 4, done: step4Done }
  ];

  let completedCount = 0;

  steps.forEach(s => {
    const el = document.getElementById(s.elId);
    const iconEl = document.getElementById(s.iconId);
    if (!el || !iconEl) return;

    if (s.done) {
      completedCount++;
      el.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium cursor-pointer transition hover:bg-emerald-500/15';
      iconEl.className = 'w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold';
      iconEl.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i>';
    } else {
      el.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.06] bg-obsidian/60 text-slate-400 cursor-pointer hover:border-gold/30 transition';
      iconEl.className = 'w-4 h-4 rounded-full border border-slate-600 flex items-center justify-center text-[9px] font-mono text-slate-400';
      iconEl.innerHTML = `<span>${s.num}</span>`;
    }
  });

  const pct = Math.round((completedCount / 4) * 100);
  const badge = document.getElementById('onboardingProgressBadge');
  if (badge) {
    badge.textContent = `${completedCount}/4 (${pct}%)`;
    if (completedCount === 4) {
      badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold';
    } else {
      badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30 font-semibold';
    }
  }

  if (window.lucide) lucide.createIcons();
}

// =================================================================
// 17. MODAL CENTRAL DE CONFIGURACIÓN & ANTI-BANEO
// =================================================================
let settingsQrRefreshInterval = null;

async function openSettingsModal(initialTab = 'whatsapp') {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;

  switchSettingsTab(initialTab);
  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();

  await loadSettingsData();
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('hidden');
  if (settingsQrRefreshInterval) {
    clearInterval(settingsQrRefreshInterval);
    settingsQrRefreshInterval = null;
  }
}

function switchSettingsTab(tabName) {
  const tabs = ['whatsapp', 'team', 'ai', 'antiban'];
  tabs.forEach(t => {
    const btn = document.getElementById(`settingsTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`settingsTabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);

    if (t === tabName) {
      if (btn) {
        btn.className = 'px-4 py-2.5 text-xs font-mono border-b-2 border-gold text-gold font-medium flex items-center gap-2 transition flex-shrink-0';
      }
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) {
        btn.className = 'px-4 py-2.5 text-xs font-mono border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-medium flex items-center gap-2 transition flex-shrink-0';
      }
      if (content) content.classList.add('hidden');
    }
  });

  if (tabName === 'whatsapp') {
    refreshSettingsQr();
    if (!settingsQrRefreshInterval) {
      settingsQrRefreshInterval = setInterval(() => {
        const modal = document.getElementById('settingsModal');
        if (modal && !modal.classList.contains('hidden')) {
          refreshSettingsQr();
        }
      }, 10000);
    }
  } else {
    if (settingsQrRefreshInterval) {
      clearInterval(settingsQrRefreshInterval);
      settingsQrRefreshInterval = null;
    }
  }

  if (window.lucide) lucide.createIcons();
}

function refreshSettingsQr() {
  const img = document.getElementById('settingsQrImage');
  if (img) {
    img.src = `/api/client/qr?t=${Date.now()}`;
  }
}

// -----------------------------------------------------------------
// Gestión de Equipo & Round Robin (1 a N Asesores)
// -----------------------------------------------------------------
function renderTeamRepsList() {
  const container = document.getElementById('teamRepsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!currentTeamReps || currentTeamReps.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-500 font-mono bg-obsidian rounded-xl border border-white/[0.04]">
        No hay asesores configurados. Agrega uno o selecciona un preset (1 a 5 vendedores).
      </div>
    `;
    return;
  }

  currentTeamReps.forEach((rep, index) => {
    const row = document.createElement('div');
    row.className = `p-3 rounded-xl border ${rep.isActive ? 'border-white/[0.08] bg-obsidian' : 'border-white/[0.04] bg-obsidian/40 opacity-60'} space-y-2 transition`;

    row.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <label class="relative flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              ${rep.isActive ? 'checked' : ''} 
              onchange="toggleRepActive(${index})"
              class="sr-only peer"
            />
            <div class="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-gold"></div>
          </label>
          <span class="text-xs font-mono font-medium text-white">${rep.isActive ? 'Activo (Recibe Leads)' : 'En Pausa'}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
            ${rep.leadsAssignedCount || 0} leads
          </span>
          <button 
            type="button" 
            onclick="removeTeamRep(${index})" 
            class="text-slate-500 hover:text-rose-400 p-1 rounded transition" 
            title="Eliminar asesor"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-mono text-slate-400 mb-0.5">Nombre del Asesor</label>
          <input 
            type="text" 
            value="${escapeHtml(rep.name || '')}" 
            placeholder="Ej: Kenneth (Director)"
            oninput="updateTeamRepField(${index}, 'name', this.value)"
            class="w-full bg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-gold"
          />
        </div>
        <div>
          <label class="block text-[10px] font-mono text-slate-400 mb-0.5">WhatsApp Alertas (519...)</label>
          <input 
            type="text" 
            value="${escapeHtml(rep.phone || '')}" 
            placeholder="Ej: 51902105668"
            oninput="updateTeamRepField(${index}, 'phone', this.value)"
            class="w-full bg-surface border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-gold"
          />
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  if (window.lucide) lucide.createIcons();
}

function addTeamRepSlot() {
  currentTeamReps.push({
    id: 'rep_' + Date.now(),
    name: '',
    phone: '',
    isActive: true,
    leadsAssignedCount: 0
  });
  renderTeamRepsList();
}

function removeTeamRep(index) {
  if (confirm(`¿Deseas eliminar este asesor del equipo Round Robin?`)) {
    currentTeamReps.splice(index, 1);
    renderTeamRepsList();
  }
}

function toggleRepActive(index) {
  if (currentTeamReps[index]) {
    currentTeamReps[index].isActive = !currentTeamReps[index].isActive;
    renderTeamRepsList();
  }
}

function updateTeamRepField(index, field, value) {
  if (currentTeamReps[index]) {
    if (field === 'phone') {
      currentTeamReps[index].phone = value.replace(/[^0-9]/g, '');
    } else {
      currentTeamReps[index][field] = value.trim();
    }
  }
}

function setTeamRepsCount(n) {
  const defaultNames = ['Kenneth (Director)', 'Asesor Comercial 2', 'Asesor Comercial 3', 'Asesor Comercial 4', 'Asesor Comercial 5'];
  
  if (currentTeamReps.length < n) {
    const toAdd = n - currentTeamReps.length;
    for (let i = 0; i < toAdd; i++) {
      const idx = currentTeamReps.length;
      currentTeamReps.push({
        id: 'rep_' + Date.now() + '_' + idx,
        name: defaultNames[idx] || `Asesor ${idx + 1}`,
        phone: '',
        isActive: true,
        leadsAssignedCount: 0
      });
    }
  } else if (currentTeamReps.length > n) {
    if (confirm(`Tienes ${currentTeamReps.length} asesores configurados. ¿Deseas ajustar la lista a ${n}?`)) {
      currentTeamReps = currentTeamReps.slice(0, n);
    }
  }
  renderTeamRepsList();
}

// -----------------------------------------------------------------
// Configuración de Proveedores de IA (LLMs)
// -----------------------------------------------------------------
function handleAiProviderChange(provider) {
  const modelSelect = document.getElementById('settingAiModel');
  const keyInput = document.getElementById('settingAiApiKey');
  if (!modelSelect) return;

  if (provider === 'gemini') {
    if (keyInput) keyInput.placeholder = 'AIzaSy... (Google AI Studio API Key)';
    modelSelect.innerHTML = `
      <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Ultra Rápido y Económico - Recomendado)</option>
      <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Gran estabilidad)</option>
      <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Máxima capacidad de razonamiento)</option>
    `;
  } else if (provider === 'openai') {
    if (keyInput) keyInput.placeholder = 'sk-... (OpenAI Platform API Key)';
    modelSelect.innerHTML = `
      <option value="gpt-4o-mini">OpenAI GPT-4o-mini (Rápido y Estable - Recomendado)</option>
      <option value="gpt-4o">OpenAI GPT-4o (Máxima inteligencia)</option>
    `;
  } else {
    // openrouter
    if (keyInput) keyInput.placeholder = 'sk-or-v1-... (OpenRouter API Key)';
    modelSelect.innerHTML = `
      <option value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash (Ultra Rápido y Económico - Recomendado)</option>
      <option value="anthropic/claude-3.5-sonnet">Anthropic Claude 3.5 Sonnet (Máxima Calidad de Redacción B2B)</option>
      <option value="openai/gpt-4o-mini">OpenAI GPT-4o-mini (Rápido y Estable)</option>
      <option value="deepseek/deepseek-chat">DeepSeek V3 (Excelente relación calidad/costo)</option>
    `;
  }
}

function toggleAiKeyVisibility() {
  const keyInput = document.getElementById('settingAiApiKey');
  const icon = document.getElementById('aiKeyVisibilityIcon');
  if (!keyInput) return;

  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    keyInput.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

async function handleTestAiConnection() {
  const provider = document.getElementById('settingAiProvider')?.value || 'openrouter';
  const apiKey = document.getElementById('settingAiApiKey')?.value || '';
  const model = document.getElementById('settingAiModel')?.value || '';
  const btn = document.getElementById('testAiBtn');
  const btnText = document.getElementById('testAiBtnText');
  const badge = document.getElementById('aiTestResultBadge');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Probando inferencia...';
  if (badge) {
    badge.className = 'text-xs font-mono text-gold flex items-center gap-1';
    badge.innerHTML = '<i data-lucide="loader" class="w-3 h-3 animate-spin"></i><span>Conectando...</span>';
    badge.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/client/ai/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ provider, apiKey, model })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      if (badge) {
        badge.className = 'text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
        badge.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i><span>Conectado (${data.latencyMs}ms)</span>`;
      }
    } else {
      if (badge) {
        badge.className = 'text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
        badge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>${escapeHtml(data.error || 'Error de conexión')}</span>`;
      }
    }
  } catch (err) {
    if (badge) {
      badge.className = 'text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
      badge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>${escapeHtml(err.message)}</span>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Probar Conexión IA';
    if (window.lucide) lucide.createIcons();
  }
}

// -----------------------------------------------------------------
// Cargar y Guardar Configuración Consolidada
// -----------------------------------------------------------------
async function loadSettingsData() {
  if (!currentPin) return;

  try {
    const res = await fetch('/api/client/settings', {
      headers: { 'x-client-pin': currentPin }
    });
    if (!res.ok) return;

    const data = await res.json();
    const settings = data.settings || {};
    const wa = data.whatsapp || {};

    // Poblado Anti-Baneo
    const startHourEl = document.getElementById('settingStartHour');
    const endHourEl = document.getElementById('settingEndHour');
    const minDelayEl = document.getElementById('settingMinDelay');
    const maxDelayEl = document.getElementById('settingMaxDelay');
    const dailyLimitEl = document.getElementById('settingDailyLimit');
    const adminPhoneEl = document.getElementById('settingAdminPhone');

    if (startHourEl) startHourEl.value = settings.startHour ?? 9;
    if (endHourEl) endHourEl.value = settings.endHour ?? 19;
    if (minDelayEl) minDelayEl.value = settings.minDelaySeconds ?? 180;
    if (maxDelayEl) maxDelayEl.value = settings.maxDelaySeconds ?? 300;
    if (dailyLimitEl) dailyLimitEl.value = settings.dailyLimit ?? 15;
    if (adminPhoneEl) adminPhoneEl.value = settings.adminWhatsAppPhone || '';

    // Poblado Equipo Round Robin
    if (settings.salesReps && Array.isArray(settings.salesReps)) {
      currentTeamReps = settings.salesReps;
    } else if (data.salesReps && Array.isArray(data.salesReps)) {
      currentTeamReps = data.salesReps;
    }
    renderTeamRepsList();

    // Poblado IA & LLMs
    const aiProviderEl = document.getElementById('settingAiProvider');
    const aiApiKeyEl = document.getElementById('settingAiApiKey');
    const aiModelEl = document.getElementById('settingAiModel');
    const aiKeyStatusBadge = document.getElementById('aiKeyStatusBadge');

    if (aiProviderEl && settings.aiProvider) {
      aiProviderEl.value = settings.aiProvider;
      handleAiProviderChange(settings.aiProvider);
    }
    if (aiModelEl && settings.aiModel) {
      aiModelEl.value = settings.aiModel;
    }
    if (aiApiKeyEl) {
      if (settings.aiApiKey) {
        aiApiKeyEl.value = settings.aiApiKey;
        if (aiKeyStatusBadge) {
          aiKeyStatusBadge.textContent = 'API Key Configurada';
          aiKeyStatusBadge.className = 'text-[10px] font-mono text-emerald-400 font-semibold';
        }
      } else {
        aiApiKeyEl.value = '';
        if (aiKeyStatusBadge) {
          aiKeyStatusBadge.textContent = 'Usando Playbook Heurístico';
          aiKeyStatusBadge.className = 'text-[10px] font-mono text-slate-500';
        }
      }
    }

    // Estado WhatsApp
    const cardConnected = document.getElementById('settingsWaCardConnected');
    const cardDisconnected = document.getElementById('settingsWaCardDisconnected');
    const phoneEl = document.getElementById('settingsWaConnectedPhone');

    if (wa.isReady) {
      if (cardConnected) cardConnected.classList.remove('hidden');
      if (cardDisconnected) cardDisconnected.classList.add('hidden');
      if (phoneEl) {
        phoneEl.textContent = wa.connectedPhone ? `+${wa.connectedPhone}` : 'Conexión Activa';
      }
    } else {
      if (cardConnected) cardConnected.classList.add('hidden');
      if (cardDisconnected) cardDisconnected.classList.remove('hidden');
      refreshSettingsQr();
    }
  } catch (err) {
    console.error('Error cargando configuración:', err);
  }
}

async function handleSaveSettings() {
  if (!currentPin) return;

  const btn = document.getElementById('saveSettingsBtn');
  const btnText = document.getElementById('saveSettingsBtnText');
  const alertBox = document.getElementById('settingsAlertBox');

  const startHour = parseInt(document.getElementById('settingStartHour')?.value || '9', 10);
  const endHour = parseInt(document.getElementById('settingEndHour')?.value || '19', 10);
  const minDelaySeconds = parseInt(document.getElementById('settingMinDelay')?.value || '180', 10);
  const maxDelaySeconds = parseInt(document.getElementById('settingMaxDelay')?.value || '300', 10);
  const dailyLimit = parseInt(document.getElementById('settingDailyLimit')?.value || '15', 10);
  const adminWhatsAppPhone = document.getElementById('settingAdminPhone')?.value || '';

  const aiProvider = document.getElementById('settingAiProvider')?.value || 'openrouter';
  const aiApiKey = document.getElementById('settingAiApiKey')?.value || '';
  const aiModel = document.getElementById('settingAiModel')?.value || '';

  if (minDelaySeconds < 60) {
    alert('Por seguridad anti-baneo, el delay mínimo no puede ser menor a 60 segundos.');
    return;
  }

  // Filtrar asesores válidos (con nombre)
  const validReps = currentTeamReps.filter(r => r.name && r.name.trim().length > 0);

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Guardando...';
  if (alertBox) alertBox.classList.add('hidden');

  try {
    const res = await fetch('/api/client/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        startHour,
        endHour,
        minDelaySeconds,
        maxDelaySeconds,
        dailyLimit,
        adminWhatsAppPhone,
        salesReps: validReps,
        aiProvider,
        aiApiKey,
        aiModel
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 block';
        alertBox.textContent = '✅ Configuración y equipo guardados en PostgreSQL correctamente.';
      }
      setTimeout(() => {
        if (alertBox) alertBox.classList.add('hidden');
      }, 3500);
      fetchOverview();
    } else {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-mono bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        alertBox.textContent = data.error || 'Error al guardar configuración.';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-mono bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Error de comunicación con el servidor.';
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Guardar Configuración';
    if (window.lucide) lucide.createIcons();
  }
}

async function handleDisconnectWhatsApp() {
  if (!confirm('⚠️ ¿Estás seguro de desvincular el WhatsApp actual?\n\nLa sesión satélite activa se cerrará y se generará inmediatamente un nuevo código QR para vincular otra línea.')) {
    return;
  }

  try {
    const res = await fetch('/api/client/whatsapp/disconnect', {
      method: 'POST',
      headers: { 'x-client-pin': currentPin }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('✅ Sesión de WhatsApp desvinculada. Puedes escanear un nuevo número a continuación.');
      await loadSettingsData();
      fetchOverview();
    } else {
      alert('Error: ' + (data.error || 'No se pudo desvincular WhatsApp.'));
    }
  } catch (err) {
    alert('Error al comunicar la desvinculación con el servidor.');
  }
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
