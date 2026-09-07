// State Management
let currentPin = sessionStorage.getItem('qp_client_pin') || '';
let currentOverviewData = null;
let activeChatPhone = null;
let selectedRepFilter = 'ALL';
let eventSource = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  checkAuth();
});

// 1. Autenticación por PIN
function checkAuth() {
  if (currentPin) {
    document.getElementById('pinModal').classList.add('hidden');
    fetchOverview();
    initSSE();
  } else {
    document.getElementById('pinModal').classList.remove('hidden');
    document.getElementById('pinInput').focus();
  }
}

async function handlePinSubmit(e) {
  e.preventDefault();
  const pin = document.getElementById('pinInput').value.trim();
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
    btn.innerHTML = '<span>Acceder al Tablero</span><i data-lucide="arrow-right" class="w-4 h-4"></i>';
    lucide.createIcons();
  }
}

// 2. Carga del Overview consolidado
async function fetchOverview() {
  if (!currentPin) return;

  try {
    const res = await fetch('/api/client/overview', {
      headers: {
        'x-client-pin': currentPin
      }
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
    renderKanban(data.kanban);
    renderChatsList(data.activeChats);
    renderMetrics(data);
    renderReps(data.salesReps);
  } catch (err) {
    console.error('Error cargando overview:', err);
  }
}

// 3. Render Header y Estado de WhatsApp
function renderHeader(data) {
  document.getElementById('headerCompanyName').textContent = data.companyName || 'Empresa B2B';
  document.getElementById('headerServiceName').textContent = data.serviceName || 'Departamento Comercial Autónomo';

  const waBadge = document.getElementById('waStatusBadge');
  const waText = document.getElementById('waStatusText');

  if (data.isWhatsAppReady) {
    waBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium cursor-pointer';
    waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>WhatsApp Conectado</span>';
  } else {
    waBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium cursor-pointer';
    waBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span><span>Reconectar WhatsApp</span>';
  }

  // Llenar selector de representantes si cambió
  const repSelect = document.getElementById('repFilterSelect');
  const currentVal = repSelect.value;
  repSelect.innerHTML = '<option value="ALL">👥 Todos los Vendedores</option>';
  if (data.salesReps && data.salesReps.length > 0) {
    data.salesReps.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = `👤 ${r.name}`;
      repSelect.appendChild(opt);
    });
  }
  repSelect.value = currentVal || 'ALL';
}

// 4. Render Pipeline Kanban
function renderKanban(kanban) {
  if (!kanban) return;

  const cols = [
    { key: 'discovered', el: 'col_discovered', countEl: 'badgeCount_discovered' },
    { key: 'outreachSent', el: 'col_outreachSent', countEl: 'badgeCount_outreachSent' },
    { key: 'replied', el: 'col_replied', countEl: 'badgeCount_replied' },
    { key: 'qualified', el: 'col_qualified', countEl: 'badgeCount_qualified' },
    { key: 'closedWon', el: 'col_closedWon', countEl: 'badgeCount_closedWon' },
    { key: 'humanTakeover', el: 'col_humanTakeover', countEl: 'badgeCount_humanTakeover' }
  ];

  let totalVisible = 0;

  cols.forEach(({ key, el, countEl }) => {
    const list = kanban[key] || [];
    const container = document.getElementById(el);
    container.innerHTML = '';

    const filtered = list.filter(lead => {
      if (selectedRepFilter !== 'ALL' && lead.assignedRepName !== selectedRepFilter) {
        return false;
      }
      return true;
    });

    totalVisible += filtered.length;
    document.getElementById(countEl).textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-4 text-center text-xs text-gray-600 italic">Sin prospectos</div>`;
      return;
    }

    filtered.forEach(lead => {
      const card = createKanbanCard(lead);
      container.appendChild(card);
    });
  });

  document.getElementById('kanbanTotalBadge').textContent = `${totalVisible} prospectos visibles`;
  lucide.createIcons();
}

