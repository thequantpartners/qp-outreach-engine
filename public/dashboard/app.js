// =================================================================
// THE QUANT PARTNERS · CENTRO COMERCIAL AUTÓNOMO (OBSIDIAN PRECISION)
// =================================================================

// State Management
let currentPin = localStorage.getItem('qp_client_pin') || sessionStorage.getItem('qp_client_pin') || '';
let currentUserRole = localStorage.getItem('qp_user_role') || 'owner'; // 'owner' | 'sales_rep'
let currentUserName = localStorage.getItem('qp_user_name') || 'Kenneth (Director)';
let currentOverviewData = null;
let activeLeadPhone = null;
let currentStreamFilter = 'ALL';
let currentSourceFilter = 'ALL'; // 'ALL' | 'meta_ads' | 'outbound'
let currentSearchQuery = '';
let currentRepFilter = 'ALL';
let currentCampaignFilter = 'ALL';
let currentTeamReps = [];
let currentServicesList = [];
let activeCampaignId = null;
let createCampaignTargetSelectId = null;
let batchCountdownInterval = null;
let currentMainView = 'workspace'; // 'workspace' | 'discovery' | 'metrics' | 'fleet'
let currentMode = localStorage.getItem('qp_mode') || 'master';
let currentWizardStep = 1;
let wizardQrPollInterval = null;
let currentFleetData = null;
let eventSource = null;
let isPhoneMaskingActive = false;

function formatDisplayPhone(phone) {
  if (!phone) return '---';
  const clean = String(phone).replace(/[^0-9]/g, '');
  const shouldMask = currentUserRole === 'sales_rep' || isPhoneMaskingActive;
  if (shouldMask) {
    if (clean.length >= 9) {
      const prefix = clean.length > 9 ? `+${clean.slice(0, clean.length - 6)}` : `+51 ${clean.slice(0, 3)}`;
      return `${prefix} ••• •••`;
    }
    return `+${clean.slice(0, 3)} •••••`;
  }
  return `+${clean}`;
}

function togglePhoneMasking() {
  if (currentUserRole !== 'owner') return;
  isPhoneMaskingActive = !isPhoneMaskingActive;
  renderLeadsStream();
  if (activeLeadPhone) {
    const phoneEl = document.getElementById('detailLeadPhone');
    if (phoneEl) phoneEl.textContent = formatDisplayPhone(activeLeadPhone);
  }
  updatePhoneMaskingToggleUI();
}

function updatePhoneMaskingToggleUI() {
  const btn = document.getElementById('btnTogglePhoneMasking');
  if (!btn) return;
  if (currentUserRole !== 'owner') {
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  if (isPhoneMaskingActive) {
    btn.innerHTML = '<i data-lucide="eye-off" class="w-3 h-3 text-amber-400"></i><span class="text-[9px] text-amber-300 font-mono">Oculto</span>';
    btn.title = "Haz clic para revelar números completos";
  } else {
    btn.innerHTML = '<i data-lucide="eye" class="w-3 h-3 text-slate-400"></i><span class="text-[9px] text-slate-400 font-mono">Ver</span>';
    btn.title = "Haz clic para enmascarar números por seguridad";
  }
  if (window.lucide) lucide.createIcons();
}

function checkUrlHashForChat() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#chat=')) {
    const raw = hash.replace('#chat=', '').replace(/[^0-9]/g, '');
    if (raw) return raw;
  }
  return null;
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  checkAuth();
  setupVoiceRecorder();

  window.addEventListener('hashchange', () => {
    const phone = checkUrlHashForChat();
    if (phone) {
      if (typeof switchMainView === 'function') switchMainView('workspace');
      selectLeadForDetail(phone);
    }
  });
});

// 1. Autenticación por PIN y Roles
function checkAuth() {
  const pinModal = document.getElementById('pinModal');
  const appHeader = document.getElementById('appHeader') || document.querySelector('header');
  const viewWorkspace = document.getElementById('viewWorkspace');
  const viewDiscovery = document.getElementById('viewDiscovery');
  const viewMetrics = document.getElementById('viewMetrics');

  if (currentPin) {
    if (pinModal) pinModal.classList.add('hidden');
    if (appHeader) appHeader.classList.remove('hidden');
    if (viewWorkspace && currentMainView === 'workspace') viewWorkspace.classList.remove('hidden');
    applyRolePermissions();
    fetchOverview();
    initSSE();
  } else {
    if (pinModal) pinModal.classList.remove('hidden');
    if (appHeader) appHeader.classList.add('hidden');
    if (viewWorkspace) viewWorkspace.classList.add('hidden');
    if (viewDiscovery) viewDiscovery.classList.add('hidden');
    if (viewMetrics) viewMetrics.classList.add('hidden');
    const input = document.getElementById('pinInput');
    if (input) input.focus();
  }
}

function handleLogout() {
  currentPin = '';
  currentUserRole = 'owner';
  currentUserName = '';
  activeLeadPhone = null;
  currentOverviewData = null;
  currentMainView = 'workspace';
  currentSourceFilter = 'ALL';
  localStorage.removeItem('qp_client_pin');
  sessionStorage.removeItem('qp_client_pin');
  localStorage.removeItem('qp_user_role');
  localStorage.removeItem('qp_user_name');
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  const pinInput = document.getElementById('pinInput');
  if (pinInput) pinInput.value = '';
  checkAuth();
}

