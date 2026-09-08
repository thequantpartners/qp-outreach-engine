// =================================================================
// THE QUANT PARTNERS · SUPERADMIN FLEET CONSOLE (MASTER HUB)
// =================================================================

let currentMasterPin = localStorage.getItem('qp_client_pin') || '';
let currentFleetData = null;
let currentStatusFilter = 'ALL';
let currentSearchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();

  if (currentMasterPin) {
    const ok = await verifyMasterAccess(currentMasterPin);
    if (ok) {
      loadFleetData();
    } else {
      showMasterPinModal();
    }
  } else {
    showMasterPinModal();
  }
});

function showMasterPinModal() {
  const modal = document.getElementById('masterPinModal');
  if (modal) modal.classList.remove('hidden');
  const input = document.getElementById('masterPinInput');
  if (input) input.focus();
  if (window.lucide) lucide.createIcons();
}

function hideMasterPinModal() {
  const modal = document.getElementById('masterPinModal');
  if (modal) modal.classList.add('hidden');
}

async function verifyMasterAccess(pin) {
  try {
    const res = await fetch('/api/master/fleet', {
      headers: { 'x-client-pin': pin }
    });
    if (res.ok) {
      currentMasterPin = pin;
      localStorage.setItem('qp_client_pin', pin);
      localStorage.setItem('qp_user_role', 'owner');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function handleMasterPinSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('masterPinInput');
  const err = document.getElementById('masterPinError');
  const btn = document.getElementById('masterPinSubmitBtn');
  const pin = input.value.trim();

  if (!pin) return;
  btn.disabled = true;
  if (err) err.classList.add('hidden');

  const ok = await verifyMasterAccess(pin);
  btn.disabled = false;

  if (ok) {
    hideMasterPinModal();
    loadFleetData();
  } else {
    if (err) {
      err.textContent = 'Clave Maestra incorrecta o sin permisos de SuperAdmin.';
      err.classList.remove('hidden');
    }
  }
}

function handleMasterLogout() {
  if (confirm('¿Cerrar sesión de SuperAdmin?')) {
    localStorage.removeItem('qp_client_pin');
    sessionStorage.removeItem('qp_client_pin');
    window.location.href = '/';
  }
}

// =================================================================
// 2. CARGA Y TELEMETRÍA DE LA FLOTA
// =================================================================

async function loadFleetData() {
  const container = document.getElementById('fleetClientsContainer');
  const emptyState = document.getElementById('fleetEmptyState');
  if (!container) return;

  try {
    const res = await fetch('/api/master/fleet', {
      headers: { 'x-client-pin': currentMasterPin }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        showMasterPinModal();
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

    renderFilteredClients();

  } catch (err) {
    console.error('Error cargando flota SaaR:', err);
  }
}

function renderFilteredClients() {
  const container = document.getElementById('fleetClientsContainer');
  const emptyState = document.getElementById('fleetEmptyState');
  const badgeEl = document.getElementById('fleetClientCountBadge');
  if (!container || !currentFleetData) return;

  let clients = currentFleetData.clients || [];

  // Filtro por Estado
  if (currentStatusFilter === 'ONLINE') {
    clients = clients.filter(c => c.isWhatsAppConnected);
  } else if (currentStatusFilter === 'OFFLINE') {
    clients = clients.filter(c => !c.isWhatsAppConnected);
  }

  // Filtro por Búsqueda
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    clients = clients.filter(c => 
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.clientId || '').toLowerCase().includes(q) ||
      (c.niche || '').toLowerCase().includes(q)
    );
  }

  if (badgeEl) badgeEl.textContent = `${clients.length} cliente(s)`;

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

    const nicheBadge = c.niche 
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-white/[0.08] text-slate-400 uppercase">${c.niche}</span>`
      : '';

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
              <div class="flex items-center gap-1">
                ${targetBadge}
                ${nicheBadge}
              </div>
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
          <div class="flex items-center gap-1.5 flex-wrap">
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
              onclick="openCredentialsModal('${c.clientId}', '${escapeHtml(c.companyName)}', '${c.clientPin}', '${c.dashboardUrl}')" 
              class="p-1.5 rounded-lg bg-surface hover:bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white text-[11px] transition"
              title="Ver Clave Maestra (PIN)"
            >
              <i data-lucide="key" class="w-3.5 h-3.5 text-gold"></i>
            </button>

            <button 
              type="button" 
              onclick="openCloneModal('${c.clientId}', '${escapeHtml(c.companyName)}')" 
              class="p-1.5 rounded-lg bg-surface hover:bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white text-[11px] transition"
              title="Clonar configuración y prompts para un nuevo cliente"
            >
              <i data-lucide="copy" class="w-3.5 h-3.5 text-blue-400"></i>
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
}

function filterFleetClients(query) {
  currentSearchQuery = query.trim();
  renderFilteredClients();
}

function filterFleetByStatus(status) {
  currentStatusFilter = status;
  const btnAll = document.getElementById('filterBtnAll');
  const btnOnline = document.getElementById('filterBtnOnline');
  const btnOffline = document.getElementById('filterBtnOffline');

  const activeClass = 'px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition bg-white/[0.08] text-gold border border-gold/30';
  const inactiveClass = 'px-2.5 py-1 rounded-lg text-xs font-mono font-medium text-slate-400 hover:text-white transition';

  if (btnAll) btnAll.className = status === 'ALL' ? activeClass : inactiveClass;
  if (btnOnline) btnOnline.className = status === 'ONLINE' ? activeClass : inactiveClass;
  if (btnOffline) btnOffline.className = status === 'OFFLINE' ? activeClass : inactiveClass;

  renderFilteredClients();
}

// =================================================================
// 3. APROVISIONAMIENTO EN 60s
// =================================================================

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
        'x-client-pin': currentMasterPin
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

// =================================================================
// 4. CLONADO DE NODOS SATÉLITE
// =================================================================

function openCloneModal(clientId, companyName) {
  const modal = document.getElementById('cloneModal');
  const sourceInput = document.getElementById('cloneSourceClientId');
  const sourceLabel = document.getElementById('cloneSourceLabel');
  const nameInput = document.getElementById('cloneNewCompanyName');
  const phoneInput = document.getElementById('cloneNewAdminPhone');
  const err = document.getElementById('cloneErrorBox');

  if (sourceInput) sourceInput.value = clientId;
  if (sourceLabel) sourceLabel.textContent = `${companyName} (${clientId})`;
  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (err) err.classList.add('hidden');

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeCloneModal() {
  const modal = document.getElementById('cloneModal');
  if (modal) modal.classList.add('hidden');
}

async function handleCloneSubmit(e) {
  e.preventDefault();
  const sourceClientId = document.getElementById('cloneSourceClientId').value;
  const newCompanyName = document.getElementById('cloneNewCompanyName').value.trim();
  const newAdminPhone = document.getElementById('cloneNewAdminPhone').value.trim();
  const err = document.getElementById('cloneErrorBox');
  const btn = document.getElementById('cloneSubmitBtn');

  if (!newCompanyName || !newAdminPhone) return;

  btn.disabled = true;
  btn.innerHTML = '<span>Clonando...</span>';
  if (err) err.classList.add('hidden');

  try {
    const res = await fetch('/api/master/clone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-pin': currentMasterPin
      },
      body: JSON.stringify({
        sourceClientId,
        newCompanyName,
        newAdminPhone
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error clonando satélite');
    }

    closeCloneModal();
    alert(`? ¡Nodo clonado exitosamente!

Nuevo Cliente: ${newCompanyName}
Dashboard: ${data.dashboardUrl}
PIN: ${data.clientPin}`);
    loadFleetData();

  } catch (error) {
    if (err) {
      err.textContent = error.message;
      err.classList.remove('hidden');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Clonar Satélite en 1 Clic</span>';
    if (window.lucide) lucide.createIcons();
  }
}

// =================================================================
// 5. BLUEPRINTS POR NICHO
// =================================================================

async function openBlueprintsModal() {
  const modal = document.getElementById('blueprintsModal');
  const container = document.getElementById('blueprintsListContainer');
  if (!modal || !container) return;

  modal.classList.remove('hidden');
  container.innerHTML = '<p class="text-xs text-slate-400 p-4">Cargando catálogo de blueprints...</p>';

  try {
    const res = await fetch('/api/master/blueprints', {
      headers: { 'x-client-pin': currentMasterPin }
    });
    const data = await res.json();
    const blueprints = data.blueprints || [];

    container.innerHTML = blueprints.map(b => `
      <div class="card-luxury p-4 space-y-3 border border-white/[0.08] hover:border-gold/30 transition flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono text-gold uppercase tracking-wider bg-gold/10 px-2 py-0.5 rounded border border-gold/20">${b.niche}</span>
            <span class="text-[10px] font-mono text-slate-400">${b.closingMode}</span>
          </div>
          <h4 class="font-serif text-sm font-semibold text-white mt-2">${escapeHtml(b.name)}</h4>
          <p class="text-xs text-slate-400 font-sans mt-1 line-clamp-2">${escapeHtml(b.description || '')}</p>
        </div>
        <div class="pt-2 border-t border-white/[0.06] flex items-center justify-between">
          <span class="text-[11px] font-mono text-slate-500">${(b.targetQueries || []).length} queries</span>
          <button 
            type="button" 
            onclick="deployFromBlueprint('${b.niche}')" 
            class="px-3 py-1.5 rounded-lg btn-gold text-[11px] font-sans font-semibold flex items-center gap-1 shadow-sm"
          >
            <span>Desplegar</span>
            <i data-lucide="arrow-right" class="w-3 h-3"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    container.innerHTML = '<p class="text-xs text-rose-400 p-4">Error cargando catálogo de blueprints.</p>';
  }
}

function closeBlueprintsModal() {
  const modal = document.getElementById('blueprintsModal');
  if (modal) modal.classList.add('hidden');
}

function deployFromBlueprint(niche) {
  closeBlueprintsModal();
  openProvisionModal();
  const select = document.getElementById('provNicheSelect');
  if (select) select.value = niche;
}

// =================================================================
// 6. CREDENCIALES Y ELIMINACIÓN
// =================================================================

function openCredentialsModal(clientId, companyName, pin, url) {
  const modal = document.getElementById('credentialsModal');
  const compEl = document.getElementById('credModalCompany');
  const idEl = document.getElementById('credModalId');
  const pinEl = document.getElementById('credModalPin');
  const urlEl = document.getElementById('credModalUrl');

  if (compEl) compEl.textContent = companyName;
  if (idEl) idEl.textContent = clientId;
  if (pinEl) pinEl.textContent = pin;
  if (urlEl) {
    urlEl.textContent = url;
    urlEl.href = url;
  }

  if (modal) modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeCredentialsModal() {
  const modal = document.getElementById('credentialsModal');
  if (modal) modal.classList.add('hidden');
}

async function handleDeleteClient(clientId, name) {
  if (!confirm(`¿Estás seguro de eliminar el nodo satélite "${name}" (${clientId}) de la flota SaaR? Esta acción es irreversible.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/master/client/${clientId}`, {
      method: 'DELETE',
      headers: { 'x-client-pin': currentMasterPin }
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
// 7. UTILIDADES DE COPIADO Y SANITIZACIÓN
// =================================================================

function copyProvDashboardUrl() {
  const url = document.getElementById('provSuccessUrl')?.textContent;
  if (url) {
    navigator.clipboard.writeText(url);
    alert('✅ URL del Dashboard copiada al portapapeles.');
  }
}

function copyProvPin() {
  const pin = document.getElementById('provSuccessPin')?.textContent;
  if (pin) {
    navigator.clipboard.writeText(pin);
    alert('✅ Clave Maestra (PIN) copiada al portapapeles.');
  }
}

function copyProvCommand() {
  const cmd = document.getElementById('provSuccessCommand')?.textContent;
  if (cmd) {
    navigator.clipboard.writeText(cmd);
    alert('✅ Comando de instalación VPS copiado al portapapeles.');
  }
}

function copyVpsInstallCommand(clientId) {
  const masterOrigin = window.location.origin;
  const cmd = `curl -fsSL ${masterOrigin}/api/master/install/${clientId} | bash`;
  navigator.clipboard.writeText(cmd);
  alert(`✅ Comando de instalación para "${clientId}" copiado:

${cmd}

Ejecútalo como root en el VPS.`);
}

function copyElementText(id) {
  const el = document.getElementById(id);
  if (el) {
    navigator.clipboard.writeText(el.textContent);
    alert('✅ Copiado al portapapeles.');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