function createKanbanCard(lead) {
  const div = document.createElement('div');
  div.className = 'bg-subpanel/90 border border-gray-800 hover:border-amber-500/40 rounded-xl p-3.5 shadow-sm transition duration-150 cursor-pointer';
  div.onclick = (e) => {
    if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON') {
      openChatWithLead(lead.phone);
    }
  };

  const repTag = lead.assignedRepName 
    ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">👤 ${lead.assignedRepName}</span>`
    : '';

  const followUpBadge = (lead.followUpCount && lead.followUpCount > 0)
    ? `<span class="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">F-Up #${lead.followUpCount}</span>`
    : '';

  let attendanceSection = '';
  if (lead.status === 'QUALIFIED' || lead.status === 'MEETING_SCHEDULED' || lead.meetingAttendanceStatus) {
    if (lead.meetingAttendanceStatus === 'ATTENDED') {
      attendanceSection = `
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-emerald-900/40 bg-emerald-950/20 px-2 py-1 rounded-lg">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">✓ Asistió a la Cita</span>
          <button onclick="setMeetingAttendance('${lead.phone}', 'NO_SHOW')" title="Marcar como No-Show" class="text-[9px] text-gray-400 hover:text-rose-400 underline transition">Cambiar</button>
        </div>
      `;
    } else if (lead.meetingAttendanceStatus === 'NO_SHOW') {
      attendanceSection = `
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-rose-900/40 bg-rose-950/20 px-2 py-1 rounded-lg">
          <span class="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300">✗ No-Show (Inasistencia)</span>
          <button onclick="setMeetingAttendance('${lead.phone}', 'ATTENDED')" title="Marcar como Asistió" class="text-[9px] text-gray-400 hover:text-emerald-400 underline transition">Cambiar</button>
        </div>
      `;
    } else {
      attendanceSection = `
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/60">
          <span class="text-[10px] text-gray-400 font-medium">¿Asistencia?</span>
          <div class="flex items-center gap-1">
            <button onclick="setMeetingAttendance('${lead.phone}', 'ATTENDED')" class="px-2 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-semibold flex items-center gap-0.5 transition">✓ Asistió</button>
            <button onclick="setMeetingAttendance('${lead.phone}', 'NO_SHOW')" class="px-2 py-0.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded text-[10px] font-semibold flex items-center gap-0.5 transition">✗ No-Show</button>
          </div>
        </div>
      `;
    }
  }

  div.innerHTML = `
    <div class="flex items-start justify-between gap-2 mb-1.5">
      <h4 class="font-semibold text-xs text-gray-100 line-clamp-1 leading-snug">${escapeHtml(lead.companyName)}</h4>
      ${followUpBadge}
    </div>
    <div class="text-[11px] text-gray-400 font-mono mb-2 flex items-center justify-between">
      <span>+${lead.phone}</span>
      ${repTag}
    </div>
    ${attendanceSection}
    <div class="flex items-center justify-between pt-2 border-t border-gray-800/60 text-[11px] mt-1.5">
      <button onclick="openChatWithLead('${lead.phone}')" class="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1">
        <i data-lucide="message-square" class="w-3 h-3"></i>
        <span>Ver Chat</span>
      </button>
      <select onchange="updateLeadStatus('${lead.phone}', this.value)" class="bg-obsidian border border-gray-800 text-[10px] rounded px-1.5 py-0.5 text-gray-400 focus:outline-none focus:border-amber-500">
        <option value="" disabled selected>Mover a...</option>
        <option value="DISCOVERED">Descubierto</option>
        <option value="OUTREACH_SENT">Contactado</option>
        <option value="REPLIED">Respondido</option>
        <option value="QUALIFIED">Calificado</option>
        <option value="CLOSED_WON">Cierre Ganado</option>
        <option value="HUMAN_TAKEOVER">Control Humano</option>
      </select>
    </div>
  `;
  return div;
}