function applyRolePermissions() {
  const tabDiscovery = document.getElementById('tabBtnDiscovery');
  const tabMetrics = document.getElementById('tabBtnMetrics');
  const btnImport = document.getElementById('btnOpenImport');
  const btnSettings = document.getElementById('btnOpenSettings');
  const banner = document.getElementById('onboardingBanner');
  const repFilterWrapper = document.getElementById('streamRepFilter')?.parentElement;
  const userProfileBadge = document.getElementById('userProfileBadge');
  const userProfileName = document.getElementById('userProfileName');
  const btnGoToMaster = document.getElementById('btnGoToMaster');

  if (userProfileBadge && userProfileName) {
    userProfileName.textContent = currentUserName || (currentUserRole === 'owner' ? 'Kenneth (Director)' : 'Asesor');
    userProfileBadge.classList.remove('hidden');
    userProfileBadge.classList.add('flex');
  }

  if (btnGoToMaster) {
    if (currentUserRole === 'owner') {
      btnGoToMaster.classList.remove('hidden');
      btnGoToMaster.classList.add('flex');
    } else {
      btnGoToMaster.classList.add('hidden');
      btnGoToMaster.classList.remove('flex');
    }
  }

  const tabFleet = document.getElementById('tabBtnFleet');

  if (currentUserRole === 'sales_rep') {
    if (tabDiscovery) tabDiscovery.classList.add('hidden');
    if (tabMetrics) tabMetrics.classList.add('hidden');
    if (tabFleet) tabFleet.classList.add('hidden');
    if (btnImport) btnImport.classList.add('hidden');
    if (btnSettings) btnSettings.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    if (repFilterWrapper) repFilterWrapper.classList.add('hidden');
    switchMainView('workspace');
  } else {
    if (tabDiscovery) tabDiscovery.classList.remove('hidden');
    if (tabMetrics) tabMetrics.classList.remove('hidden');
    if (tabFleet) tabFleet.classList.add('hidden');
    if (btnImport) btnImport.classList.remove('hidden');
    if (btnSettings) btnSettings.classList.remove('hidden');
    if (repFilterWrapper) repFilterWrapper.classList.remove('hidden');
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
      currentUserRole = data.role || 'owner';
      currentUserName = data.repName || 'Kenneth (Director)';
      if (data.mode) {
        currentMode = data.mode;
        localStorage.setItem('qp_mode', currentMode);
      }
      localStorage.setItem('qp_client_pin', pin);
      sessionStorage.setItem('qp_client_pin', pin);
      localStorage.setItem('qp_user_role', currentUserRole);
      localStorage.setItem('qp_user_name', currentUserName);

      // Desocultar interfaz principal y header inmediatamente
      const pinModal = document.getElementById('pinModal');
      const appHeader = document.getElementById('appHeader') || document.querySelector('header');
      if (pinModal) pinModal.classList.add('hidden');
      if (appHeader) appHeader.classList.remove('hidden');
      switchMainView(currentMainView || 'workspace');

      applyRolePermissions();
      fetchOverview();
      initSSE();
    } else {
      errorEl.textContent = data.error || 'Clave o PIN incorrecto.';
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
      handleLogout();
      return;
    }

    const data = await res.json();
    currentOverviewData = data;

    if (data.mode) {
      currentMode = data.mode;
      localStorage.setItem('qp_mode', currentMode);
    }

    if (data.role) {
      currentUserRole = data.role;
      if (data.repName) currentUserName = data.repName;
      localStorage.setItem('qp_user_role', currentUserRole);
      localStorage.setItem('qp_user_name', currentUserName);
      applyRolePermissions();
    }

    if (data.salesReps && Array.isArray(data.salesReps)) {
      currentTeamReps = data.salesReps;
    }

    // Auto-disparo del Onboarding Wizard si es un satélite cliente virgen
    if (currentMode === 'client' && data.onboardingCompleted === false) {
      openOnboardingWizard();
    }

    await loadAllCampaigns();
    await fetchBatchStatus();
    renderHeader(data);
    renderLeadsStream();
    renderMetrics(data);
    updateOnboardingBanner(data);

    // Si hay un lead activo, refrescar su detalle; si no, verificar hash de URL o seleccionar el primero disponible en PC
    if (activeLeadPhone) {
      updateActiveLeadHeader();
    } else {
      const hashPhone = checkUrlHashForChat();
      const allLeads = getConsolidatedLeads();
      const targetLead = hashPhone ? allLeads.find(l => l.phone === hashPhone) : null;
      if (targetLead) {
        selectLeadForDetail(targetLead.phone);
      } else if (allLeads.length > 0 && window.innerWidth >= 1024) {
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

// 5. Gestión de Campañas y Listados
async function loadAllCampaigns() {
  if (!currentPin) return;
  try {
    const res = await fetch('/api/client/services', {
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      const data = await res.json();
      currentServicesList = data.services || [];
      if (currentServicesList.length > 0) {
        if (!activeCampaignId || !currentServicesList.find(s => s.id === activeCampaignId)) {
          const firstActive = currentServicesList.find(s => s.isActive) || currentServicesList[0];
          activeCampaignId = firstActive.id;
        }
      } else {
        activeCampaignId = null;
      }
      populateAllCampaignDropdowns();
      renderActiveCampaignDetails(activeCampaignId);
      await fetchBatchStatus();
    }
  } catch (err) {
    console.warn('Error cargando campañas:', err);
  }
}

function populateAllCampaignDropdowns() {
  // 0. Selector Principal de Campaña Activa en Vista 2 (#activeCampaignSelect)
  const activeCampSelect = document.getElementById('activeCampaignSelect');
  if (activeCampSelect) {
    let html = '';
    if (currentServicesList.length === 0) {
      html = '<option value="">No hay campañas registradas</option>';
    } else {
      currentServicesList.forEach(s => {
        const isSel = s.id === activeCampaignId ? 'selected' : '';
        html += `<option value="${escapeHtml(s.id)}" ${isSel}>🏷️ ${escapeHtml(s.name)} (${escapeHtml(s.id)})${s.isActive ? '' : ' [Pausada]'}</option>`;
      });
    }
    activeCampSelect.innerHTML = html;
    if (activeCampaignId) activeCampSelect.value = activeCampaignId;
  }

  // 1. Selector de filtro en Columna 1 (#streamCampaignFilter)
  const streamFilter = document.getElementById('streamCampaignFilter');
  if (streamFilter) {
    let html = '<option value="ALL">Todas las campañas</option><option value="NONE">Directo / Sin campaña</option>';
    currentServicesList.forEach(s => {
      html += `<option value="${escapeHtml(s.id)}">🏷️ ${escapeHtml(s.name)}</option>`;
    });
    streamFilter.innerHTML = html;
    streamFilter.value = currentCampaignFilter;
  }

  // 2. Selector en Modal de Importación (#importServiceSelect)
  const importSelect = document.getElementById('importServiceSelect');
  if (importSelect) {
    let html = '';
    currentServicesList.forEach(s => {
      html += `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.id)})${s.isActive ? ' - Activa' : ''}</option>`;
    });
    importSelect.innerHTML = html;
  }

  // 3. Selector en Previsualización de Scraping (#previewServiceSelect)
  const previewSelect = document.getElementById('previewServiceSelect');
  if (previewSelect) {
    let html = '';
    currentServicesList.forEach(s => {
      const isSel = s.id === activeCampaignId ? 'selected' : '';
      html += `<option value="${escapeHtml(s.id)}" ${isSel}>${escapeHtml(s.name)}</option>`;
    });
    previewSelect.innerHTML = html;
    if (activeCampaignId) previewSelect.value = activeCampaignId;
  }

  // 4. Selector en Consola de Despacho en Lote (#batchServiceSelect)
  const batchSelect = document.getElementById('batchServiceSelect');
  if (batchSelect) {
    let html = '';
    currentServicesList.forEach(s => {
      const isSel = s.id === activeCampaignId ? 'selected' : '';
      html += `<option value="${escapeHtml(s.id)}" ${isSel}>${escapeHtml(s.name)}</option>`;
    });
    batchSelect.innerHTML = html;
    if (activeCampaignId) batchSelect.value = activeCampaignId;
  }

  // 5. Selector en Modal de Nuevo Chat (#directChatServiceSelect)
  const directSelect = document.getElementById('directChatServiceSelect');
  if (directSelect) {
    let html = '<option value="">Directo / Sin Campaña</option>';
    currentServicesList.forEach(s => {
      html += `<option value="${escapeHtml(s.id)}">🏷️ ${escapeHtml(s.name)}</option>`;
    });
    directSelect.innerHTML = html;
  }

  // 6. Selector en Columna 3 (#intelCampaignSelect)
  const intelSelect = document.getElementById('intelCampaignSelect');
  if (intelSelect && activeLeadPhone) {
    const allLeads = getConsolidatedLeads();
    const lead = allLeads.find(l => l.phone === activeLeadPhone);
    let html = '<option value="">Reasignar campaña...</option><option value="DIRECT">Directo / Sin campaña</option>';
    currentServicesList.forEach(s => {
      const isSel = lead && lead.serviceId === s.id ? 'selected' : '';
      html += `<option value="${escapeHtml(s.id)}" ${isSel}>🏷️ ${escapeHtml(s.name)}</option>`;
    });
    intelSelect.innerHTML = html;
  }
}

function handleCampaignFilterChange(campaignId) {
  currentCampaignFilter = campaignId;
  renderLeadsStream();
}

// Control Integral de Campaña Activa en Vista 2
function renderActiveCampaignDetails(serviceId) {
  const service = currentServicesList.find(s => s.id === serviceId);
  const descEl = document.getElementById('activeCampDescription');
  const statusSwitch = document.getElementById('activeCampToggleSwitch');
  const statusText = document.getElementById('activeCampStatusText');
  const totalLeadsEl = document.getElementById('activeCampTotalLeads');
  const sentLeadsEl = document.getElementById('activeCampSentLeads');
  const repliedLeadsEl = document.getElementById('activeCampRepliedLeads');
  const qualifiedLeadsEl = document.getElementById('activeCampQualifiedLeads');

  const tmplEl = document.getElementById('activeCampTemplate');
  const followEl = document.getElementById('activeCampFollowUp');
  const promptEl = document.getElementById('activeCampPrompt');
  const alertBox = document.getElementById('activeCampAlertBox');
  if (alertBox) alertBox.classList.add('hidden');

  if (!service) {
    if (descEl) descEl.textContent = 'Selecciona o crea una campaña para comenzar.';
    if (statusSwitch) statusSwitch.checked = false;
    if (statusText) statusText.textContent = 'Sin campaña';
    if (totalLeadsEl) totalLeadsEl.textContent = '0';
    if (sentLeadsEl) sentLeadsEl.textContent = '0';
    if (repliedLeadsEl) repliedLeadsEl.textContent = '0';
    if (qualifiedLeadsEl) qualifiedLeadsEl.textContent = '0';
    if (tmplEl) tmplEl.value = '';
    if (followEl) followEl.value = '';
    if (promptEl) promptEl.value = '';
    return;
  }

  if (descEl) {
    const queries = service.searchQueries && service.searchQueries.length > 0 
      ? `Queries: ${service.searchQueries.join(', ')}` 
      : 'Sin queries configuradas';
    const loc = service.targetLocations && service.targetLocations.length > 0 
      ? ` • ${service.targetLocations.join(', ')}` 
      : '';
    descEl.textContent = `${queries}${loc}`;
  }

  if (statusSwitch) statusSwitch.checked = !!service.isActive;
  if (statusText) {
    statusText.textContent = service.isActive ? 'Campaña Activa' : 'Campaña Pausada';
    statusText.className = `text-[11px] font-sans font-medium ${service.isActive ? 'text-emerald-400' : 'text-slate-400'}`;
  }
  if (totalLeadsEl) totalLeadsEl.textContent = service.totalLeads ?? 0;
  if (sentLeadsEl) sentLeadsEl.textContent = service.sentLeads ?? 0;
  if (repliedLeadsEl) repliedLeadsEl.textContent = service.repliedLeads ?? 0;
  if (qualifiedLeadsEl) qualifiedLeadsEl.textContent = service.qualifiedLeads ?? 0;

  if (tmplEl) tmplEl.value = service.outreachTemplate || '';
  if (followEl) followEl.value = service.followUpTemplate1 || service.followUpTemplate || '';
  if (promptEl) promptEl.value = service.aiSystemPrompt || service.aiInstructions || '';

  // Pre-cargar búsquedas sugeridas en el panel de scraping si está vacío
  const scrapeQueryInput = document.getElementById('scrapeQueryInput');
  if (scrapeQueryInput && service.searchQueries && service.searchQueries.length > 0) {
    if (!scrapeQueryInput.value.trim()) {
      scrapeQueryInput.value = service.searchQueries[0];
    }
  }

  // Pre-cargar ubicación sugerida si está vacía
  const scrapeLocInput = document.getElementById('scrapeLocationInput');
  if (scrapeLocInput && service.targetLocations && service.targetLocations.length > 0) {
    if (!scrapeLocInput.value.trim()) {
      scrapeLocInput.value = service.targetLocations[0];
    }
  }

  // Sincronizar selectores de previsualización y lote
  const previewSelect = document.getElementById('previewServiceSelect');
  if (previewSelect && previewSelect.value !== service.id) previewSelect.value = service.id;
  const batchSelect = document.getElementById('batchServiceSelect');
  if (batchSelect && batchSelect.value !== service.id) batchSelect.value = service.id;
}

function handleActiveCampaignChange(serviceId) {
  activeCampaignId = serviceId;
  renderActiveCampaignDetails(serviceId);
  const activeCampSelect = document.getElementById('activeCampaignSelect');
  if (activeCampSelect && activeCampSelect.value !== serviceId) {
    activeCampSelect.value = serviceId;
  }
}

async function handleActiveCampaignToggle(active) {
  if (!activeCampaignId) return;
  await handleToggleCampaign(activeCampaignId, active);
  const service = currentServicesList.find(s => s.id === activeCampaignId);
  if (service) service.isActive = active;
  const statusText = document.getElementById('activeCampStatusText');
  if (statusText) {
    statusText.textContent = active ? 'Campaña Activa' : 'Campaña Pausada';
    statusText.className = `text-[11px] font-sans font-medium ${active ? 'text-emerald-400' : 'text-slate-400'}`;
  }
}

async function handleSaveActiveCampaignStrategy() {
  if (!activeCampaignId) {
    alert('No hay una campaña activa seleccionada.');
    return;
  }

  const tmplEl = document.getElementById('activeCampTemplate');
  const followEl = document.getElementById('activeCampFollowUp');
  const promptEl = document.getElementById('activeCampPrompt');
  const alertBox = document.getElementById('activeCampAlertBox');
  const btn = document.getElementById('btnSaveActiveCampStrategy');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Guardando...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch(`/api/client/services/${activeCampaignId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        outreachTemplate: tmplEl ? tmplEl.value.trim() : undefined,
        followUpTemplate: followEl ? followEl.value.trim() : undefined,
        aiInstructions: promptEl ? promptEl.value.trim() : undefined
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      const s = currentServicesList.find(x => x.id === activeCampaignId);
      if (s) {
        if (tmplEl) s.outreachTemplate = tmplEl.value.trim();
        if (followEl) s.followUpTemplate1 = followEl.value.trim();
        if (promptEl) s.aiSystemPrompt = promptEl.value.trim();
      }
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 block';
        alertBox.textContent = '✅ Estrategia y mensajes guardados con éxito en la campaña.';
        setTimeout(() => { alertBox.classList.add('hidden'); }, 4000);
      }
    } else {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        alertBox.textContent = data.error || 'Error al guardar la estrategia de la campaña.';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Error de conexión al guardar cambios.';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Guardar Mensajes</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handleDeleteActiveCampaign() {
  if (!activeCampaignId) {
    alert('No hay una campaña seleccionada para eliminar.');
    return;
  }
  await handleDeleteCampaign(activeCampaignId);
}

// 6. Render Stream de Prospectos (Panel Izquierdo estilo Linear)
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

  // Filtrar por campaña seleccionada
  if (currentCampaignFilter === 'NONE') {
    filtered = filtered.filter(l => !l.serviceId);
  } else if (currentCampaignFilter !== 'ALL') {
    filtered = filtered.filter(l => l.serviceId === currentCampaignFilter);
  }

  // Filtrar por asesor Round Robin
  if (currentRepFilter === 'UNASSIGNED') {
    filtered = filtered.filter(l => !l.assignedRepName);
  } else if (currentRepFilter !== 'ALL') {
    filtered = filtered.filter(l => l.assignedRepName === currentRepFilter);
  }

  // Filtrar por canal (Orgánico vs Meta Ads vs Prospección)
  if (currentSourceFilter === 'organic') {
    filtered = filtered.filter(l => 
      l.source === 'direct_whatsapp' || 
      l.source === 'inbound' || 
      l.source === 'organic' || 
      (l.category && (l.category.toLowerCase().includes('organico') || l.category.toLowerCase().includes('inbound')))
    );
  } else if (currentSourceFilter === 'meta_ads') {
    filtered = filtered.filter(l => l.source === 'meta_ads' || (l.category && l.category.toLowerCase().includes('metaads')));
  } else if (currentSourceFilter === 'outbound') {
    filtered = filtered.filter(l => {
      const isMeta = l.source === 'meta_ads' || (l.category && l.category.toLowerCase().includes('metaads'));
      const isOrg = l.source === 'direct_whatsapp' || l.source === 'inbound' || l.source === 'organic' || (l.category && (l.category.toLowerCase().includes('organico') || l.category.toLowerCase().includes('inbound')));
      return !isMeta && !isOrg;
    });
  }

  // Filtrar por búsqueda
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(l => 
      (l.companyName || '').toLowerCase().includes(q) || 
      (l.phone || '').includes(q) ||
      (l.assignedRepName || '').toLowerCase().includes(q) ||
      (l.serviceName || '').toLowerCase().includes(q) ||
      (l.category || '').toLowerCase().includes(q)
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
    HUMAN_TAKEOVER: { label: 'Humano', class: 'text-purple-400 border-purple-500/20 bg-purple-500/5' },
    OPT_OUT: { label: 'No Contactar', class: 'text-rose-400 border-rose-500/30 bg-rose-500/10' }
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
    const campLabel = lead.serviceName || (lead.serviceId ? lead.serviceId : 'Directo');
    const isMetaAd = lead.source === 'meta_ads' || (lead.category && lead.category.toLowerCase().includes('metaads'));
    const isOrganic = lead.source === 'direct_whatsapp' || lead.source === 'inbound' || lead.source === 'organic' || (lead.category && (lead.category.toLowerCase().includes('organico') || lead.category.toLowerCase().includes('inbound')));
    
    let channelBadgeHtml = '';
    if (isOrganic) {
      channelBadgeHtml = `<span class="text-[9px] font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1" title="Canal: Chat Orgánico / Inbound"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>💬 Orgánico</span></span>`;
    } else if (isMetaAd) {
      channelBadgeHtml = `<span class="text-[9px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1" title="Canal: Meta Ads"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>🎯 Meta Ads</span></span>`;
    } else {
      channelBadgeHtml = `<span class="text-[9px] font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 flex items-center gap-1" title="Canal: Prospección Fría"><i data-lucide="bot" class="w-2.5 h-2.5 flex-shrink-0"></i><span>Prospección</span></span>`;
    }

    item.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1">
        <h3 class="font-medium text-xs text-slate-100 truncate flex-1">${escapeHtml(lead.companyName)}</h3>
        <span class="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0 font-medium ${badge.class}">
          ${badge.label}
        </span>
      </div>
      <div class="flex items-center justify-between gap-2 mb-1.5 text-[11px] font-mono">
        <span class="text-gold font-medium">${formatDisplayPhone(lead.phone)}</span>
        <span class="text-[10px] text-slate-500 font-mono">${timeFormatted}</span>
      </div>
      <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
        ${channelBadgeHtml}
        <span class="text-[9px] font-mono text-gold/90 bg-gold/5 px-2 py-0.5 rounded border border-gold/20 flex items-center gap-1 max-w-[150px]" title="Campaña: ${escapeHtml(campLabel)}">
          <i data-lucide="tag" class="w-2.5 h-2.5 text-gold flex-shrink-0"></i>
          <span class="truncate">${escapeHtml(campLabel)}</span>
        </span>
        <span class="text-[9px] font-mono text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08] flex items-center gap-1 max-w-[120px]" title="Asesor Asignado: ${escapeHtml(repLabel)}">
          <i data-lucide="user" class="w-2.5 h-2.5 text-gold/80 flex-shrink-0"></i>
          <span class="truncate">${escapeHtml(repLabel)}</span>
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

function setSourceFilter(source) {
  currentSourceFilter = source;
  ['ALL', 'organic', 'meta_ads', 'outbound'].forEach(s => {
    const btn = document.getElementById(`sourceFilter_${s}`);
    if (btn) {
      if (s === source) {
        btn.className = 'flex-1 py-1 px-1.5 rounded-lg text-[10px] font-sans font-medium transition text-white bg-white/[0.08] shadow-sm text-center flex items-center justify-center gap-1';
      } else {
        btn.className = 'flex-1 py-1 px-1.5 rounded-lg text-[10px] font-sans font-medium transition text-slate-400 hover:text-white text-center flex items-center justify-center gap-1';
      }
    }
  });
  renderLeadsStream();
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
        pill.className = 'stream-filter-pill px-2.5 py-1 rounded-md text-[11px] font-mono tracking-tight transition bg-gold/15 text-gold font-semibold border border-gold/40 shadow-sm';
      } else {
        pill.className = 'stream-filter-pill px-2.5 py-1 rounded-md text-[11px] font-mono tracking-tight transition text-slate-300 hover:text-white bg-card/60 hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.14]';
      }
    }
  });

  renderLeadsStream();
}

function handleLeadSearch(val) {
  currentSearchQuery = (val || '').trim();
  renderLeadsStream();
}

// 6. Navegación Móvil Estilo WhatsApp (100% Responsivo)
function openMobileChat(phone) {
  if (window.innerWidth < 1024) {
    const col2 = document.getElementById('colActiveChat');
    if (col2) {
      col2.classList.remove('hidden');
      col2.classList.add('mobile-chat-open');
    }
  }
}

function closeMobileChat() {
  const col2 = document.getElementById('colActiveChat');
  if (col2) {
    col2.classList.remove('mobile-chat-open');
    if (window.innerWidth < 1024) {
      col2.classList.add('hidden');
    }
  }
  // Cerrar bottom sheet si está abierto
  toggleMobileLeadInfo(false);
}

function toggleMobileLeadInfo(forceState) {
  const col3 = document.getElementById('leadDetailIntelPanel');
  if (!col3) return;
  
  const isDesktop = window.innerWidth >= 1024;

  if (isDesktop) {
    if (forceState !== undefined) {
      if (forceState) {
        col3.classList.remove('hidden');
        col3.classList.add('flex');
      } else {
        col3.classList.add('hidden');
        col3.classList.remove('flex');
      }
      return;
    }
    col3.classList.toggle('hidden');
    col3.classList.toggle('flex');
  } else {
    // Modo Móvil (Bottom Sheet)
    // Nos aseguramos que no esté hidden para que anime
    col3.classList.remove('hidden');
    col3.classList.add('flex');

    if (forceState !== undefined) {
      if (forceState) {
        // Abrir
        col3.classList.remove('translate-y-full');
        col3.classList.add('translate-y-0');
      } else {
        // Cerrar
        col3.classList.remove('translate-y-0');
        col3.classList.add('translate-y-full');
      }
      return;
    }
    
    // Toggle normal
    if (col3.classList.contains('translate-y-full')) {
      col3.classList.remove('translate-y-full');
      col3.classList.add('translate-y-0');
    } else {
      col3.classList.remove('translate-y-0');
      col3.classList.add('translate-y-full');
    }
  }
}

// Wrapper para mobile nav (usa el mismo switchMainView pero permite restaurar vistas de chat)
window.switchMobileNav = function(view) {
  closeMobileChat(); // Asegurar que salimos del chat activo al cambiar de sección
  if (typeof switchMainView === 'function') {
    switchMainView(view);
  }
};

// 7. Seleccionar Prospecto y Abrir Detalle / Chat Directo
async function selectLeadForDetail(phone) {
  if (!currentPin || !phone) return;
  activeLeadPhone = phone;
  openMobileChat(phone);
  renderLeadsStream(); // Actualizar el resaltado en el stream izquierdo

  const allLeads = getConsolidatedLeads();
  const lead = allLeads.find(l => l.phone === phone);

  if (!lead) return;

  // Header del detalle central (Columna 2)
  const nameEl = document.getElementById('detailLeadName');
  const phoneEl = document.getElementById('detailLeadPhone');
  const tagEl = document.getElementById('detailLeadStatusTag');
  const actionsEl = document.getElementById('leadDetailActions');
  const composer = document.getElementById('chatComposer');
  const avatarEl = document.getElementById('detailLeadAvatar');

  if (nameEl) nameEl.textContent = lead.companyName || 'Prospecto';
  if (phoneEl) phoneEl.textContent = formatDisplayPhone(lead.phone);
  updatePhoneMaskingToggleUI();
  if (tagEl) {
    tagEl.textContent = lead.status;
    tagEl.classList.remove('hidden');
  }
  if (actionsEl) actionsEl.classList.remove('hidden');
  if (composer) {
    composer.classList.remove('hidden');
    const manualInput = document.getElementById('chatManualInput');
    if (manualInput) manualInput.value = '';
    handleChatInputChange('');
  }
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

  // Campaña Origen
  const intelCampaignBadge = document.getElementById('intelCampaignBadge');
  if (intelCampaignBadge) {
    intelCampaignBadge.textContent = lead.serviceName || (lead.serviceId ? lead.serviceId : 'Directo / Orgánico');
  }

  const intelCampaignSelect = document.getElementById('intelCampaignSelect');
  if (intelCampaignSelect) {
    let campOptionsHtml = '<option value="">Reasignar campaña...</option><option value="DIRECT">Directo / Sin campaña</option>';
    currentServicesList.forEach(s => {
      const isSel = lead.serviceId === s.id ? 'selected' : '';
      campOptionsHtml += `<option value="${escapeHtml(s.id)}" ${isSel}>🏷️ ${escapeHtml(s.name)}</option>`;
    });
    intelCampaignSelect.innerHTML = campOptionsHtml;
  }

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

  const sourceBadge = document.getElementById('intelSourceBadge');
  const catBadge = document.getElementById('intelCategoryBadge');
  const catInput = document.getElementById('intelCategoryInput');
  const isMetaAd = lead.source === 'meta_ads' || (lead.category && lead.category.toLowerCase().includes('metaads'));
  const isOrganic = lead.source === 'direct_whatsapp' || lead.source === 'inbound' || lead.source === 'organic' || (lead.category && (lead.category.toLowerCase().includes('organico') || lead.category.toLowerCase().includes('inbound')));

  if (sourceBadge) {
    if (isOrganic) {
      sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium flex items-center gap-1';
      sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>💬 Orgánico / Inbound</span>';
    } else if (isMetaAd) {
      sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 font-medium flex items-center gap-1';
      sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>🎯 Meta Ads</span>';
    } else {
      sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 font-medium flex items-center gap-1';
      sourceBadge.innerHTML = '<i data-lucide="bot" class="w-2.5 h-2.5"></i><span>🤖 Prospección Fría</span>';
    }
  }

  if (catBadge) {
    catBadge.textContent = lead.category || (isOrganic ? '#Inbound-Orgánico' : isMetaAd ? '#MetaAds' : '#Prospección');
  }
  if (catInput) {
    catInput.value = lead.category || '';
  }

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
    const intelCampaignBadge = document.getElementById('intelCampaignBadge');
    if (intelCampaignBadge) intelCampaignBadge.textContent = lead.serviceName || (lead.serviceId ? lead.serviceId : 'Directo / Orgánico');
    
    const isMetaAd = lead.source === 'meta_ads' || (lead.category && lead.category.toLowerCase().includes('metaads'));
    const isOrganic = lead.source === 'direct_whatsapp' || lead.source === 'inbound' || lead.source === 'organic' || (lead.category && (lead.category.toLowerCase().includes('organico') || lead.category.toLowerCase().includes('inbound')));
    const sourceBadge = document.getElementById('intelSourceBadge');
    if (sourceBadge) {
      if (isOrganic) {
        sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-medium flex items-center gap-1';
        sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span><span>💬 Orgánico / Inbound</span>';
      } else if (isMetaAd) {
        sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 font-medium flex items-center gap-1';
        sourceBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span><span>🎯 Meta Ads</span>';
      } else {
        sourceBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 font-medium flex items-center gap-1';
        sourceBadge.innerHTML = '<i data-lucide="bot" class="w-2.5 h-2.5"></i><span>🤖 Prospección Fría</span>';
      }
    }
    const catBadge = document.getElementById('intelCategoryBadge');
    if (catBadge) catBadge.textContent = lead.category || (isOrganic ? '#Inbound-Orgánico' : isMetaAd ? '#MetaAds' : '#Prospección');
  }
}

async function handleSaveCategoryClick() {
  if (!activeLeadPhone) return;
  const input = document.getElementById('intelCategoryInput');
  const newCat = input ? input.value.trim() : '';
  await handleUpdateLeadCategory(newCat);
}

async function handleUpdateLeadCategory(category) {
  if (!activeLeadPhone || !currentPin) return;
  try {
    const res = await fetch(`/api/client/leads/${activeLeadPhone}/category`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ category })
    });
    if (res.ok) {
      const allLeads = getConsolidatedLeads();
      const lead = allLeads.find(l => l.phone === activeLeadPhone);
      if (lead) {
        lead.category = category;
      }
      const catBadge = document.getElementById('intelCategoryBadge');
      if (catBadge) catBadge.textContent = category || '---';
      renderLeadsStream();
    }
  } catch (err) {
    console.error('Error actualizando categoría del prospecto:', err);
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

      // Actualizar directamente en la memoria global de kanban y activeChats
      if (currentOverviewData && currentOverviewData.kanban) {
        Object.values(currentOverviewData.kanban).forEach(list => {
          if (Array.isArray(list)) {
            list.forEach(l => {
              if (l && l.phone === activeLeadPhone) {
                l.assignedRepName = repName;
                l.assignedRepPhone = repPhone;
              }
            });
          }
        });
      }
      if (currentOverviewData && currentOverviewData.activeChats) {
        currentOverviewData.activeChats.forEach(c => {
          if (c.leadPhone === activeLeadPhone) {
            c.assignedRepName = repName;
          }
        });
      }
      renderLeadsStream();
      playNotificationSound();
      showNotificationToast(`👤 Asesor asignado: ${repName}`);
    } else {
      alert('Error reasignando asesor: ' + (data.error || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error al reasignar asesor: ' + err.message);
  }
}

async function handleReassignLeadCampaign(serviceId) {
  if (!activeLeadPhone) return;
  try {
    const targetId = (serviceId === 'DIRECT' || !serviceId) ? '' : serviceId;
    const res = await fetch(`/api/client/leads/${activeLeadPhone}/service`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ serviceId: targetId })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const matched = currentServicesList.find(s => s.id === targetId);
      const campName = matched ? matched.name : (targetId ? targetId : 'Directo');
      const badge = document.getElementById('intelCampaignBadge');
      if (badge) badge.textContent = campName;

      // Actualizar directamente en la memoria global de kanban y activeChats
      if (currentOverviewData && currentOverviewData.kanban) {
        Object.values(currentOverviewData.kanban).forEach(list => {
          if (Array.isArray(list)) {
            list.forEach(l => {
              if (l && l.phone === activeLeadPhone) {
                l.serviceId = targetId || null;
                l.serviceName = campName;
              }
            });
          }
        });
      }
      if (currentOverviewData && currentOverviewData.activeChats) {
        currentOverviewData.activeChats.forEach(c => {
          if (c.leadPhone === activeLeadPhone) {
            c.serviceId = targetId || null;
            c.serviceName = campName;
          }
        });
      }
      renderLeadsStream();
    } else {
      alert('Error reasignando campaña: ' + (data.error || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error de conexión al reasignar campaña.');
  }
}

async function handleLeadStatusChange(newStatus) {
  if (!activeLeadPhone || !newStatus) return;

  if (newStatus === 'OPT_OUT') {
    handleLeadOptOut();
    return;
  }

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

async function handleLeadOptOut() {
  if (!activeLeadPhone) return;
  if (!confirm(`¿Deseas marcar a este prospecto (+${activeLeadPhone}) como "No Contactar (OPT-OUT)"?\n\nEl bot de IA y los despachos automáticos quedarán permanentemente bloqueados para este número.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/client/leads/${activeLeadPhone}/opt-out`, {
      method: 'PATCH',
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const allLeads = getConsolidatedLeads();
      const lead = allLeads.find(l => l.phone === activeLeadPhone);
      if (lead) {
        lead.status = 'OPT_OUT';
      }
      const tagEl = document.getElementById('detailLeadStatusTag');
      if (tagEl) tagEl.textContent = 'OPT_OUT';
      const intelStatus = document.getElementById('intelStatusSelect');
      if (intelStatus) intelStatus.value = 'OPT_OUT';
      renderLeadsStream();
      alert('✅ Prospecto marcado como No Contactar (OPT-OUT).');
    } else {
      alert('Error: ' + (data.error || 'No se pudo actualizar estado.'));
    }
  } catch (err) {
    alert('Error al comunicar opt-out con el servidor.');
  }
}

async function handleDeleteCurrentLead() {
  if (!activeLeadPhone) return;
  if (!confirm(`⚠️ ¿Estás seguro de eliminar permanentemente a este prospecto (+${activeLeadPhone})?\n\nSe borrará su registro y todo el historial de chat en la base de datos.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/client/leads/${activeLeadPhone}`, {
      method: 'DELETE',
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      activeLeadPhone = null;
      document.getElementById('detailLeadName').textContent = 'Selecciona un chat';
      document.getElementById('detailLeadPhone').textContent = '';
      document.getElementById('detailLeadStatusTag').classList.add('hidden');
      document.getElementById('leadDetailActions').classList.add('hidden');
      document.getElementById('chatComposer').classList.add('hidden');
      document.getElementById('intelPlaceholder').classList.remove('hidden');
      document.getElementById('intelLeadCard').classList.add('hidden');
      document.getElementById('chatMessagesContainer').innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
          <i data-lucide="message-square" class="w-8 h-8 text-slate-600 mb-2"></i>
          <p class="text-xs">Selecciona un prospecto para ver el historial</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      fetchOverview();
    } else {
      alert('Error: ' + (data.error || 'No se pudo eliminar el prospecto.'));
    }
  } catch (err) {
    alert('Error al comunicar la eliminación con el servidor.');
  }
}

function exportCurrentLeadsCsv() {
  const params = new URLSearchParams({
    filter: currentStreamFilter,
    search: currentSearchQuery,
    rep: currentRepFilter,
    campaign: currentCampaignFilter
  });

  const url = `/api/client/leads/export?${params.toString()}`;
  
  fetch(url, {
    headers: { 'x-client-pin': currentPin }
  })
  .then(res => {
    if (!res.ok) throw new Error('Error al exportar CSV');
    return res.blob();
  })
  .then(blob => {
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `prospectos_qp_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  })
  .catch(err => {
    alert('Error al descargar el archivo CSV: ' + err.message);
  });
}

function updateMeta24hWindowBadge(lead, messages) {
  const badge = document.getElementById('detailLeadMetaWindowBadge');
  if (!badge) return;

  let lastCustomerTime = lead?.lastCustomerMessageAt ? new Date(lead.lastCustomerMessageAt).getTime() : null;
  if (!lastCustomerTime && Array.isArray(messages)) {
    const userMsgs = messages.filter(m => m.role === 'user');
    if (userMsgs.length > 0) {
      lastCustomerTime = new Date(userMsgs[userMsgs.length - 1].createdAt).getTime();
    }
  }

  if (!lastCustomerTime) {
    badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1';
    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Fuera de Ventana 24h';
    badge.title = 'Política Meta 2026: No hay mensaje reciente del cliente. En API Oficial solo se pueden enviar plantillas HSM aprobadas.';
    badge.classList.remove('hidden');
    return;
  }

  const now = Date.now();
  const diffMs = (lastCustomerTime + 24 * 60 * 60 * 1000) - now;

  if (diffMs > 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Ventana 24h Activa (${hours}h ${minutes}m)`;
    badge.title = 'Política Meta 2026: Ventana de atención al cliente activa. Se pueden enviar mensajes libres.';
    badge.classList.remove('hidden');
  } else {
    badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1';
    badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Fuera de Ventana 24h';
    badge.title = 'Política Meta 2026: Han pasado más de 24h desde el último mensaje del cliente. En API Oficial solo se permiten plantillas HSM aprobadas.';
    badge.classList.remove('hidden');
  }
}

function renderChatMessages(messages) {
  const container = document.getElementById('chatMessagesContainer');
  container.innerHTML = '';

  const allLeads = getConsolidatedLeads();
  const lead = allLeads.find(l => l.phone === activeLeadPhone);

  // Actualizar indicador de ventana 24h Meta
  updateMeta24hWindowBadge(lead, messages);

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
    const isSystem = m.role === 'system';
    const bubble = document.createElement('div');
    bubble.className = `flex flex-col ${isSystem ? 'items-center my-2' : (isOutbound ? 'items-end' : 'items-start')}`;

    const dateObj = new Date(m.createdAt);
    const dateStr = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const auditTimeStr = `${dateStr}, ${timeStr}`;

    let authorBadge = '';
    if (m.role === 'human_agent') {
      const repName = lead?.assignedRepName || 'Kenneth (Director Comercial)';
      authorBadge = `<span class="text-[9px] font-mono text-gold flex items-center gap-1">👤 ${escapeHtml(repName)} · Asesor</span>`;
    } else if (m.role === 'assistant') {
      authorBadge = `<span class="text-[9px] font-mono text-slate-400 flex items-center gap-1">🤖 Agente IA (Outreach Engine)</span>`;
    } else if (m.role === 'user') {
      const compName = lead?.companyName || 'Prospecto WhatsApp';
      authorBadge = `<span class="text-[9px] font-mono text-blue-400 flex items-center gap-1">🏢 ${escapeHtml(compName)}</span>`;
    } else if (isSystem) {
      authorBadge = `<span class="text-[9px] font-mono text-amber-400 flex items-center gap-1">⚙️ Sistema · Auditoría</span>`;
    }

    if (isSystem) {
      bubble.innerHTML = `
        <div class="max-w-[85%] rounded-xl px-3 py-1.5 text-[11px] leading-relaxed bg-amber-500/10 border border-amber-500/20 text-amber-300 text-center font-sans space-y-0.5">
          <div class="flex items-center justify-center gap-2 text-[9px] text-amber-400/70 font-mono">
            ${authorBadge}
            <span>&bull;</span>
            <span>${auditTimeStr}</span>
          </div>
          <p class="font-light">${escapeHtml(m.content)}</p>
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <div class="max-w-[78%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
          isOutbound 
            ? 'bg-gold/10 border border-gold/25 text-slate-100 rounded-tr-none' 
            : 'bg-surface border border-white/[0.06] text-slate-200 rounded-tl-none'
        }">
          <div class="flex items-center justify-between gap-4 mb-1 border-b border-white/[0.04] pb-1">
            ${authorBadge}
            <span class="text-[9px] text-slate-500 font-mono flex-shrink-0" title="Fecha y hora de auditoría B2B">${auditTimeStr}</span>
          </div>
          <p class="whitespace-pre-wrap select-text font-light pt-0.5">${escapeHtml(m.content)}</p>
        </div>
      `;
    }
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
  if (window.lucide) lucide.createIcons();
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
  handleChatInputChange('');

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
      if (data.isWindowClosed) {
        alert(`⚠️ [POLÍTICA META 2026] Ventana de 24h Expirada\n\n${data.error}\n\n${data.tip || 'En la API oficial de Meta solo puedes enviar plantillas pre-aprobadas (HSM) para reactivar la conversación fuera de las 24 horas.'}`);
      } else {
        alert('Error enviando mensaje: ' + (data.error || 'Error desconocido'));
      }
    }
  } catch (err) {
    alert('Error de red al enviar mensaje: ' + err.message);
  }
}

// 9.1. Alternar dinámicamente entre Botón de Micrófono (🎙️) y Enviar (➤)
function handleChatInputChange(value) {
  const micBtn = document.getElementById('chatMicBtn');
  const sendBtn = document.getElementById('chatSendBtn');
  if (!micBtn || !sendBtn) return;

  if (value && value.trim().length > 0) {
    micBtn.classList.add('hidden');
    sendBtn.classList.remove('hidden');
    sendBtn.classList.add('flex');
  } else {
    micBtn.classList.remove('hidden');
    sendBtn.classList.add('hidden');
    sendBtn.classList.remove('flex');
  }
}

// 9.2. Menú de Adjuntos (Clip 📎)
function toggleAttachmentMenu(e) {
  if (e) e.stopPropagation();
  const popup = document.getElementById('chatAttachmentPopup');
  if (popup) {
    popup.classList.toggle('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeAttachmentMenu() {
  const popup = document.getElementById('chatAttachmentPopup');
  if (popup) popup.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  const popup = document.getElementById('chatAttachmentPopup');
  const attachBtn = document.getElementById('chatAttachBtn');
  if (popup && !popup.classList.contains('hidden')) {
    if (!popup.contains(e.target) && !attachBtn?.contains(e.target)) {
      popup.classList.add('hidden');
    }
  }
});

function triggerFileInput(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.click();
}

// 9.3. Subida y Envío de Archivos (Imágenes máx 16MB, Documentos máx 25MB)
async function handleFileSelected(event, type) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!activeLeadPhone) {
    alert('Seleccione un prospecto primero.');
    event.target.value = '';
    return;
  }

  if (type === 'image') {
    const maxImgBytes = 16 * 1024 * 1024;
    if (file.size > maxImgBytes) {
      alert(`⚠️ La imagen seleccionada pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB.\n\nEl límite máximo permitido para imágenes de WhatsApp es de 16 MB.`);
      event.target.value = '';
      return;
    }
  } else {
    const maxDocBytes = 25 * 1024 * 1024;
    if (file.size > maxDocBytes) {
      alert(`⚠️ El documento seleccionado pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB.\n\nEl límite máximo permitido para documentos de WhatsApp es de 25 MB.`);
      event.target.value = '';
      return;
    }
  }

  const caption = prompt(`¿Deseas agregar un comentario o pie de mensaje para "${file.name}"? (Opcional):`, '') || '';

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = reader.result;
    const attachBtn = document.getElementById('chatAttachBtn');
    if (attachBtn) {
      attachBtn.disabled = true;
      attachBtn.classList.add('opacity-50');
    }

    try {
      const res = await fetch('/api/client/chat/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-pin': currentPin
        },
        body: JSON.stringify({
          phone: activeLeadPhone,
          fileBase64: base64Data,
          fileName: file.name,
          mimeType: file.type,
          caption
        })
      });
      const data = await res.json();
      if (res.ok) {
        selectLeadForDetail(activeLeadPhone);
      } else {
        alert('Error al enviar archivo: ' + (data.error || 'Error desconocido'));
      }
    } catch (err) {
      alert('Error de red al subir archivo: ' + err.message);
    } finally {
      if (attachBtn) {
        attachBtn.disabled = false;
        attachBtn.classList.remove('opacity-50');
      }
      event.target.value = '';
    }
  };
  reader.readAsDataURL(file);
}

// 9.4. Grabadora de Notas de Voz Nativas (Press & Hold + Cancel Slide)
let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceRecordingStream = null;
let voiceRecordingTimerInterval = null;
let voiceRecordStartTime = 0;
let voiceRecordStartX = 0;
let isVoiceCancelled = false;

function setupVoiceRecorder() {
  const micBtn = document.getElementById('chatMicBtn');
  if (!micBtn) return;

  const startRecording = async (e) => {
    if (!activeLeadPhone) {
      alert('Seleccione un prospecto primero.');
      return;
    }

    try {
      voiceAudioChunks = [];
      isVoiceCancelled = false;
      voiceRecordStartX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      voiceRecordStartTime = Date.now();

      voiceRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';
      }

      voiceMediaRecorder = new MediaRecorder(voiceRecordingStream, { mimeType });
      voiceMediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          voiceAudioChunks.push(event.data);
        }
      };

      voiceMediaRecorder.onstop = async () => {
        clearInterval(voiceRecordingTimerInterval);
        const overlay = document.getElementById('chatRecordingOverlay');
        if (overlay) overlay.classList.add('hidden');

        if (voiceRecordingStream) {
          voiceRecordingStream.getTracks().forEach((t) => t.stop());
          voiceRecordingStream = null;
        }

        const duration = Date.now() - voiceRecordStartTime;
        if (isVoiceCancelled) {
          console.log('[VoiceRecorder] Grabación cancelada por deslizamiento.');
          return;
        }

        if (duration < 800) {
          console.log('[VoiceRecorder] Audio muy corto (<800ms), descartado.');
          return;
        }

        if (voiceAudioChunks.length === 0) return;

        const audioBlob = new Blob(voiceAudioChunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          try {
            const res = await fetch('/api/client/chat/send-voice', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-client-pin': currentPin
              },
              body: JSON.stringify({
                phone: activeLeadPhone,
                audioBase64: base64Audio
              })
            });
            const data = await res.json();
            if (res.ok) {
              selectLeadForDetail(activeLeadPhone);
            } else {
              alert('Error despachando nota de voz: ' + (data.error || 'Error desconocido'));
            }
          } catch (err) {
            alert('Error de red enviando nota de voz: ' + err.message);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      voiceMediaRecorder.start();

      const overlay = document.getElementById('chatRecordingOverlay');
      const timerEl = document.getElementById('chatRecordingTimer');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.remove('opacity-50');
      }

      voiceRecordingTimerInterval = setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - voiceRecordStartTime) / 1000);
        const mins = String(Math.floor(elapsedSecs / 60)).padStart(2, '0');
        const secs = String(elapsedSecs % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      }, 500);

    } catch (err) {
      console.error('[VoiceRecorder] Error al acceder al micrófono:', err);
      alert('No se pudo acceder al micrófono para grabar la nota de voz. Por favor verifica los permisos del navegador.');
    }
  };

  const checkSlideCancel = (e) => {
    if (!voiceMediaRecorder || voiceMediaRecorder.state !== 'recording') return;
    const currentX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const diffX = currentX - voiceRecordStartX;
    if (diffX < -65) {
      isVoiceCancelled = true;
      const overlay = document.getElementById('chatRecordingOverlay');
      if (overlay) overlay.classList.add('opacity-50');
    }
  };

  const stopRecording = () => {
    if (voiceMediaRecorder && voiceMediaRecorder.state === 'recording') {
      voiceMediaRecorder.stop();
    }
  };

  micBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    startRecording(e);
  });

  window.addEventListener('pointermove', checkSlideCancel);

  window.addEventListener('pointerup', () => {
    stopRecording();
  });

  window.addEventListener('pointercancel', () => {
    isVoiceCancelled = true;
    stopRecording();
  });
}

// 9.5. Sincronización Selectiva de Conversaciones de WhatsApp
let rawWhatsAppConversations = [];

async function openSyncChatsModal() {
  const modal = document.getElementById('syncChatsModal');
  const container = document.getElementById('syncChatsListContainer');
  const counter = document.getElementById('syncSelectionCounter');
  const selectAll = document.getElementById('syncSelectAllCheckbox');
  if (!modal || !container) return;

  modal.classList.remove('hidden');
  if (selectAll) selectAll.checked = false;
  if (counter) counter.textContent = '0 seleccionados';

  container.innerHTML = `
    <div class="text-center py-8 text-slate-400 text-xs">
      <i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400"></i>
      Cargando conversaciones detectadas en WhatsApp...
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch('/api/client/whatsapp/conversations', {
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al obtener conversaciones');

    rawWhatsAppConversations = data.conversations || [];
    renderSyncChatsList();
  } catch (err) {
    container.innerHTML = `
      <div class="text-center py-6 text-red-400 text-xs">
        <i data-lucide="alert-circle" class="w-5 h-5 mx-auto mb-2 text-red-400"></i>
        ${escapeHtml(err.message)}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}

function closeSyncChatsModal() {
  const modal = document.getElementById('syncChatsModal');
  if (modal) modal.classList.add('hidden');
}

function renderSyncChatsList() {
  const container = document.getElementById('syncChatsListContainer');
  if (!container) return;

  if (rawWhatsAppConversations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 text-xs">
        No se encontraron conversaciones activas en la sesión actual de WhatsApp.
      </div>
    `;
    return;
  }

  container.innerHTML = rawWhatsAppConversations.map((conv, idx) => {
    const isExisting = conv.alreadyInCrm;
    const initial = (conv.name || conv.phone).charAt(0).toUpperCase();
    const dateFormatted = conv.timestamp ? new Date(conv.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div class="flex items-center gap-3 p-2.5 rounded-xl border ${isExisting ? 'bg-card/30 border-white/[0.04] opacity-60' : 'bg-card/70 hover:bg-card border-white/[0.08] transition'}">
        <input 
          type="checkbox" 
          id="syncChat_${idx}" 
          data-phone="${conv.phone}"
          data-name="${escapeHtml(conv.name || '')}"
          data-last="${escapeHtml(conv.lastMessage || '')}"
          ${isExisting ? 'disabled' : 'checked'}
          onchange="updateSyncSelectionCounter()"
          class="sync-chat-item rounded bg-surface border-white/20 text-emerald-500 focus:ring-emerald-500/30 w-4 h-4 cursor-pointer flex-shrink-0 disabled:opacity-40"
        />
        <div class="w-8 h-8 rounded-full bg-surface border border-white/10 flex items-center justify-center text-xs font-serif font-bold text-emerald-400 flex-shrink-0">
          ${initial}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-sans font-medium text-white truncate">${escapeHtml(conv.name || conv.phone)}</span>
            <span class="text-[10px] text-slate-500 font-mono flex-shrink-0">${dateFormatted}</span>
          </div>
          <p class="text-[11px] text-slate-400 truncate mt-0.5">${escapeHtml(conv.lastMessage || 'Sin mensajes recientes')}</p>
        </div>
        ${isExisting ? `
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-400 flex-shrink-0">En CRM</span>
        ` : `
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 flex-shrink-0">Nuevo</span>
        `}
      </div>
    `;
  }).join('');

  updateSyncSelectionCounter();
  if (window.lucide) lucide.createIcons();
}

function toggleSelectAllSyncChats(isChecked) {
  const checkboxes = document.querySelectorAll('.sync-chat-item:not(:disabled)');
  checkboxes.forEach(cb => {
    cb.checked = isChecked;
  });
  updateSyncSelectionCounter();
}

function updateSyncSelectionCounter() {
  const checkboxes = document.querySelectorAll('.sync-chat-item:checked');
  const counter = document.getElementById('syncSelectionCounter');
  if (counter) {
    counter.textContent = `${checkboxes.length} seleccionados`;
  }
}

async function submitSyncSelectedChats() {
  const checkboxes = document.querySelectorAll('.sync-chat-item:checked');
  if (checkboxes.length === 0) {
    alert('Por favor selecciona al menos una conversación para sincronizar.');
    return;
  }

  const selectedList = [];
  checkboxes.forEach(cb => {
    selectedList.push({
      phone: cb.dataset.phone,
      name: cb.dataset.name,
      lastMessage: cb.dataset.last
    });
  });

  const btn = document.getElementById('syncSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Importando...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/client/whatsapp/sync-leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ conversations: selectedList })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message || 'Conversaciones sincronizadas correctamente.'}`);
      closeSyncChatsModal();
      fetchOverview();
    } else {
      alert('Error sincronizando conversaciones: ' + (data.error || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error de red al sincronizar: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download-cloud" class="w-3.5 h-3.5"></i><span>Importar Seleccionados</span>';
      if (window.lucide) lucide.createIcons();
    }
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
  if (!currentPin || !phone) return;
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
    if (typeof handleChatInputChange === 'function') {
      handleChatInputChange(input.value);
    }
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
  const fleetView = document.getElementById('viewFleet');
  const btnWorkspace = document.getElementById('tabBtnWorkspace');
  const btnDiscovery = document.getElementById('tabBtnDiscovery');
  const btnMetrics = document.getElementById('tabBtnMetrics');
  const btnFleet = document.getElementById('tabBtnFleet');

  const activeClass = 'px-3.5 py-1 rounded-md text-xs font-medium flex items-center gap-2 transition bg-white/[0.05] text-gold border border-gold/20';
  const inactiveClass = 'px-3.5 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-white flex items-center gap-2 transition';

  if (workspaceView) workspaceView.classList.add('hidden');
  if (discoveryView) discoveryView.classList.add('hidden');
  if (metricsView) metricsView.classList.add('hidden');
  if (fleetView) fleetView.classList.add('hidden');

  if (btnWorkspace) btnWorkspace.className = inactiveClass;
  if (btnDiscovery) btnDiscovery.className = inactiveClass;
  if (btnMetrics) btnMetrics.className = inactiveClass;
  if (btnFleet) btnFleet.className = inactiveClass;

  if (view === 'workspace') {
    if (workspaceView) workspaceView.classList.remove('hidden');
    if (btnWorkspace) btnWorkspace.className = activeClass;
  } else if (view === 'discovery') {
    if (discoveryView) discoveryView.classList.remove('hidden');
    if (btnDiscovery) btnDiscovery.className = activeClass;
    loadDiscoveryServices();
    if (activeCampaignId) {
      renderActiveCampaignDetails(activeCampaignId);
    }
  } else if (view === 'metrics') {
    if (metricsView) metricsView.classList.remove('hidden');
    if (btnMetrics) btnMetrics.className = activeClass;
  } else if (view === 'fleet') {
    if (fleetView) fleetView.classList.remove('hidden');
    if (btnFleet) btnFleet.className = activeClass;
    loadFleetData();
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
  const totalContactedEl = document.getElementById('kpiTotalContacted');
  const replyRateEl = document.getElementById('kpiReplyRate');
  const repliedCountEl = document.getElementById('kpiRepliedCount');
  const meetingsEl = document.getElementById('kpiMeetingsScheduled');
  const qualifiedEl = document.getElementById('kpiQualified');

  if (totalContactedEl) totalContactedEl.textContent = m.outreachSent || 0;
  if (replyRateEl) replyRateEl.textContent = `${m.replyRatePercent || 0}%`;
  if (repliedCountEl) repliedCountEl.textContent = m.replied || 0;
  if (meetingsEl) meetingsEl.textContent = m.meetingsScheduled || 0;
  if (qualifiedEl) qualifiedEl.textContent = m.qualified || 0;

  if (m.settlement) {
    const s = m.settlement;
    const baseRetainerEl = document.getElementById('settlementBaseRetainer');
    const feeMeetingEl = document.getElementById('settlementFeePerMeeting');
    const attendedCountEl = document.getElementById('settlementAttendedCount');
    const varTotalEl = document.getElementById('settlementVariableTotal');
    const grandTotalEl = document.getElementById('settlementGrandTotal');

    if (baseRetainerEl) baseRetainerEl.textContent = `${s.currency} ${(s.baseRetainer || 0).toLocaleString()}`;
    if (feeMeetingEl) feeMeetingEl.textContent = s.successFeePerMeeting || 200;
    if (attendedCountEl) attendedCountEl.textContent = m.attendedMeetings || 0;
    if (varTotalEl) varTotalEl.textContent = `${s.currency} ${(s.variableTotal || 0).toLocaleString()}`;
    if (grandTotalEl) grandTotalEl.textContent = `${s.currency} ${(s.grandTotal || 0).toLocaleString()}`;
  }

  // Rampa Anti-Ban Dinámica
  if (m.warmup) {
    const w = m.warmup;
    const badge = document.getElementById('warmupStatusBadge');
    if (badge) {
      if (w.isWarmupActive) {
        badge.className = 'text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20';
        badge.textContent = `Warmup Activo · Fase ${w.activePhase} (${w.sentToday} / ${w.dailyLimit} msgs hoy)`;
      } else {
        badge.className = 'text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20';
        badge.textContent = `Línea Madura (${w.sentToday} / ${w.dailyLimit} msgs hoy)`;
      }
    }

    const stage1 = document.getElementById('warmupStage1');
    const stage2 = document.getElementById('warmupStage2');
    const stage3 = document.getElementById('warmupStage3');

    if (stage1) {
      stage1.className = w.activePhase === 1 
        ? 'p-3 bg-gold/10 rounded-lg border border-gold/40 flex items-center justify-between shadow-sm'
        : 'p-3 bg-obsidian rounded-lg border border-white/[0.06] flex items-center justify-between opacity-60';
    }
    if (stage2) {
      stage2.className = w.activePhase === 2
        ? 'p-3 bg-gold/10 rounded-lg border border-gold/40 flex items-center justify-between shadow-sm'
        : 'p-3 bg-obsidian rounded-lg border border-white/[0.06] flex items-center justify-between opacity-60';
    }
    if (stage3) {
      stage3.className = w.activePhase === 3
        ? 'p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/40 flex items-center justify-between shadow-sm'
        : 'p-3 bg-obsidian rounded-lg border border-white/[0.06] flex items-center justify-between opacity-60';
    }
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

// Sistema de Alertas Sonoras y Visuales en Vivo (Web Audio API)
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Tono 1 (587.33 Hz - Re5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Tono 2 (880 Hz - La5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.15, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.38);
  } catch (err) {
    // Silencioso si el navegador aún no ha recibido interacción
  }
}

function showNotificationToast(message) {
  let toast = document.getElementById('liveNotificationToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'liveNotificationToast';
    toast.className = 'fixed bottom-5 right-5 z-50 max-w-sm p-3.5 rounded-xl bg-surface/95 border border-gold/40 text-slate-100 shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs font-sans transition-all duration-300 transform translate-y-10 opacity-0 pointer-events-none';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center text-gold flex-shrink-0">
      <i data-lucide="bell" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-medium text-slate-100 text-xs">${escapeHtml(message)}</p>
      <span class="text-[10px] text-gold font-mono">En tiempo real</span>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  toast.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 5000);
}

// Notificaciones de Escritorio Nativas (Web Notifications API)
function requestDesktopNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch (err) {}
}

function showDesktopNotification(title, body, phone) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body: body,
        icon: 'https://cdn-icons-png.flaticon.com/512/124/124034.png',
        tag: `qp-chat-${phone || 'general'}`
      });
      notif.onclick = () => {
        window.focus();
        if (phone) {
          selectLeadForDetail(phone);
        }
        notif.close();
      };
    }
  } catch (err) {}
}

// 15. Real-Time SSE
function initSSE() {
  requestDesktopNotificationPermission();

  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/client/stream?pin=${encodeURIComponent(currentPin)}`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      if (event.type === 'ping' || event.type === 'connected') {
        return;
      }

      if (event.type === 'new_message') {
        const cleanEventPhone = (event.phone || '').replace(/[^0-9]/g, '');
        const cleanActivePhone = (activeLeadPhone || '').replace(/[^0-9]/g, '');

        if (event.role === 'user') {
          playNotificationSound();
          const senderName = event.companyName || ('+' + cleanEventPhone);
          const snippet = (event.content || '').slice(0, 80);
          showNotificationToast(`📩 Mensaje de ${senderName}: "${snippet}"`);
          showDesktopNotification(`📩 Mensaje de ${senderName}`, snippet, cleanEventPhone);
          
          if (document.hidden) {
            document.title = `(1) 📩 Mensaje de ${senderName} · QP`;
          }
        }

        if (cleanActivePhone && cleanActivePhone === cleanEventPhone) {
          selectLeadForDetail(activeLeadPhone);
        }
        fetchOverview();
      }

      if (event.type === 'lead_updated') {
        if (event.assignedRepName && currentUserRole === 'sales_rep' && event.assignedRepName === currentUserName) {
          playNotificationSound();
          const title = `👤 ¡Nuevo lead asignado!`;
          const body = `Se te ha asignado el prospecto +${event.phone}`;
          showNotificationToast(`${title} (+${event.phone})`);
          showDesktopNotification(title, body, event.phone);
        }
        fetchOverview();
      }

      if (event.type === 'appointment_booked' || event.type === 'meeting_attendance_updated' || event.type === 'settings_updated' || event.type === 'whatsapp_disconnected') {
        fetchOverview();
      }

      if (event.type === 'campaign_updated') {
        loadAllCampaigns();
        fetchOverview();
      }

      if (event.type === 'batch_dispatch_update') {
        updateBatchUI(event.job);
      }
    } catch (err) {
      console.error('Error parseando evento SSE:', err);
    }
  };

  eventSource.onerror = () => {
    console.warn('⚠️ [SSE] Reconectando flujo en tiempo real...');
  };
}

// Sincronización instantánea al regresar a la pestaña del navegador
window.addEventListener('focus', () => {
  document.title = 'The Quant Partners · Centro Comercial Autónomo';
  if (currentPin) {
    if (activeLeadPhone) {
      selectLeadForDetail(activeLeadPhone);
    }
    fetchOverview();
  }
});

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
  const tabs = ['whatsapp', 'team', 'ai', 'scraping', 'antiban', 'saar'];
  tabs.forEach(t => {
    const btn = document.getElementById(`settingsTabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`settingsTabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);

    if (t === tabName) {
      if (btn) {
        btn.className = 'px-3.5 py-2.5 text-xs font-sans border-b-2 border-gold text-gold font-medium flex items-center gap-1.5 transition flex-shrink-0';
      }
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) {
        btn.className = 'px-3.5 py-2.5 text-xs font-sans border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-medium flex items-center gap-1.5 transition flex-shrink-0';
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

let currentWhatsAppProvider = 'direct_qr';

function selectWhatsAppProvider(provider) {
  currentWhatsAppProvider = provider;

  const btnDirect = document.getElementById('btnProviderDirectQr');
  const btnMeta = document.getElementById('btnProviderMetaCloud');
  const secDirect = document.getElementById('providerDirectQrSection');
  const secMeta = document.getElementById('providerMetaCloudSection');

  if (provider === 'meta_cloud_api') {
    if (btnDirect) btnDirect.className = 'p-3 rounded-xl border border-white/[0.08] bg-card hover:border-gold/30 text-left transition flex items-start gap-2.5';
    if (btnMeta) btnMeta.className = 'p-3 rounded-xl border border-blue-500/40 bg-blue-500/10 text-left transition flex items-start gap-2.5';
    if (secDirect) secDirect.classList.add('hidden');
    if (secMeta) secMeta.classList.remove('hidden');
  } else {
    if (btnDirect) btnDirect.className = 'p-3 rounded-xl border border-gold/40 bg-gold/10 text-left transition flex items-start gap-2.5';
    if (btnMeta) btnMeta.className = 'p-3 rounded-xl border border-white/[0.08] bg-card hover:border-gold/30 text-left transition flex items-start gap-2.5';
    if (secDirect) secDirect.classList.remove('hidden');
    if (secMeta) secMeta.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

function copyMetaWebhookUrl() {
  const input = document.getElementById('settingMetaWebhookUrl');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    showNotificationToast('📋 URL de Webhook copiada al portapapeles.');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showNotificationToast('📋 URL de Webhook copiada.');
  });
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
    const isOwner = index === 0 || rep.isOwner === true;
    const row = document.createElement('div');
    row.className = `p-3.5 rounded-xl border ${rep.isActive ? (isOwner ? 'border-gold/30 bg-gold/[0.02]' : 'border-white/[0.08] bg-card') : 'border-white/[0.04] bg-card/40 opacity-60'} space-y-2.5 transition shadow-sm`;

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
          <span class="text-xs font-sans font-medium text-white">${rep.isActive ? 'Activo (Recibe Leads)' : 'En Pausa (No recibe leads)'}</span>
        </div>
        <div class="flex items-center gap-2">
          ${isOwner ? `
            <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-gold/15 text-gold border border-gold/30 flex items-center gap-1">
              <i data-lucide="crown" class="w-3 h-3"></i> Propietario / Director
            </span>
          ` : `
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-300 border border-white/[0.1] flex items-center gap-1">
              <i data-lucide="user" class="w-3 h-3"></i> Asesor Comercial
            </span>
          `}
          <span class="text-[11px] font-sans font-medium text-slate-400 bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06]">
            ${rep.leadsAssignedCount || 0} leads
          </span>
          ${isOwner ? `
            <span class="text-[10px] text-slate-500 font-mono px-2 py-0.5 rounded bg-white/[0.02] border border-white/[0.04]" title="El Administrador no puede ser eliminado">Principal</span>
          ` : `
            <button 
              type="button" 
              onclick="removeTeamRep(${index})" 
              class="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition hover:bg-rose-500/10" 
              title="Eliminar asesor"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          `}
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label class="block text-[11px] font-sans font-medium text-slate-400 mb-1">${isOwner ? 'Nombre del Administrador' : 'Nombre del Asesor'}</label>
          <input 
            type="text" 
            value="${escapeHtml(rep.name || (isOwner ? 'Kenneth (Director)' : ''))}" 
            placeholder="${isOwner ? 'Ej: Kenneth (Director)' : 'Ej: Carlos Asesor'}"
            oninput="updateTeamRepField(${index}, 'name', this.value)"
            class="w-full input-luxury px-3 py-1.5 text-xs text-white placeholder:text-slate-500 font-sans"
          />
        </div>
        <div>
          <label class="block text-[11px] font-sans font-medium text-slate-400 mb-1">${isOwner ? 'WhatsApp Notificaciones (519...)' : 'WhatsApp Alertas (519...)'}</label>
          <input 
            type="text" 
            value="${escapeHtml(rep.phone || '')}" 
            placeholder="Ej: 51902105668"
            oninput="updateTeamRepField(${index}, 'phone', this.value)"
            class="w-full input-luxury px-3 py-1.5 text-xs font-mono text-white placeholder:text-slate-500"
          />
        </div>
        <div>
          ${isOwner ? `
            <label class="block text-[11px] font-sans font-medium text-slate-400 mb-1">Tipo de Acceso</label>
            <div class="h-[31px] px-3 rounded-xl bg-obsidian border border-gold/30 flex items-center gap-2 text-gold text-xs font-mono font-medium select-none shadow-sm" title="El Administrador accede con la Clave Maestra de acceso">
              <i data-lucide="key-round" class="w-3.5 h-3.5 text-gold flex-shrink-0"></i>
              <span class="truncate">Clave Maestra (Admin)</span>
            </div>
          ` : `
            <label class="block text-[11px] font-sans font-medium text-gold mb-1">PIN Operador (4-6 dígitos)</label>
            <input 
              type="text" 
              maxlength="6"
              value="${escapeHtml(rep.pin || '')}" 
              placeholder="Ej: 1024"
              oninput="updateTeamRepField(${index}, 'pin', this.value)"
              class="w-full input-luxury px-3 py-1.5 text-xs font-mono text-gold placeholder:text-slate-500 border-gold/30"
            />
          `}
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  if (window.lucide) lucide.createIcons();
}

function addTeamRepSlot() {
  const nextNum = currentTeamReps.length + 1;
  const defaultPin = String(Math.floor(1000 + Math.random() * 9000));
  currentTeamReps.push({
    id: 'rep_' + Date.now(),
    name: `Asesor ${nextNum}`,
    phone: '',
    pin: defaultPin,
    isOwner: false,
    isActive: true,
    leadsAssignedCount: 0
  });
  renderTeamRepsList();
}

function removeTeamRep(index) {
  if (index === 0 || currentTeamReps[index]?.isOwner) {
    alert('El usuario Administrador / Propietario no puede ser eliminado de la configuración.');
    return;
  }
  const repName = currentTeamReps[index]?.name || 'este asesor';
  if (confirm(`¿Deseas eliminar a "${repName}" del equipo Round Robin?`)) {
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
    } else if (field === 'pin') {
      currentTeamReps[index].pin = value.trim();
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
      const defaultPin = String(Math.floor(1000 + Math.random() * 9000));
      currentTeamReps.push({
        id: 'rep_' + Date.now() + '_' + idx,
        name: defaultNames[idx] || `Asesor ${idx + 1}`,
        phone: '',
        pin: defaultPin,
        isOwner: false,
        isActive: true,
        leadsAssignedCount: 0
      });
    }
  } else if (currentTeamReps.length > n) {
    if (confirm(`Tienes ${currentTeamReps.length} asesores configurados. ¿Deseas ajustar la lista a ${n}?`)) {
      currentTeamReps = currentTeamReps.slice(0, Math.max(1, n));
    }
  }
  if (currentTeamReps[0]) {
    currentTeamReps[0].isOwner = true;
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
      <option value="google/gemini-2.5-flash" selected>Google Gemini 2.5 Flash (Ultra Rápido y Económico - Recomendado)</option>
      <option value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash</option>
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
// Configuración de Scraping & Apify (BYOK)
// -----------------------------------------------------------------
let currentApifyMode = 'managed';

function selectApifyMode(mode) {
  currentApifyMode = mode;
  const btnManaged = document.getElementById('btnApifyModeManaged');
  const btnCustom = document.getElementById('btnApifyModeCustom');
  const secCustom = document.getElementById('apifyCustomKeySection');

  if (mode === 'custom') {
    if (btnManaged) btnManaged.className = 'p-3 rounded-xl border border-white/[0.08] bg-card hover:border-gold/30 text-left transition flex items-start gap-2.5';
    if (btnCustom) btnCustom.className = 'p-3 rounded-xl border border-gold/40 bg-gold/10 text-left transition flex items-start gap-2.5';
    if (secCustom) secCustom.classList.remove('hidden');
  } else {
    if (btnManaged) btnManaged.className = 'p-3 rounded-xl border border-gold/40 bg-gold/10 text-left transition flex items-start gap-2.5';
    if (btnCustom) btnCustom.className = 'p-3 rounded-xl border border-white/[0.08] bg-card hover:border-gold/30 text-left transition flex items-start gap-2.5';
    if (secCustom) secCustom.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

function toggleApifyKeyVisibility() {
  const keyInput = document.getElementById('settingApifyToken');
  const icon = document.getElementById('apifyKeyVisibilityIcon');
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

async function handleTestApifyConnection() {
  const token = document.getElementById('settingApifyToken')?.value || '';
  const btn = document.getElementById('testApifyBtn');
  const btnText = document.getElementById('testApifyBtnText');
  const badge = document.getElementById('apifyTestResultBadge');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Consultando saldo...';
  if (badge) {
    badge.className = 'text-xs font-mono text-gold flex items-center gap-1';
    badge.innerHTML = '<i data-lucide="loader" class="w-3 h-3 animate-spin"></i><span>Validando con Apify API...</span>';
    badge.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/client/apify/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ token })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      if (badge) {
        badge.className = 'text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
        badge.innerHTML = `<i data-lucide="check-circle" class="w-3.5 h-3.5"></i><span>@${escapeHtml(data.username)} (${escapeHtml(data.plan)}) · Saldo: $${data.balanceUsd} USD</span>`;
      }
    } else {
      if (badge) {
        badge.className = 'text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
        badge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>${escapeHtml(data.error || 'Token inválido')}</span>`;
      }
    }
  } catch (err) {
    if (badge) {
      badge.className = 'text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5';
      badge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>${escapeHtml(err.message)}</span>`;
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Probar Conexión & Saldo';
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
    if (settings.salesReps && Array.isArray(settings.salesReps) && settings.salesReps.length > 0) {
      currentTeamReps = settings.salesReps;
    } else if (data.salesReps && Array.isArray(data.salesReps) && data.salesReps.length > 0) {
      currentTeamReps = data.salesReps;
    } else {
      currentTeamReps = [
        {
          id: 'rep_owner',
          name: 'Kenneth (Director)',
          phone: settings.adminWhatsAppPhone || '51902105668',
          isOwner: true,
          isActive: true,
          leadsAssignedCount: 0
        }
      ];
    }
    // Asegurar que el primer elemento sea Propietario
    if (currentTeamReps[0]) {
      currentTeamReps[0].isOwner = true;
    }
    renderTeamRepsList();

    // Poblado IA & LLMs
    const aiProviderEl = document.getElementById('settingAiProvider');
    const aiApiKeyEl = document.getElementById('settingAiApiKey');
    const aiModelEl = document.getElementById('settingAiModel');
    const aiKeyStatusBadge = document.getElementById('aiKeyStatusBadge');

    const defaultKey = '••••••••••••••••••••••••••••••••';
    const effectiveAiProvider = settings.aiProvider || 'openrouter';
    const effectiveModel = settings.aiModel || 'google/gemini-2.5-flash';
    const effectiveKey = settings.aiApiKey || defaultKey;

    if (aiProviderEl) {
      aiProviderEl.value = effectiveAiProvider;
      handleAiProviderChange(effectiveAiProvider);
    }
    if (aiModelEl) {
      aiModelEl.value = effectiveModel;
    }
    if (aiApiKeyEl) {
      aiApiKeyEl.value = effectiveKey;
      if (aiKeyStatusBadge) {
        aiKeyStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>OpenRouter Conectado</span>`;
        aiKeyStatusBadge.className = 'text-[11px] font-sans font-medium text-emerald-400 flex items-center gap-1.5';
      }
    }
    
    // Poblado Scraping & Apify
    const apifyTokenEl = document.getElementById('settingApifyToken');
    const apifyStatusBadge = document.getElementById('apifyKeyStatusBadge');
    const aiTabApifyStatusBadge = document.getElementById('aiTabApifyStatusBadge');

    if (apifyTokenEl) {
      apifyTokenEl.value = settings.apifyToken || '';
    }

    const isApifyActive = !!(settings.apifyToken || settings.hasServerApifyToken || settings.apifyConfigured);

    if (apifyStatusBadge) {
      if (isApifyActive) {
        apifyStatusBadge.className = 'text-[11px] font-sans font-medium text-emerald-400 flex items-center gap-1.5';
        apifyStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>Apify Conectado</span>`;
      } else {
        apifyStatusBadge.className = 'text-[11px] font-sans font-medium text-slate-400 flex items-center gap-1.5';
        apifyStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span><span>Sin Configurar</span>`;
      }
    }

    if (aiTabApifyStatusBadge) {
      if (isApifyActive) {
        aiTabApifyStatusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        aiTabApifyStatusBadge.textContent = '🟢 Conectado';
      } else {
        aiTabApifyStatusBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20';
        aiTabApifyStatusBadge.textContent = '⚪ Sin Configurar';
      }
    }

    // Poblado SaaR & Finanzas
    const currencyEl = document.getElementById('settingCurrency');
    const retainerEl = document.getElementById('settingMonthlyRetainer');
    const successFeeEl = document.getElementById('settingSuccessFee');
    const autoSwitchEl = document.getElementById('settingAutonomousSwitch');

    if (currencyEl) currencyEl.value = settings.currency || 'S/.';
    if (retainerEl) retainerEl.value = settings.monthlyRetainerFee ?? 2800;
    if (successFeeEl) successFeeEl.value = settings.successFeePerMeeting ?? 200;
    if (autoSwitchEl) autoSwitchEl.checked = !!data.isAutonomousActive;

    // Proveedor WhatsApp y Meta Cloud API
    const effectiveWaProvider = settings.whatsappProvider || 'direct_qr';
    selectWhatsAppProvider(effectiveWaProvider);

    const metaPhoneEl = document.getElementById('settingMetaPhoneId');
    const metaWabaEl = document.getElementById('settingMetaWabaId');
    const metaTokenEl = document.getElementById('settingMetaAccessToken');
    const metaVerifyEl = document.getElementById('settingMetaVerifyToken');

    if (metaPhoneEl) metaPhoneEl.value = settings.metaPhoneNumberId || '';
    if (metaWabaEl) metaWabaEl.value = settings.metaWabaId || '';
    if (metaTokenEl) metaTokenEl.value = settings.metaAccessToken || '';
    if (metaVerifyEl) metaVerifyEl.value = settings.metaWebhookVerifyToken || 'qp_verify_token_2026';

    // Estado WhatsApp
    const cardConnected = document.getElementById('settingsWaCardConnected');
    const cardDisconnected = document.getElementById('settingsWaCardDisconnected');
    const phoneEl = document.getElementById('settingsWaConnectedPhone');

    if (effectiveWaProvider === 'meta_cloud_api') {
      const isConfigured = !!(settings.metaPhoneNumberId && settings.metaAccessToken);
      if (phoneEl) {
        phoneEl.textContent = isConfigured ? `Phone ID: ${settings.metaPhoneNumberId}` : 'Credenciales requeridas';
      }
      if (cardConnected) {
        if (isConfigured) cardConnected.classList.remove('hidden');
        else cardConnected.classList.add('hidden');
      }
      if (cardDisconnected) cardDisconnected.classList.add('hidden');
    } else {
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

  const currency = document.getElementById('settingCurrency')?.value || 'S/.';
  const monthlyRetainerFee = parseFloat(document.getElementById('settingMonthlyRetainer')?.value || '2800');
  const successFeePerMeeting = parseFloat(document.getElementById('settingSuccessFee')?.value || '200');
  const isAutonomousActive = document.getElementById('settingAutonomousSwitch')?.checked;

  const metaPhoneNumberId = document.getElementById('settingMetaPhoneId')?.value?.trim() || '';
  const metaWabaId = document.getElementById('settingMetaWabaId')?.value?.trim() || '';
  const metaAccessToken = document.getElementById('settingMetaAccessToken')?.value?.trim() || '';
  const metaWebhookVerifyToken = document.getElementById('settingMetaVerifyToken')?.value?.trim() || '';
  const whatsappProvider = currentWhatsAppProvider || 'direct_qr';

  const useCustomApify = (currentApifyMode === 'custom');
  const apifyToken = document.getElementById('settingApifyToken')?.value?.trim() || '';

  if (minDelaySeconds < 60) {
    alert('Por seguridad anti-baneo, el delay mínimo no puede ser menor a 60 segundos.');
    return;
  }

  // Filtrar asesores válidos (con nombre)
  const validReps = currentTeamReps
    .filter(r => r.name && r.name.trim().length > 0)
    .map((r, idx) => ({
      ...r,
      isOwner: idx === 0 || r.isOwner === true,
      pin: (idx === 0 || r.isOwner === true) ? '' : (r.pin || '').trim()
    }));

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
        aiModel,
        currency,
        monthlyRetainerFee,
        successFeePerMeeting,
        whatsappProvider,
        metaPhoneNumberId,
        metaWabaId,
        metaAccessToken,
        metaWebhookVerifyToken,
        useCustomApify,
        apifyToken
      })
    });

    // Toggle autonomous pipeline if changed
    if (typeof isAutonomousActive === 'boolean') {
      try {
        await fetch('/api/client/pipeline/toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-pin': currentPin
          },
          body: JSON.stringify({ active: isAutonomousActive })
        });
      } catch (pipeErr) {
        console.warn('Error toggling pipeline:', pipeErr);
      }
    }

    const data = await res.json();
    if (res.ok && data.success) {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 block';
        alertBox.textContent = '✅ Configuración, credenciales Apify, honorarios SaaR y equipo guardados en PostgreSQL correctamente.';
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

// =================================================================
// 16. GESTIÓN INTEGRAL DE CAMPAÑAS Y FORMULACIÓN CON IA
// =================================================================
async function openCampaignsModal() {
  const modal = document.getElementById('campaignsModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  await renderCampaignsModalList();
  if (window.lucide) lucide.createIcons();
}

function closeCampaignsModal() {
  const modal = document.getElementById('campaignsModal');
  if (modal) modal.classList.add('hidden');
}

async function renderCampaignsModalList() {
  const container = document.getElementById('campaignsListContainer');
  const countEl = document.getElementById('campaignsTotalCount');
  if (!container) return;

  container.innerHTML = `
    <div class="p-8 text-center text-xs text-gold font-mono flex items-center justify-center gap-2">
      <i data-lucide="loader" class="w-4 h-4 animate-spin"></i>
      <span>Cargando campañas de PostgreSQL...</span>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch('/api/client/services', {
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    const services = data.services || [];
    currentServicesList = services;

    if (countEl) countEl.textContent = services.length;

    if (services.length === 0) {
      container.innerHTML = `
        <div class="p-8 text-center text-xs text-slate-500 font-sans space-y-3">
          <i data-lucide="tag" class="w-8 h-8 text-slate-600 mx-auto"></i>
          <p>No hay campañas configuradas todavía.</p>
          <button onclick="openCreateCampaignModal()" class="px-4 py-2 btn-gold rounded-xl text-xs font-sans font-semibold inline-flex items-center gap-1.5">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>Crear la primera campaña con IA</span>
          </button>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = '';
    services.forEach(s => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-xl bg-card border border-white/[0.06] hover:border-white/[0.12] transition space-y-3';
      const initials = (s.name || 'CP').slice(0, 2).toUpperCase();

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-gold/10 text-gold border border-gold/25 flex items-center justify-center font-serif text-xs font-bold">
              ${escapeHtml(initials)}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h4 class="font-medium text-xs text-white font-sans">${escapeHtml(s.name)}</h4>
                <span class="text-[9px] font-mono text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">${escapeHtml(s.id)}</span>
              </div>
              <p class="text-[11px] text-slate-400 font-sans font-light truncate max-w-md">${escapeHtml(s.searchQueries ? s.searchQueries.join(', ') : 'Sin queries')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <label class="relative inline-flex items-center cursor-pointer" title="${s.isActive ? 'Campaña Activa' : 'Campaña Pausada'}">
              <input type="checkbox" ${s.isActive ? 'checked' : ''} onchange="handleToggleCampaign('${escapeHtml(s.id)}', this.checked)" class="sr-only peer">
              <div class="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-gold"></div>
            </label>
            <button onclick="handleDeleteCampaign('${escapeHtml(s.id)}')" class="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition" title="Eliminar campaña">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.04] text-center font-mono text-xs">
          <div class="p-2 rounded-lg bg-obsidian">
            <span class="text-[10px] text-slate-500 block uppercase">Prospectos</span>
            <span class="text-white font-semibold">${s.totalLeads ?? 0}</span>
          </div>
          <div class="p-2 rounded-lg bg-obsidian">
            <span class="text-[10px] text-slate-500 block uppercase">Enviados</span>
            <span class="text-sky-400 font-semibold">${s.sentLeads ?? 0}</span>
          </div>
          <div class="p-2 rounded-lg bg-obsidian">
            <span class="text-[10px] text-slate-500 block uppercase">Respondieron</span>
            <span class="text-gold font-semibold">${s.repliedLeads ?? 0}</span>
          </div>
          <div class="p-2 rounded-lg bg-obsidian">
            <span class="text-[10px] text-slate-500 block uppercase">Calificados</span>
            <span class="text-emerald-400 font-semibold">${s.qualifiedLeads ?? 0}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-rose-400 font-mono">Error cargando campañas: ${escapeHtml(err.message)}</div>`;
  }
}

async function handleToggleCampaign(serviceId, active) {
  try {
    const res = await fetch(`/api/client/services/${serviceId}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ active })
    });
    if (res.ok) {
      await loadAllCampaigns();
      await renderCampaignsModalList();
      await fetchOverview();
    }
  } catch (err) {
    console.error('Error alternando campaña:', err);
  }
}

async function handleDeleteCampaign(serviceId) {
  if (!confirm(`⚠️ ¿Deseas eliminar permanentemente la campaña "${serviceId}"?\n\nLos prospectos asociados conservarán su historial pero quedarán desvinculados de esta campaña.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/client/services/${serviceId}`, {
      method: 'DELETE',
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      if (activeCampaignId === serviceId) {
        activeCampaignId = null;
      }
      await loadAllCampaigns();
      await renderCampaignsModalList();
      await fetchOverview();
    } else {
      alert('Error eliminando la campaña.');
    }
  } catch (err) {
    alert('Error al comunicar la eliminación.');
  }
}

function openCreateCampaignModal(targetSelectId = null) {
  createCampaignTargetSelectId = targetSelectId;
  const modal = document.getElementById('createCampaignModal');
  if (!modal) return;

  const nameEl = document.getElementById('newCampName');
  const nicheEl = document.getElementById('newCampNiche');
  const solEl = document.getElementById('newCampSolution');
  const locEl = document.getElementById('newCampLocation');
  const tmplEl = document.getElementById('newCampTemplate');
  const followEl = document.getElementById('newCampFollowUp');
  const promptEl = document.getElementById('newCampPrompt');
  const alertBox = document.getElementById('newCampAlertBox');

  if (nameEl) nameEl.value = '';
  if (nicheEl) nicheEl.value = '';
  if (solEl) solEl.value = '';
  if (locEl) locEl.value = 'Lima, Peru';
  if (tmplEl) tmplEl.value = '';
  if (followEl) followEl.value = '';
  if (promptEl) promptEl.value = '';
  if (alertBox) {
    alertBox.classList.add('hidden');
    alertBox.innerHTML = '';
  }

  modal.classList.remove('hidden');
  if (nameEl) nameEl.focus();
  if (window.lucide) lucide.createIcons();
}

function closeCreateCampaignModal() {
  const modal = document.getElementById('createCampaignModal');
  if (modal) modal.classList.add('hidden');
  createCampaignTargetSelectId = null;
}

async function handleAiGenerateCampaign() {
  const name = document.getElementById('newCampName')?.value.trim();
  const niche = document.getElementById('newCampNiche')?.value.trim();
  const solution = document.getElementById('newCampSolution')?.value.trim();
  const location = document.getElementById('newCampLocation')?.value.trim();
  const btn = document.getElementById('btnAiGenCamp');
  const alertBox = document.getElementById('newCampAlertBox');

  if (!name || !niche) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-amber-500/10 border border-amber-500/20 text-amber-300 block';
      alertBox.textContent = 'Por favor ingresa al menos el Nombre de la Campaña y el Nicho / Sector.';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Generando propuesta...</span>';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/client/services/ai-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ name, niche, solution, location })
    });
    const data = await res.json();
    if (res.ok && data.success && data.proposal) {
      const p = data.proposal;
      if (document.getElementById('newCampTemplate')) document.getElementById('newCampTemplate').value = p.outreachTemplate || '';
      if (document.getElementById('newCampFollowUp')) document.getElementById('newCampFollowUp').value = p.followUpTemplate || '';
      if (document.getElementById('newCampPrompt')) document.getElementById('newCampPrompt').value = p.aiInstructions || '';
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 block';
        alertBox.textContent = '✅ Propuesta comercial y prompt formulados por IA con técnica de permiso en 2 pasos.';
      }
    } else {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        alertBox.textContent = data.error || 'No se pudo generar la propuesta con IA.';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Error al comunicarse con el generador de IA.';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="wand-2" class="w-3.5 h-3.5"></i><span>Generar con IA</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function handleNewCampTypeChange(val) {
  const modeContainer = document.getElementById('newCampInboundModeContainer');
  const kwContainer = document.getElementById('newCampKeywordsContainer');
  if (val === 'INBOUND_ADS') {
    if (modeContainer) modeContainer.classList.remove('hidden');
    if (kwContainer) kwContainer.classList.remove('hidden');
  } else {
    if (modeContainer) modeContainer.classList.add('hidden');
    if (kwContainer) kwContainer.classList.add('hidden');
  }
}

async function handleSaveNewCampaign() {
  const name = document.getElementById('newCampName')?.value.trim();
  const location = document.getElementById('newCampLocation')?.value.trim() || 'Lima, Peru';
  const outreachTemplate = document.getElementById('newCampTemplate')?.value.trim();
  const followUpTemplate = document.getElementById('newCampFollowUp')?.value.trim();
  const aiInstructions = document.getElementById('newCampPrompt')?.value.trim();
  const type = document.getElementById('newCampType')?.value || 'OUTBOUND';
  const inboundMode = document.getElementById('newCampInboundMode')?.value || 'COPILOT_ONLY';
  const keywordsRaw = document.getElementById('newCampKeywords')?.value.trim() || '';
  const triggerKeywords = keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : [];

  const btn = document.getElementById('btnSaveNewCamp');
  const alertBox = document.getElementById('newCampAlertBox');

  if (!name) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'El nombre de la campaña es obligatorio.';
    }
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/client/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        name,
        targetLocations: [location],
        outreachTemplate,
        followUpTemplate,
        aiInstructions,
        type,
        inboundMode,
        triggerKeywords,
        active: true
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeCreateCampaignModal();
      if (data.service?.id) {
        activeCampaignId = data.service.id;
      }
      await loadAllCampaigns();
      if (createCampaignTargetSelectId) {
        const targetSel = document.getElementById(createCampaignTargetSelectId);
        if (targetSel && data.service?.id) targetSel.value = data.service.id;
      }
      await renderCampaignsModalList();
      await fetchOverview();
      alert(`✅ Campaña "${name}" creada y activada exitosamente.`);
    } else {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        alertBox.textContent = data.error || 'Error al guardar la campaña.';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Error de conexión al guardar la campaña.';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

let scrapingProgressInterval = null;

async function handleSaveAndLaunchScraping() {
  const name = document.getElementById('newCampName')?.value.trim();
  const niche = document.getElementById('newCampNiche')?.value.trim();
  const solution = document.getElementById('newCampSolution')?.value.trim();
  const location = document.getElementById('newCampLocation')?.value.trim() || 'Lima, Peru';
  const outreachTemplate = document.getElementById('newCampTemplate')?.value.trim();
  const followUpTemplate = document.getElementById('newCampFollowUp')?.value.trim();
  const aiInstructions = document.getElementById('newCampPrompt')?.value.trim();
  const type = document.getElementById('newCampType')?.value || 'OUTBOUND';
  const inboundMode = document.getElementById('newCampInboundMode')?.value || 'COPILOT_ONLY';
  const maxResults = parseInt(document.getElementById('newCampScrapeLimit')?.value || '15', 10);

  const alertBox = document.getElementById('newCampAlertBox');
  const btn = document.getElementById('btnSaveAndScrapeCamp');

  if (!name) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Por favor ingresa un nombre para la campaña.';
    }
    return;
  }

  if (btn) btn.disabled = true;

  // 1. Guardar o registrar la campaña en PostgreSQL
  let serviceId = activeCampaignId;
  try {
    const resCamp = await fetch('/api/client/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-pin': currentPin },
      body: JSON.stringify({
        name,
        targetLocations: [location],
        outreachTemplate,
        followUpTemplate,
        aiInstructions,
        type,
        inboundMode,
        active: true
      })
    });
    const dataCamp = await resCamp.json();
    if (resCamp.ok && dataCamp.service?.id) {
      serviceId = dataCamp.service.id;
      activeCampaignId = serviceId;
    }
  } catch (e) {
    console.warn('Error registrando campaña:', e);
  }

  // 2. Generar query óptima a partir del nicho y ubicación
  let query = niche || name;
  const cleanCity = location.split(',')[0].trim().toLowerCase();
  if (!query.toLowerCase().includes(cleanCity)) {
    query = `${query} ${cleanCity}`;
  }

  // Cerrar modal de creación y abrir modal de progreso de scraping
  closeCreateCampaignModal();

  const progressModal = document.getElementById('scrapingProgressModal');
  const progressQuery = document.getElementById('scrapeProgressQuery');
  const progressTimer = document.getElementById('scrapeProgressTimer');
  const progressTitle = document.getElementById('scrapeProgressTitle');

  if (progressModal) progressModal.classList.remove('hidden');
  if (progressQuery) progressQuery.textContent = `Buscando: "${query}"`;
  if (progressTitle) progressTitle.textContent = `Extrayendo ${maxResults} prospectos en Google Maps...`;

  let elapsed = 0;
  if (scrapingProgressInterval) clearInterval(scrapingProgressInterval);
  scrapingProgressInterval = setInterval(() => {
    elapsed++;
    if (progressTimer) progressTimer.textContent = `${elapsed}s transcurridos`;
  }, 1000);

  try {
    const resScrape = await fetch('/api/client/scrape/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-pin': currentPin },
      body: JSON.stringify({
        source: 'google_maps',
        query,
        location,
        maxResults,
        countryCode: 'pe'
      })
    });

    const scrapeData = await resScrape.json();
    if (!resScrape.ok) throw new Error(scrapeData.error || 'Error ejecutando scraping');

    currentDiscoveredLeads = scrapeData.leads || [];
    
    // Cambiar a la vista de prospección si no estamos en ella
    switchMainView('discovery');
    
    await loadAllCampaigns();
    if (serviceId) {
      const previewSel = document.getElementById('previewServiceSelect');
      if (previewSel) previewSel.value = serviceId;
      const batchSel = document.getElementById('batchServiceSelect');
      if (batchSel) batchSel.value = serviceId;
    }

    renderScrapedLeadsPreview(currentDiscoveredLeads);

    const previewCard = document.getElementById('scrapePreviewCard');
    if (previewCard) {
      previewCard.classList.remove('hidden');
      previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    await fetchOverview();
    showNotificationToast(`✅ ${currentDiscoveredLeads.length} prospectos listos para revisar y despachar`);
  } catch (err) {
    alert('Error al extraer prospectos en Apify: ' + err.message);
  } finally {
    if (scrapingProgressInterval) clearInterval(scrapingProgressInterval);
    if (progressModal) progressModal.classList.add('hidden');
    if (btn) btn.disabled = false;
  }
}

// =================================================================
// 17. NUEVO CHAT DIRECTO (+ NUEVO CHAT)
// =================================================================
function openDirectChatModal() {
  const modal = document.getElementById('directChatModal');
  if (!modal) return;

  const phoneEl = document.getElementById('directChatPhone');
  const nameEl = document.getElementById('directChatName');
  const msgEl = document.getElementById('directChatMessage');
  const alertBox = document.getElementById('directChatAlertBox');

  if (phoneEl) phoneEl.value = '';
  if (nameEl) nameEl.value = '';
  if (msgEl) msgEl.value = '';
  if (alertBox) {
    alertBox.classList.add('hidden');
    alertBox.innerHTML = '';
  }

  const select = document.getElementById('directChatServiceSelect');
  if (select) {
    let opts = '<option value="">Directo / Sin Campaña</option>';
    currentServicesList.forEach(s => {
      opts += `<option value="${escapeHtml(s.id)}">🏷️ ${escapeHtml(s.name)}</option>`;
    });
    select.innerHTML = opts;
  }

  modal.classList.remove('hidden');
  if (phoneEl) phoneEl.focus();
  if (window.lucide) lucide.createIcons();
}

function closeDirectChatModal() {
  const modal = document.getElementById('directChatModal');
  if (modal) modal.classList.add('hidden');
}

async function handleCreateDirectChat() {
  const phoneInput = document.getElementById('directChatPhone');
  const nameInput = document.getElementById('directChatName');
  const serviceInput = document.getElementById('directChatServiceSelect');
  const messageInput = document.getElementById('directChatMessage');
  const btn = document.getElementById('btnSubmitDirectChat');
  const alertBox = document.getElementById('directChatAlertBox');

  const phone = (phoneInput?.value || '').trim();
  const name = (nameInput?.value || '').trim();
  const serviceId = serviceInput?.value || '';
  const initialMessage = (messageInput?.value || '').trim();

  if (!phone) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Por favor ingresa un número de teléfono celular.';
    }
    return;
  }

  if (btn) btn.disabled = true;
  if (alertBox) alertBox.classList.add('hidden');

  try {
    const res = await fetch('/api/client/leads/direct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        phone,
        name: name || undefined,
        serviceId: serviceId || undefined,
        initialMessage: initialMessage || undefined
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeDirectChatModal();
      await fetchOverview();
      if (data.lead && data.lead.phone) {
        selectLeadForDetail(data.lead.phone);
      }
    } else {
      if (alertBox) {
        alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
        alertBox.textContent = data.error || 'Error al crear la conversación.';
      }
    }
  } catch (err) {
    if (alertBox) {
      alertBox.className = 'p-3 rounded-xl text-xs font-sans bg-rose-500/10 border border-rose-500/20 text-rose-400 block';
      alertBox.textContent = 'Error de conexión con el servidor.';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =================================================================
// 18. CONSOLA DE DESPACHO EN LOTE (BATCH DISPATCH)
// =================================================================
// 21. DESPACHO SECUENCIAL EN LOTE ANTI-BAN (DISPATCH RUNNER)
// =================================================================
let batchSyncInterval = null;

async function handleStartBatchDispatch() {
  const serviceId = document.getElementById('batchServiceSelect')?.value;
  const btn = document.getElementById('btnStartBatchDispatch');
  if (!serviceId) {
    alert('Por favor selecciona una campaña para despachar el lote.');
    return;
  }

  if (!confirm(`¿Deseas iniciar el despacho secuencial de prospectos para la campaña seleccionada?\n\nLos mensajes se enviarán automáticamente con cadencia anti-ban (mínimo 180 segundos entre prospectos).`)) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span><span>Iniciando...</span>';
  }

  try {
    const res = await fetch('/api/client/campaign/batch-dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({ serviceId })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      updateBatchUI(data.job);
      startBatchSyncPolling();
    } else {
      alert(data.error || 'No se pudo iniciar el despacho en lote.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i><span>Despachar Lote Ahora</span>';
        if (window.lucide) lucide.createIcons();
      }
    }
  } catch (err) {
    alert('Error al iniciar el despacho.');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i><span>Despachar Lote Ahora</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handlePauseBatchDispatch() {
  try {
    const res = await fetch('/api/client/campaign/batch-dispatch/pause', {
      method: 'POST',
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (res.ok) updateBatchUI(data.job);
  } catch (err) {
    console.error('Error pausando lote:', err);
  }
}

async function handleResumeBatchDispatch() {
  try {
    const res = await fetch('/api/client/campaign/batch-dispatch/resume', {
      method: 'POST',
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (res.ok) {
      updateBatchUI(data.job);
      startBatchSyncPolling();
    }
  } catch (err) {
    console.error('Error reanudando lote:', err);
  }
}

async function handleStopBatchDispatch() {
  if (!confirm('¿Deseas detener el despacho del lote actual?')) return;
  try {
    const res = await fetch('/api/client/campaign/batch-dispatch/stop', {
      method: 'POST',
      headers: { 'x-client-pin': currentPin }
    });
    const data = await res.json();
    if (res.ok) updateBatchUI(data.job);
  } catch (err) {
    console.error('Error deteniendo lote:', err);
  }
}

function updateBatchUI(job) {
  const container = document.getElementById('batchProgressContainer');
  const startBtn = document.getElementById('btnStartBatchDispatch');
  if (!job) return;

  const sent = Number(job.sentCount ?? job.sent ?? 0);
  const total = Number(job.totalLeads ?? job.total ?? 0);

  if (job.status === 'IDLE' || job.status === 'STOPPED') {
    if (container) container.classList.add('hidden');
    if (batchCountdownInterval) {
      clearInterval(batchCountdownInterval);
      batchCountdownInterval = null;
    }
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      startBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i><span>Despachar Lote Ahora</span>';
    }
    return;
  }

  if (container) container.classList.remove('hidden');

  // Sincronizar selector si hay una campaña activa en despacho
  const batchSelect = document.getElementById('batchServiceSelect');
  if (batchSelect && job.serviceId && batchSelect.value !== job.serviceId) {
    batchSelect.value = job.serviceId;
  }

  const statusDot = document.getElementById('batchStatusDot');
  const statusLabel = document.getElementById('batchStatusLabel');
  const currentLead = document.getElementById('batchCurrentLead');
  const countsText = document.getElementById('batchCountsText');
  const countdownText = document.getElementById('batchCountdownText');
  const progressBar = document.getElementById('batchProgressBar');
  const pauseBtn = document.getElementById('btnPauseBatch');

  const invalid = Number(job.failedCount ?? job.invalidCount ?? 0);
  const processed = Number(job.processedCount ?? (sent + invalid));

  if (countsText) {
    const invalidInfo = invalid > 0 ? ` (${invalid} fijos)` : '';
    countsText.textContent = `${sent} / ${total} contactados${invalidInfo}`;
  }
  
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  if (progressBar) progressBar.style.width = `${pct}%`;

  if (currentLead) {
    currentLead.textContent = job.currentLeadName ? `→ ${job.currentLeadName}` : '';
  }

  if (job.status === 'RUNNING') {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.classList.add('opacity-60', 'cursor-not-allowed');
      startBtn.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1.5"></span><span>Despacho en marcha...</span>';
    }
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
    if (statusLabel) statusLabel.textContent = 'Despachando lote en vivo...';
    if (pauseBtn) {
      pauseBtn.onclick = handlePauseBatchDispatch;
      pauseBtn.innerHTML = '<i data-lucide="pause" class="w-3.5 h-3.5"></i><span>Pausar</span>';
    }

    if (batchCountdownInterval) clearInterval(batchCountdownInterval);
    if (job.nextRunAt) {
      const updateCountdown = () => {
        const remainingMs = Math.max(0, job.nextRunAt - Date.now());
        const remainingSec = Math.ceil(remainingMs / 1000);
        if (countdownText) {
          countdownText.textContent = remainingSec > 0 ? `(Próximo en ${remainingSec}s)` : '(Enviando...)';
        }
        if (remainingSec <= 0 && batchCountdownInterval) {
          clearInterval(batchCountdownInterval);
          setTimeout(() => fetchBatchStatus(), 2500);
        }
      };
      updateCountdown();
      batchCountdownInterval = setInterval(updateCountdown, 1000);
    }
  } else if (job.status === 'PAUSED') {
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.classList.add('opacity-60', 'cursor-not-allowed');
      startBtn.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 mr-1.5"></span><span>Despacho en pausa</span>';
    }
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    if (statusLabel) statusLabel.textContent = 'Despacho en Pausa';
    if (countdownText) countdownText.textContent = '(En pausa)';
    if (pauseBtn) {
      pauseBtn.onclick = handleResumeBatchDispatch;
      pauseBtn.innerHTML = '<i data-lucide="play" class="w-3.5 h-3.5"></i><span>Reanudar</span>';
    }
    if (batchCountdownInterval) {
      clearInterval(batchCountdownInterval);
      batchCountdownInterval = null;
    }
  } else if (job.status === 'COMPLETED') {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.classList.remove('opacity-60', 'cursor-not-allowed');
      startBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i><span>Despachar Lote Ahora</span>';
    }
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
    if (statusLabel) statusLabel.textContent = '¡Lote completado exitosamente!';
    if (countdownText) countdownText.textContent = '';
    if (batchCountdownInterval) clearInterval(batchCountdownInterval);
    setTimeout(() => {
      fetchOverview();
    }, 2000);
  }

  if (window.lucide) lucide.createIcons();
}

async function fetchBatchStatus() {
  if (!currentPin) return;
  try {
    const res = await fetch('/api/client/campaign/batch-dispatch/status', {
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.job) {
        updateBatchUI(data.job);
        if (data.job.status === 'RUNNING') {
          startBatchSyncPolling();
        } else if (data.job.status === 'IDLE' || data.job.status === 'COMPLETED' || data.job.status === 'STOPPED') {
          stopBatchSyncPolling();
        }
      }
    }
  } catch (err) {
    console.warn('Error sincronizando estado de lote:', err);
  }
}

function startBatchSyncPolling() {
  if (batchSyncInterval) return;
  batchSyncInterval = setInterval(() => {
    fetchBatchStatus();
  }, 5000);
}

function stopBatchSyncPolling() {
  if (batchSyncInterval) {
    clearInterval(batchSyncInterval);
    batchSyncInterval = null;
  }
}

// =================================================================
// 22. MASTER HUB · FLOTA DE NODOS SATÉLITE SAAR (EXCLUSIVO KENNETH)
// =================================================================

async function loadFleetData() {
  const container = document.getElementById('fleetClientsContainer');
  const emptyState = document.getElementById('fleetEmptyState');
  if (!container) return;

  try {
    const res = await fetch('/api/master/fleet', {
      headers: { 'x-client-pin': currentPin }
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        console.warn('Acceso denegado a Flota Master.');
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    currentFleetData = data;

    // Actualizar KPIs superiores
    const summary = data.summary || {};
    const totalEl = document.getElementById('fleetStatTotalClients');
    const activeRatioEl = document.getElementById('fleetStatActiveRatio');
    const leadsEl = document.getElementById('fleetStatTotalLeads');
    const qualEl = document.getElementById('fleetStatQualified');
    const meetingsEl = document.getElementById('fleetStatMeetings');
    const revenueEl = document.getElementById('fleetStatTotalRevenue');
    const revenueBreakdownEl = document.getElementById('fleetStatRevenueBreakdown');
    const badgeEl = document.getElementById('fleetClientCountBadge');

    if (totalEl) totalEl.textContent = summary.totalClients || 0;
    if (activeRatioEl) activeRatioEl.textContent = `${summary.activeClients || 0} online`;
    if (leadsEl) leadsEl.textContent = (summary.totalLeadsContacted || 0).toLocaleString();
    if (qualEl) qualEl.textContent = `${summary.totalQualifiedOpportunities || 0} calificados`;
    if (meetingsEl) meetingsEl.textContent = summary.totalMeetingsBooked || 0;
    if (revenueEl) revenueEl.textContent = `S/. ${(summary.totalFleetRevenue || 0).toLocaleString()}`;
    if (revenueBreakdownEl) {
      revenueBreakdownEl.textContent = `Retainers: S/. ${(summary.totalRetainerRevenue || 0).toLocaleString()} + Citas: S/. ${(summary.totalSuccessFees || 0).toLocaleString()}`;
    }
    if (badgeEl) badgeEl.textContent = `${(data.clients || []).length} cliente(s)`;

    // Renderizar tarjetas de clientes
    const clients = data.clients || [];
    if (clients.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = clients.map(c => {
      const isOnline = c.isWhatsAppConnected;
      const statusBadge = isOnline
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>Online</span>`
        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 border border-rose-500/25 text-rose-400"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>Desconectado</span>`;

      const targetBadge = c.deployTarget === 'vps'
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 border border-purple-500/20 text-purple-300">VPS Dedicado</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 border border-blue-500/20 text-blue-300">Railway Cloud</span>`;

      const meetings = c.meetingsBooked || 0;
      const fees = (c.successFees || 0).toLocaleString();
      const totalMonth = (c.totalMonthBilling || 2800).toLocaleString();

      return `
        <div class="card-luxury p-5 flex flex-col justify-between space-y-4 hover:border-gold/30 transition">
          <!-- Top Row -->
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 class="font-serif text-sm font-semibold text-white tracking-tight">${escapeHtml(c.companyName)}</h4>
                <p class="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-[200px]" title="${c.clientId}">${c.clientId}</p>
              </div>
              <div class="flex flex-col items-end gap-1">
                ${statusBadge}
                ${targetBadge}
              </div>
            </div>

            <!-- Stats Mini Grid -->
            <div class="grid grid-cols-4 gap-1.5 p-2.5 bg-obsidian rounded-xl border border-white/[0.04] text-center font-sans mt-3">
              <div>
                <p class="text-[9px] text-slate-500 uppercase font-semibold">Leads</p>
                <p class="text-xs font-mono font-bold text-slate-200 mt-0.5">${c.totalLeads || 0}</p>
              </div>
              <div>
                <p class="text-[9px] text-slate-500 uppercase font-semibold">Resp.</p>
                <p class="text-xs font-mono font-bold text-slate-200 mt-0.5">${c.repliedLeads || 0}</p>
              </div>
              <div>
                <p class="text-[9px] text-slate-500 uppercase font-semibold">Calif.</p>
                <p class="text-xs font-mono font-bold text-blue-400 mt-0.5">${c.qualifiedLeads || 0}</p>
              </div>
              <div>
                <p class="text-[9px] text-gold uppercase font-semibold">Citas</p>
                <p class="text-xs font-mono font-bold text-gold mt-0.5">${meetings}</p>
              </div>
            </div>

            <!-- Facturación Acumulada Box -->
            <div class="mt-3 p-2.5 bg-gold/[0.03] border border-gold/20 rounded-xl flex items-center justify-between text-xs font-sans">
              <div>
                <span class="text-[10px] text-slate-400">Facturación Acumulada:</span>
                <p class="text-[11px] text-slate-300 font-mono">Retainer S/. 2.8k + Fee S/. ${fees}</p>
              </div>
              <span class="font-mono font-bold text-gold text-sm">S/. ${totalMonth}</span>
            </div>
          </div>

          <!-- Bottom Actions -->
          <div class="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <button 
                type="button" 
                onclick="window.open('${c.dashboardUrl}', '_blank')" 
                class="px-3 py-1.5 rounded-lg btn-gold text-[11px] font-sans font-semibold flex items-center gap-1.5 shadow-sm"
                title="Abrir Centro de Mando del Cliente"
              >
                <span>Dashboard</span>
                <i data-lucide="external-link" class="w-3 h-3"></i>
              </button>

              <button 
                type="button" 
                onclick="showClientCredentials('${c.clientId}', '${escapeHtml(c.companyName)}', '${c.clientPin}', '${c.dashboardUrl}', '${c.deployTarget}')" 
                class="p-1.5 rounded-lg bg-surface hover:bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white text-[11px] transition"
                title="Ver Clave Maestra (PIN)"
              >
                <i data-lucide="key" class="w-3.5 h-3.5 text-gold"></i>
              </button>

              ${c.deployTarget === 'vps' ? `
                <button 
                  type="button" 
                  onclick="copyVpsInstallCommand('${c.clientId}')" 
                  class="p-1.5 rounded-lg bg-surface hover:bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white text-[11px] transition"
                  title="Copiar comando de instalación en 1 línea para VPS"
                >
                  <i data-lucide="terminal" class="w-3.5 h-3.5 text-purple-400"></i>
                </button>
              ` : ''}
            </div>

            <button 
              type="button" 
              onclick="handleDeleteClient('${c.clientId}', '${escapeHtml(c.companyName)}')" 
              class="p-1.5 rounded-lg bg-surface hover:bg-rose-500/10 border border-white/[0.06] text-slate-500 hover:text-rose-400 transition"
              title="Eliminar nodo de la flota"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error cargando flota SaaR:', err);
  }
}

function openProvisionModal() {
  const modal = document.getElementById('provisionModal');
  const form = document.getElementById('provisionForm');
  const successView = document.getElementById('provSuccessView');
  const errorBox = document.getElementById('provErrorBox');

  if (form) form.classList.remove('hidden');
  if (successView) successView.classList.add('hidden');
  if (errorBox) errorBox.classList.add('hidden');
  generateRandomClientPin();

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeProvisionModal() {
  const modal = document.getElementById('provisionModal');
  if (modal) modal.classList.add('hidden');
}

function handleProvCompanyInput(val) {
  const pinInput = document.getElementById('provClientPin');
  if (!val || !val.trim()) return;
  const clean = val.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
  if (clean && (!pinInput.dataset.manual || pinInput.dataset.manual === 'false')) {
    pinInput.value = `${clean}QP#2026`;
  }
}

function generateRandomClientPin() {
  const pinInput = document.getElementById('provClientPin');
  const rand = Math.floor(1000 + Math.random() * 9000);
  if (pinInput) {
    pinInput.value = `ClienteQP#${rand}`;
    pinInput.dataset.manual = 'true';
  }
}

async function handleProvisionSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('provisionForm');
  const btn = document.getElementById('provSubmitBtn');
  const btnText = document.getElementById('provSubmitBtnText');
  const errorBox = document.getElementById('provErrorBox');

  const companyName = document.getElementById('provCompanyName').value.trim();
  const adminPhone = document.getElementById('provAdminPhone').value.trim();
  const niche = document.getElementById('provNicheSelect').value;
  const closingMode = document.getElementById('provClosingMode').value;
  const clientPin = document.getElementById('provClientPin').value.trim();
  const deployTarget = document.querySelector('input[name="provDeployTarget"]:checked')?.value || 'railway';

  if (!companyName || !adminPhone) {
    if (errorBox) {
      errorBox.textContent = 'Nombre de empresa y WhatsApp de notificaciones son obligatorios.';
      errorBox.classList.remove('hidden');
    }
    return;
  }

  btn.disabled = true;
  btnText.textContent = 'Aprovisionando Infraestructura Desacoplada...';
  if (errorBox) errorBox.classList.add('hidden');

  try {
    const res = await fetch('/api/master/provision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify({
        companyName,
        adminPhone,
        niche,
        closingMode,
        clientPin,
        deployTarget
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error al aprovisionar satélite');
    }

    // Mostrar vista de éxito
    form.classList.add('hidden');
    const successView = document.getElementById('provSuccessView');
    successView.classList.remove('hidden');

    document.getElementById('provSuccessCompany').textContent = `${companyName} (${data.clientId})`;
    const urlEl = document.getElementById('provSuccessUrl');
    urlEl.textContent = data.dashboardUrl;
    urlEl.href = data.dashboardUrl;

    document.getElementById('provSuccessPin').textContent = data.clientPin;
    document.getElementById('provSuccessOpenBtn').href = data.dashboardUrl;

    const vpsBox = document.getElementById('provSuccessVpsBox');
    if (data.deployTarget === 'vps' && data.installCommand) {
      vpsBox.classList.remove('hidden');
      document.getElementById('provSuccessCommand').textContent = data.installCommand;
    } else {
      vpsBox.classList.add('hidden');
    }

    // Recargar datos de la flota en segundo plano
    loadFleetData();

  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Aprovisionar Nodo en 1 Clic';
    if (window.lucide) lucide.createIcons();
  }
}

function copyProvDashboardUrl() {
  const url = document.getElementById('provSuccessUrl').textContent;
  if (url) {
    navigator.clipboard.writeText(url);
    alert('✅ URL del Dashboard copiada al portapapeles.');
  }
}

function copyProvPin() {
  const pin = document.getElementById('provSuccessPin').textContent;
  if (pin) {
    navigator.clipboard.writeText(pin);
    alert('✅ Clave Maestra (PIN) copiada al portapapeles.');
  }
}

function copyProvCommand() {
  const cmd = document.getElementById('provSuccessCommand').textContent;
  if (cmd) {
    navigator.clipboard.writeText(cmd);
    alert('✅ Comando de instalación VPS copiado al portapapeles.');
  }
}

function copyVpsInstallCommand(clientId) {
  const masterOrigin = window.location.origin;
  const cmd = `curl -fsSL ${masterOrigin}/api/master/install/${clientId} | bash`;
  navigator.clipboard.writeText(cmd);
  alert(`✅ Comando de instalación para "${clientId}" copiado:\n\n${cmd}\n\nEjecútalo como root en el VPS.`);
}

function showClientCredentials(clientId, companyName, pin, url, deployTarget) {
  alert(`🔐 CREDENCIALES DEL NODO SATÉLITE\n\nEmpresa: ${companyName}\nID: ${clientId}\nTipo: ${deployTarget.toUpperCase()}\n\nURL Dashboard: ${url}\nPIN de Acceso: ${pin}`);
}

async function handleDeleteClient(clientId, name) {
  if (!confirm(`¿Estás seguro de eliminar a "${name}" (${clientId}) de la flota SaaR? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/master/client/${clientId}`, {
      method: 'DELETE',
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      loadFleetData();
    } else {
      alert('Error eliminando cliente de la flota');
    }
  } catch (err) {
    alert('Error de conexión: ' + err.message);
  }
}

// =================================================================
// 23. ONBOARDING WIZARD DE 3 PASOS (PARA INSTANCIAS CLIENTE VÍRGENES)
// =================================================================

function openOnboardingWizard() {
  const modal = document.getElementById('onboardingWizardModal');
  if (!modal) return;
  currentWizardStep = 1;
  renderWizardStep(1);
  modal.classList.remove('hidden');
  startWizardQrPolling();
  if (window.lucide) lucide.createIcons();
}

function closeOnboardingWizard() {
  const modal = document.getElementById('onboardingWizardModal');
  if (modal) modal.classList.add('hidden');
  stopWizardQrPolling();
}

function renderWizardStep(step) {
  currentWizardStep = step;
  const content1 = document.getElementById('wizardStepContent1');
  const content2 = document.getElementById('wizardStepContent2');
  const content3 = document.getElementById('wizardStepContent3');
  const tab1 = document.getElementById('wizardStepTab1');
  const tab2 = document.getElementById('wizardStepTab2');
  const tab3 = document.getElementById('wizardStepTab3');
  const badge = document.getElementById('wizardStepNumberBadge');
  const prevBtn = document.getElementById('wizardPrevBtn');
  const nextBtnText = document.getElementById('wizardNextBtnText');

  if (content1) content1.classList.toggle('hidden', step !== 1);
  if (content2) content2.classList.toggle('hidden', step !== 2);
  if (content3) content3.classList.toggle('hidden', step !== 3);

  const activeTab = 'pb-1 border-b-2 border-gold text-gold font-semibold flex items-center justify-center gap-1.5';
  const inactiveTab = 'pb-1 border-b-2 border-white/[0.1] text-slate-500 flex items-center justify-center gap-1.5';

  if (tab1) tab1.className = step === 1 ? activeTab : inactiveTab;
  if (tab2) tab2.className = step === 2 ? activeTab : inactiveTab;
  if (tab3) tab3.className = step === 3 ? activeTab : inactiveTab;

  if (badge) badge.textContent = `Paso ${step} de 3`;
  if (prevBtn) prevBtn.classList.toggle('hidden', step === 1);

  if (nextBtnText) {
    if (step === 1) nextBtnText.textContent = 'Continuar al Paso 2: IA & Scraping →';
    else if (step === 2) nextBtnText.textContent = 'Continuar al Paso 3: Activación →';
    else if (step === 3) nextBtnText.textContent = '🚀 Finalizar y Activar Motor Comercial';
  }

  if (step === 1) {
    refreshWizardQr();
  }

  if (window.lucide) lucide.createIcons();
}

function wizardNextStep() {
  if (currentWizardStep === 1) {
    renderWizardStep(2);
  } else if (currentWizardStep === 2) {
    renderWizardStep(3);
  } else if (currentWizardStep === 3) {
    submitCompleteOnboarding();
  }
}

function wizardPrevStep() {
  if (currentWizardStep > 1) {
    renderWizardStep(currentWizardStep - 1);
  }
}

async function refreshWizardQr() {
  const qrImg = document.getElementById('wizardQrImg');
  const qrLoading = document.getElementById('wizardQrLoading');
  const statusBadge = document.getElementById('wizardWaStatusBadge');

  if (!qrImg) return;

  try {
    const res = await fetch('/api/client/overview', {
      headers: { 'x-client-pin': currentPin }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.isWhatsAppReady) {
        if (qrLoading) qrLoading.classList.add('hidden');
        if (statusBadge) {
          statusBadge.className = 'mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono bg-emerald-500/10 border border-emerald-500/25 text-emerald-400';
          statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span><span>✅ ¡WhatsApp Conectado Exitosamente!</span>';
        }
        return;
      }

      if (data.qrData) {
        qrImg.src = data.qrData;
        if (qrLoading) qrLoading.classList.add('hidden');
      }
    }
  } catch (e) {
    console.warn('Error refrescando QR de wizard:', e);
  }
}

function startWizardQrPolling() {
  stopWizardQrPolling();
  wizardQrPollInterval = setInterval(refreshWizardQr, 4000);
}

function stopWizardQrPolling() {
  if (wizardQrPollInterval) {
    clearInterval(wizardQrPollInterval);
    wizardQrPollInterval = null;
  }
}

async function submitCompleteOnboarding() {
  const aiProvider = document.getElementById('wizardAiProvider')?.value || 'openrouter';
  const aiApiKey = document.getElementById('wizardAiApiKey')?.value?.trim() || '';
  const apifyToken = document.getElementById('wizardApifyToken')?.value?.trim() || '';
  const directorName = document.getElementById('wizardDirectorName')?.value?.trim() || '';
  const directorPhone = document.getElementById('wizardDirectorPhone')?.value?.trim() || '';

  const nextBtn = document.getElementById('wizardNextBtn');
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<span>Guardando y Activando...</span>';
  }

  try {
    const payload = {
      aiProvider,
      aiApiKey,
      apifyToken,
      useCustomApify: !!apifyToken,
      adminWhatsAppPhone: directorPhone,
      onboardingCompleted: true
    };

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentPin
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeOnboardingWizard();
      alert('🎉 ¡Felicitaciones! Tu Centro de Mando SaaR ha sido configurado y activado exitosamente.');
      fetchOverview();
    } else {
      const errData = await res.json();
      alert('Error guardando configuración: ' + (errData.error || 'Desconocido'));
    }
  } catch (err) {
    alert('Error de conexión al guardar configuración: ' + err.message);
  } finally {
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = '<span>🚀 Finalizar y Activar Motor Comercial</span>';
    }
  }
}