// 5. Render Lista de Conversaciones
function renderChatsList(chats) {
  const container = document.getElementById('chatConversationList');
  container.innerHTML = '';

  if (!chats || chats.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-xs text-gray-500">No hay chats activos registrados aún.</div>';
    return;
  }

  chats.forEach(chat => {
    const isSelected = activeChatPhone === chat.leadPhone;
    const item = document.createElement('div');
    item.className = `p-3.5 cursor-pointer transition flex items-start gap-3 hover:bg-gray-800/40 ${isSelected ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''}`;
    item.onclick = () => openChatWithLead(chat.leadPhone);

    const timeStr = new Date(chat.lastMessageAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const repBadge = chat.assignedRepName ? `<span class="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/20">👤 ${chat.assignedRepName}</span>` : '';

    item.innerHTML = `
      <div class="w-9 h-9 rounded-full bg-subpanel border border-gray-700/60 flex items-center justify-center text-xs font-bold text-amber-400 flex-shrink-0">
        ${chat.leadName.slice(0, 2).toUpperCase()}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-0.5">
          <h4 class="font-medium text-xs text-white truncate">${escapeHtml(chat.leadName)}</h4>
          <span class="text-[10px] text-gray-500 font-mono">${timeStr}</span>
        </div>
        <p class="text-[11px] text-gray-400 truncate">${escapeHtml(chat.lastMessageSnippet || 'Conversación iniciada')}</p>
        <div class="flex items-center gap-1.5 mt-1.5">
          ${chat.isHumanTakeover ? '<span class="text-[9px] font-semibold bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded border border-purple-500/30">👤 Humano</span>' : '<span class="text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">🤖 IA Activa</span>'}
          ${repBadge}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

// 6. Abrir Chat con un Lead
async function openChatWithLead(phone) {
  activeChatPhone = phone;
  switchTab('chat');

  const container = document.getElementById('chatMessagesContainer');
  container.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-gray-500">Cargando conversación...</div>';

  try {
    const res = await fetch(`/api/client/chat/${phone}`, {
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    const lead = data.lead || {};
    document.getElementById('chatActiveName').textContent = lead.companyName || 'Prospecto';
    document.getElementById('chatActivePhone').textContent = `+${lead.phone}`;
    document.getElementById('chatActiveAvatar').textContent = (lead.companyName || 'WA').slice(0, 2).toUpperCase();

    const repBadge = document.getElementById('chatActiveRepBadge');
    if (lead.assignedRepName) {
      repBadge.textContent = `👤 ${lead.assignedRepName}`;
      repBadge.classList.remove('hidden');
    } else {
      repBadge.classList.add('hidden');
    }

    // Direct WhatsApp Web button
    const directWaBtn = document.getElementById('chatDirectWaBtn');
    directWaBtn.href = `https://wa.me/${lead.phone}`;

    // Controles de Takeover
    document.getElementById('takeoverControlContainer').classList.remove('hidden');
    document.getElementById('chatComposer').classList.remove('hidden');
    updateTakeoverUI(lead.status === 'HUMAN_TAKEOVER' || !!lead.humanTakeoverAt);

    // Activar Modo Co-Piloto (QPartner)
    const copilotPanel = document.getElementById('copilotPanel');
    if (copilotPanel) {
      copilotPanel.classList.remove('hidden');
      loadCopilotSuggestions(phone);
    }

    // Mensajes
    renderChatMessages(data.messages || []);

    // Re-render chat list to highlight selected
    if (currentOverviewData && currentOverviewData.activeChats) {
      renderChatsList(currentOverviewData.activeChats);
    }
  } catch (err) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-rose-400">Error cargando chat: ${err.message}</div>`;
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById('chatMessagesContainer');
  container.innerHTML = '';

  if (messages.length === 0) {
    container.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-gray-500">No hay mensajes previos en este chat.</div>';
    return;
  }

  messages.forEach(m => {
    const isOutbound = m.role === 'assistant' || m.role === 'human_agent';
    const bubble = document.createElement('div');
    bubble.className = `flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`;

    const timeStr = new Date(m.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const authorBadge = m.role === 'human_agent' 
      ? '<span class="text-[9px] font-semibold text-amber-400">👤 Asesor Humano</span>'
      : (m.role === 'assistant' ? '<span class="text-[9px] font-semibold text-sky-400">🤖 Agente IA</span>' : '');

    bubble.innerHTML = `
      <div class="max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-xs leading-relaxed ${
        isOutbound 
          ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 text-gray-100 rounded-tr-none' 
          : 'bg-subpanel border border-gray-800 text-gray-200 rounded-tl-none'
      }">
        <div class="flex items-center justify-between gap-4 mb-1">
          ${authorBadge}
          <span class="text-[9px] text-gray-500 font-mono">${timeStr}</span>
        </div>
        <p class="whitespace-pre-wrap select-text">${escapeHtml(m.content)}</p>
      </div>
    `;
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function updateTakeoverUI(isTakeover) {
  const btn = document.getElementById('takeoverToggleBtn');
  const textContainer = document.getElementById('takeoverStatusText');

  if (isTakeover) {
    textContainer.innerHTML = '<p class="font-medium text-amber-400">👤 Control Humano</p><p class="text-[10px] text-gray-400">El bot está pausado para este lead</p>';
    btn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 border bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30';
    btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>Reanudar Bot IA</span>';
  } else {
    textContainer.innerHTML = '<p class="font-medium text-emerald-400">🤖 Bot IA Activo</p><p class="text-[10px] text-gray-400">Responde automáticamente</p>';
    btn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20';
    btn.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i><span>Pausar Bot (Tomar Control)</span>';
  }
  lucide.createIcons();
}

// 7. Alternar Takeover
async function toggleCurrentLeadTakeover() {
  if (!activeChatPhone) return;

  try {
    const res = await fetch('/api/client/takeover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeChatPhone })
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

// 8. Enviar Mensaje Manual
async function handleSendManualMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatManualInput');
  const message = input.value.trim();
  if (!message || !activeChatPhone) return;

  input.value = '';

  try {
    const res = await fetch('/api/client/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeChatPhone, message })
    });
    const data = await res.json();
    if (res.ok) {
      // Recargar chat para ver el nuevo mensaje
      openChatWithLead(activeChatPhone);
    } else {
      alert('Error enviando mensaje: ' + data.error);
    }
  } catch (err) {
    alert('Error de red al enviar mensaje: ' + err.message);
  }
}

// 8.1. Modo Co-Piloto IA (QPartner)
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
  const panel = document.getElementById('copilotPanel');

  if (!container || !icon || !text || !panel) return;

  if (isCopilotCollapsed) {
    container.classList.add('hidden');
    panel.classList.remove('p-4');
    panel.classList.add('py-2.5', 'px-4');
    text.textContent = 'Expandir';
    icon.setAttribute('data-lucide', 'chevron-down');
  } else {
    container.classList.remove('hidden');
    panel.classList.remove('py-2.5', 'px-4');
    panel.classList.add('p-4');
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
    <div class="col-span-full py-4 flex items-center justify-center gap-2 text-xs text-amber-400">
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
      <div class="col-span-full py-2 text-center text-xs text-rose-400">
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
    container.innerHTML = '<div class="col-span-full text-center text-xs text-gray-500 py-2">Sin sugerencias para este chat.</div>';
    return;
  }

  const badgeStyles = {
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/30'
  };

  suggestions.forEach((s, idx) => {
    const badgeClass = badgeStyles[s.badgeColor] || badgeStyles.amber;
    const card = document.createElement('div');
    card.className = 'bg-subpanel/90 border border-gray-800 hover:border-amber-500/40 rounded-xl p-3 flex flex-col justify-between transition-all duration-200 group shadow-sm';

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-[10px] font-semibold ${badgeClass} px-2 py-0.5 rounded-full border">
            ${escapeHtml(s.label)}
          </span>
          <span class="text-[9px] font-mono text-gray-500">Opción ${idx + 1}</span>
        </div>
        <p class="text-[11px] text-gray-200 leading-relaxed line-clamp-3 select-text font-normal mb-2">
          "${escapeHtml(s.text)}"
        </p>
        <p class="text-[9px] text-gray-400 italic mb-3">
          💡 ${escapeHtml(s.explanation)}
        </p>
      </div>
      <div class="flex items-center gap-2 pt-2 border-t border-gray-800/80">
        <button 
          onclick="useCopilotSuggestion(${idx})"
          class="flex-1 py-1.5 px-2 bg-panel hover:bg-gray-700 text-gray-200 hover:text-white rounded-lg text-[10px] font-medium transition flex items-center justify-center gap-1 border border-gray-700"
          title="Pegar texto en el campo para editar"
        >
          <i data-lucide="pencil" class="w-3 h-3 text-amber-400"></i>
          <span>Usar / Editar</span>
        </button>
        <button 
          onclick="sendCopilotSuggestionDirectly(${idx})"
          class="flex-1 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 hover:border-transparent rounded-lg text-[10px] font-semibold transition flex items-center justify-center gap-1 shadow-sm"
          title="Enviar de inmediato por WhatsApp"
        >
          <i data-lucide="send" class="w-3 h-3"></i>
          <span>Enviar Ya</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function refreshCopilotSuggestions() {
  if (activeChatPhone) {
    const btn = document.getElementById('copilotRefreshBtn');
    if (btn) btn.classList.add('animate-pulse');
    loadCopilotSuggestions(activeChatPhone).finally(() => {
      if (btn) btn.classList.remove('animate-pulse');
    });
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
  if (!suggestion || !activeChatPhone) return;

  const confirmed = confirm(`¿Enviar esta sugerencia táctica por WhatsApp a este prospecto?\n\n"${suggestion.text}"`);
  if (!confirmed) return;

  try {
    const res = await fetch('/api/client/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone: activeChatPhone, message: suggestion.text })
    });
    const data = await res.json();
    if (res.ok) {
      openChatWithLead(activeChatPhone);
    } else {
      alert('Error enviando mensaje: ' + data.error);
    }
  } catch (err) {
    alert('Error de red al enviar mensaje: ' + err.message);
  }
}

async function handleQuickSendDictamen() {
  if (!activeChatPhone) {
    alert('Seleccione un chat primero.');
    return;
  }

  const confirmed = confirm(
    '¿Deseas despachar el Dictamen Técnico Oficial de EsSalud Piura (CP-03) en PDF a este prospecto por WhatsApp?\n\n' +
    'Archivo: Dictamen_Tecnico_EsSalud_Piura_CP-03_LicitacionesQP.pdf\n' +
    'Destino: +' + activeChatPhone
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
        phone: activeChatPhone,
        filePathOrUrl: 'storage/assets/dictamen_licitaciones_qp_essalud_piura.pdf',
        fileName: 'Dictamen_Tecnico_EsSalud_Piura_CP-03_LicitacionesQP.pdf',
        caption: 'Estimados señores. Cumpliendo con lo coordinado, les adjuntamos el Dictamen Pericial Oficial sobre el concurso de EsSalud Piura (CP-03) elaborado por la División de Licitaciones QP. Quedamos a su disposición para cualquier aclaración técnica.'
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert('✅ Dictamen Técnico despachado exitosamente por WhatsApp.');
      openChatWithLead(activeChatPhone);
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

// 9. Actualizar Estado de Lead desde Kanban
async function updateLeadStatus(phone, status) {
  try {
    const res = await fetch('/api/client/leads/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone, status })
    });
    if (res.ok) {
      fetchOverview();
    }
  } catch (err) {
    console.error('Error actualizando estado:', err);
  }
}

// 9.1 Conciliación de Asistencia SaaR (Asistió vs No-Show)
async function setMeetingAttendance(phone, status) {
  try {
    const res = await fetch('/api/client/leads/meeting-attendance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ phone, attendanceStatus: status })
    });
    if (res.ok) {
      fetchOverview();
    } else {
      const data = await res.json();
      alert('Error actualizando asistencia: ' + (data.error || 'Desconocido'));
    }
  } catch (err) {
    console.error('Error enviando asistencia:', err);
  }
}

// 10. Métricas y KPIs
function renderMetrics(data) {
  const m = data.metrics || {};
  document.getElementById('kpiTotalContacted').textContent = m.outreachSent || 0;
  document.getElementById('kpiReplyRate').textContent = `${m.replyRatePercent || 0}%`;
  document.getElementById('kpiRepliedCount').textContent = m.replied || 0;
  document.getElementById('kpiMeetingsScheduled').textContent = m.meetingsScheduled || 0;
  document.getElementById('kpiQualified').textContent = m.qualified || 0;

  // Conciliación de Liquidación Comercial SaaR
  if (m.settlement) {
    const s = m.settlement;
    const baseEl = document.getElementById('settlementBaseRetainer');
    const feeEl = document.getElementById('settlementFeePerMeeting');
    const attCountEl = document.getElementById('settlementAttendedCount');
    const attBadgeEl = document.getElementById('settlementAttendedBadge');
    const varTotalEl = document.getElementById('settlementVariableTotal');
    const noShowBadgeEl = document.getElementById('settlementNoShowBadge');
    const grandTotalEl = document.getElementById('settlementGrandTotal');

    if (baseEl) baseEl.textContent = `${s.currency} ${(s.baseRetainer || 0).toLocaleString()}`;
    if (feeEl) feeEl.textContent = s.successFeePerMeeting || 200;
    if (attCountEl) attCountEl.textContent = m.attendedMeetings || 0;
    if (attBadgeEl) attBadgeEl.textContent = `${m.attendedMeetings || 0} validadas`;
    if (varTotalEl) varTotalEl.textContent = `${s.currency} ${(s.variableTotal || 0).toLocaleString()}`;
    if (noShowBadgeEl) noShowBadgeEl.textContent = `${m.noShowMeetings || 0} citas`;
    if (grandTotalEl) grandTotalEl.textContent = `${s.currency} ${(s.grandTotal || 0).toLocaleString()}`;
  }

  // Rampa de Calentamiento Anti-Ban
  if (m.warmup) {
    const w = m.warmup;
    const badge = document.getElementById('warmupStatusBadge');
    const s1 = document.getElementById('warmupStage1');
    const s2 = document.getElementById('warmupStage2');
    const s3 = document.getElementById('warmupStage3');

    if (s1 && s2 && s3 && badge) {
      s1.className = 'p-3 bg-subpanel rounded-xl border border-gray-800 flex items-center justify-between transition';
      s2.className = 'p-3 bg-subpanel rounded-xl border border-gray-800 flex items-center justify-between transition';
      s3.className = 'p-3 bg-subpanel rounded-xl border border-gray-800 flex items-center justify-between transition';

      if (w.isWarmupActive) {
        badge.className = 'text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400';
        badge.textContent = `🔥 Calentamiento Activo (Día ${w.currentDay}/4 - Límite: ${w.dailyLimit} msgs/día)`;

        if (w.currentDay <= 2) {
          s1.className = 'p-3 bg-sky-950/30 rounded-xl border border-sky-500/50 flex items-center justify-between transition shadow-lg shadow-sky-500/10';
        } else {
          s2.className = 'p-3 bg-amber-950/30 rounded-xl border border-amber-500/50 flex items-center justify-between transition shadow-lg shadow-amber-500/10';
        }
      } else {
        badge.className = 'text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400';
        badge.textContent = `🛡️ Línea Madura (Máxima Velocidad: ${w.dailyLimit} msgs/día)`;
        s3.className = 'p-3 bg-emerald-950/30 rounded-xl border border-emerald-500/50 flex items-center justify-between transition shadow-lg shadow-emerald-500/10';
      }
    }
  }
}

// 10.1 Copiar Desglose Formal de Liquidación SaaR al Portapapeles
function copySettlementSummary() {
  if (!currentOverviewData || !currentOverviewData.metrics) return;
  const m = currentOverviewData.metrics;
  const s = m.settlement || { baseRetainer: 2800, successFeePerMeeting: 200, variableTotal: 0, grandTotal: 2800, currency: 'S/.' };
  const company = currentOverviewData.companyName || 'Cliente B2B';
  const service = currentOverviewData.serviceName || 'Departamento Comercial Autónomo';
  const dateStr = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  const summary = `🧾 *LIQUIDACIÓN COMERCIAL SAAR - THE QUANT PARTNERS*
Periodo: ${dateStr.toUpperCase()}
Cliente: ${company}
Servicio: ${service}

1. *Base Mensual (Retainer)*: ${s.currency} ${(s.baseRetainer).toLocaleString()}
   • Incluye: Infraestructura aislada en la nube, SIM satélite blindada, Scraping B2B en Google Maps y Agente IA WhatsApp.

2. *Éxito Comercial Variable (PPQM)*:
   • Citas agendadas en calendario: ${m.meetingsScheduled || 0}
   • Citas asistidas validadas: ${m.attendedMeetings || 0} (x ${s.currency} ${s.successFeePerMeeting}/cita) = *${s.currency} ${(s.variableTotal).toLocaleString()}*
   • Inasistencias (No-Show): ${m.noShowMeetings || 0} citas (0% de cargo / S/. 0)

*TOTAL A FACTURAR: ${s.currency} ${(s.grandTotal).toLocaleString()}*

Validado transparentemente en QP Outreach Engine v2.0`;

  navigator.clipboard.writeText(summary).then(() => {
    const btn = document.getElementById('copySettlementBtn');
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i><span class="text-emerald-300">¡Copiado al Portapapeles!</span>';
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      lucide.createIcons();
    }, 3000);
  }).catch(err => {
    alert('No se pudo copiar automáticamente: ' + err.message);
  });
}

function renderReps(reps) {
  const container = document.getElementById('repsListContainer');
  container.innerHTML = '';

  if (!reps || reps.length === 0) {
    container.innerHTML = '<div class="p-4 text-xs text-gray-500">No hay representantes configurados.</div>';
    return;
  }

  reps.forEach(r => {
    const div = document.createElement('div');
    div.className = 'p-3.5 bg-subpanel rounded-xl border border-gray-800 flex items-center justify-between';
    div.innerHTML = `
      <div>
        <h4 class="font-semibold text-xs text-white">👤 ${escapeHtml(r.name)}</h4>
        <p class="text-[11px] text-gray-400 font-mono">+${r.phone}</p>
      </div>
      <a href="https://wa.me/${r.phone}" target="_blank" class="text-amber-400 hover:text-amber-300 p-1.5 rounded-lg bg-obsidian border border-gray-800">
        <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
      </a>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}

// 11. Conexión Real-Time SSE
function initSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/client/stream?pin=${currentPin}`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      console.log('⚡ [SSE Stream] Evento recibido:', event);

      if (event.type === 'new_message') {
        if (activeChatPhone && activeChatPhone === event.phone) {
          openChatWithLead(activeChatPhone);
        } else {
          const badge = document.getElementById('chatUnreadBadge');
          badge.classList.remove('hidden');
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
    console.warn('⚠️ [SSE] Conexión interrumpida. Reintentando en 5 segundos...');
  };
}

// 12. Pestañas y Filtros
function switchTab(tab) {
  const views = ['Kanban', 'Chat', 'Metrics'];
  views.forEach(v => {
    document.getElementById(`view${v}`).classList.add('hidden');
    const btn = document.getElementById(`tabBtn${v}`);
    btn.className = 'px-4 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-2 transition';
  });

  const capitalized = tab.charAt(0).toUpperCase() + tab.slice(1);
  const activeView = document.getElementById(`view${capitalized}`);
  const activeBtn = document.getElementById(`tabBtn${capitalized}`);

  if (activeView) activeView.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.className = 'px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition bg-amber-500/10 text-amber-400 border border-amber-500/20';
  }

  if (tab === 'chat') {
    document.getElementById('chatUnreadBadge').classList.add('hidden');
  }

  lucide.createIcons();
}

function applyRepFilter(val) {
  selectedRepFilter = val;
  if (currentOverviewData && currentOverviewData.kanban) {
    renderKanban(currentOverviewData.kanban);
  }
}

function filterKanbanCards(search) {
  const s = search.toLowerCase().trim();
  const cards = document.querySelectorAll('#viewKanban [class*="bg-subpanel"]');
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(s) ? 'block' : 'none';
  });
}

function filterChatList(search) {
  const s = search.toLowerCase().trim();
  const items = document.querySelectorAll('#chatConversationList > div');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(s) ? 'flex' : 'none';
  });
}

let qrRefreshInterval = null;

function checkWhatsAppModal() {
  if (currentOverviewData && currentOverviewData.isWhatsAppReady) {
    alert('✅ WhatsApp está actualmente conectado y listo para operar.');
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

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 13. CARGA MASIVA DE PROSPECTOS (CSV / BBDD)
// ==========================================
let parsedImportLeads = [];
let currentImportTab = 'csv';

async function openImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;

  // Cargar lista de servicios/campañas en el selector
  await loadImportServices();

  // Resetear estados
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
    console.warn('No se pudieron cargar servicios para importación:', err);
  }
}

function switchImportTab(tab) {
  currentImportTab = tab;
  const btnCsv = document.getElementById('importTabBtnCsv');
  const btnText = document.getElementById('importTabBtnText');
  const contentCsv = document.getElementById('importTabCsvContent');
  const contentText = document.getElementById('importTabTextContent');

  if (tab === 'csv') {
    btnCsv.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition';
    btnText.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1.5 transition';
    contentCsv.classList.remove('hidden');
    contentText.classList.add('hidden');
  } else {
    btnText.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition';
    btnCsv.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1.5 transition';
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
  document.getElementById('importFileSize').textContent = `${(file.size / 1024).toFixed(1)} KB`;
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
    // Si la primera línea tiene encabezados típicos (telefono, phone, nombre, company), la saltamos
    if (idx === 0 && (line.toLowerCase().includes('telefono') || line.toLowerCase().includes('phone') || line.toLowerCase().includes('celular'))) {
      return;
    }

    // Separadores admitidos: coma, punto y coma, tabulador
    let parts = line.split(/[;,\t]/).map(p => p.trim());
    if (parts.length === 0) return;

    // Buscar cuál de las partes parece teléfono (más de 7 dígitos numéricos)
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
      if (otherParts.length > 2) {
        if (!website && (otherParts[2].includes('.') || otherParts[2].startsWith('http'))) {
          website = otherParts[2];
        } else {
          address = address ? `${address}, ${otherParts[2]}` : otherParts[2];
        }
      }
    } else {
      invalidCount++;
      return;
    }

    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    // Quitar 0 inicial si alguien puso 09...
    if (cleanPhone.startsWith('09') && cleanPhone.length === 10) {
      cleanPhone = cleanPhone.slice(1);
    }

    // Normalizar teléfonos peruanos de 9 dígitos empezando en 9 a 519...
    if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
      cleanPhone = `51${cleanPhone}`;
    }

    // Validar celular peruano (11 dígitos comenzando en 519) o internacional válido
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
        item.className = 'p-2 bg-panel rounded-lg border border-gray-800 text-[11px] text-gray-300 flex items-center justify-between';
        item.innerHTML = `
          <div class="flex items-center gap-2 truncate">
            <span class="text-amber-300 font-bold font-mono">+${escapeHtml(lead.phone)}</span>
            <span class="text-gray-300 truncate max-w-[180px]">${escapeHtml(lead.name)}</span>
          </div>
          <span class="text-[9px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">Válido</span>
        `;
        previewList.appendChild(item);
      });
      if (validCount > 3) {
        const more = document.createElement('div');
        more.className = 'text-[10px] text-gray-500 italic pl-1 pt-1';
        more.textContent = `... y ${validCount - 3} prospectos más listos para ser importados.`;
        previewList.appendChild(more);
      }
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
      alertBox.className = 'p-3.5 rounded-xl text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 block space-y-1';
      alertBox.innerHTML = `
        <div class="font-bold flex items-center gap-1.5">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>
          <span>¡Ingesta completada exitosamente en PostgreSQL!</span>
        </div>
        <p class="text-[11px] text-emerald-200/90">
          • Insertados como nuevos: <strong>${data.inserted}</strong> prospectos.<br>
          • Omitidos por duplicación previa: <strong>${data.skipped}</strong>.<br>
          • Descartados inválidos: <strong>${data.invalid || 0}</strong>.
        </p>
      `;
      if (window.lucide) lucide.createIcons();

      // Recargar Kanban y overview en vivo
      fetchOverview();

      setTimeout(() => {
        closeImportModal();
      }, 2500);
    } else {
      alertBox.className = 'p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/40 text-rose-300 block';
      alertBox.textContent = data.error || 'Error al ingestar prospectos';
    }
  } catch (err) {
    alertBox.className = 'p-3 rounded-xl text-xs bg-rose-500/15 border border-rose-500/40 text-rose-300 block';
    alertBox.textContent = 'Error de red al ingestar: ' + err.message;
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'Ingestar Prospectos al Pipeline';
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
      dropZone.classList.add('border-amber-500', 'bg-amber-500/10');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('border-amber-500', 'bg-amber-500/10');
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
