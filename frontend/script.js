let BARANGAYS = [];

let isLoggedIn = false;
let allYouths = [];
let currentBarangayId = null;

// Safety stubs in case Next/Prev buttons are clicked before script has fully initialized.
window.nextTab = window.nextTab || function(target) { console.warn('nextTab called before initialization', target); };
window.prevTab = window.prevTab || function(target) { console.warn('prevTab called before initialization', target); };

// Small helper utilities to reduce repetition
const $id = id => document.getElementById(id);
const val = id => ($id(id) && $id(id).value) || '';
const chk = id => !!($id(id) && $id(id).checked);
const setVal = (id, v) => { const e = $id(id); if (e) e.value = v || ''; };
const setChk = (id, v) => { const e = $id(id); if (e) e.checked = !!v; };

// Read color variables from CSS so PDF colors can be controlled from style.css
function hexToRgbArray(hex) {
	if (!hex) return null;
	hex = hex.trim();
	// rgb(...) format
	if (hex.startsWith('rgb')) {
		const nums = hex.replace(/[^0-9,]/g,'').split(',').map(n => parseInt(n,10));
		return nums.slice(0,3);
	}
	// #rrggbb
	if (hex.startsWith('#')) {
		const h = hex.substring(1);
		if (h.length === 3) {
			return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
		}
		if (h.length === 6) {
			return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
		}
	}
	return null;
}

function cssVarRgb(varName, fallback) {
	try {
		const raw = getComputedStyle(document.documentElement).getPropertyValue(varName) || '';
		const rgb = hexToRgbArray(raw.trim()) || fallback;
		return rgb;
	} catch (e) { return fallback; }
}

// Build the standard summary table rows used by CSV and PDF exporters
function buildSummaryRows(data) {
	const AGE_START = 15, AGE_END = 30;
	const ageCols = [];
	for (let a = AGE_START; a <= AGE_END; a++) ageCols.push(String(a));
	const rows = [];
	rows.push(['DEMOGRAPHICS', ...ageCols, 'TOTAL']);
	rows.push(['Barangay', ...ageCols.map(()=>''), data.barangay_name || '']);
	rows.push(['Total Youth', ...ageCols.map(()=>''), data.total ?? 0]);
	rows.push([]);

	// SEX
	rows.push(['SEX ASSIGNED BY BIRTH', ...ageCols.map(()=>''), '']);
	const sexByAge = data.sex_by_age || {};
	const sexKeys = Object.keys(sexByAge).length ? Object.keys(sexByAge) : ['Male','Female'];
	for (const s of sexKeys) {
		const rowAges = ageCols.map(a => (sexByAge[s] && sexByAge[s][a]) ? sexByAge[s][a] : 0);
		const total = rowAges.reduce((s,v)=>s+Number(v),0) || (data.sex && (data.sex[s] || data.sex[s.toLowerCase()]) ) || 0;
		rows.push([s.toUpperCase(), ...rowAges, total]);
	}
	rows.push([]);

	// AGE
	const ageCounts = ageCols.map(a => (data.ages && data.ages[a]) ? data.ages[a] : 0);
	rows.push(['AGE', ...ageCounts, ageCounts.reduce((s,v)=>s+Number(v),0)]);
	rows.push([]);

	// CIVIL STATUS
	rows.push(['CIVIL STATUS', ...ageCols.map(()=>''), '']);
	const civilByAge = data.civil_by_age || {};
	const csKeys = Object.keys(civilByAge).length ? Object.keys(civilByAge) : Object.keys(data.civil_status || {});
	if (csKeys.length === 0) rows.push(['No civil status data', ...ageCols.map(()=>''), '']);
	for (const k of csKeys) {
		const rowAges = ageCols.map(a => (civilByAge[k] && civilByAge[k][a]) ? civilByAge[k][a] : 0);
		const total = rowAges.reduce((s,v)=>s+Number(v),0) || (data.civil_status && (data.civil_status[k] ?? 0));
		rows.push([k.toUpperCase(), ...rowAges, total]);
	}
	rows.push([]);

	// EDUCATION
	rows.push(['EDUCATION', ...ageCols.map(()=>''), '']);
	const eduByAge = data.education_by_age || {};
	const eduKeys = Object.keys(eduByAge).length ? Object.keys(eduByAge) : Object.keys(data.education || {});
	if (eduKeys.length === 0) rows.push(['No education data', ...ageCols.map(()=>''), '']);
	for (const k of eduKeys) {
		const rowAges = ageCols.map(a => (eduByAge[k] && eduByAge[k][a]) ? eduByAge[k][a] : 0);
		const total = rowAges.reduce((s,v)=>s+Number(v),0) || (data.education && (data.education[k] ?? 0));
		rows.push([k.toUpperCase(), ...rowAges, total]);
	}
	rows.push([]);

	// SPECIAL COUNTS
	rows.push(['SPECIAL COUNTS', ...ageCols.map(()=>''), '']);
	rows.push(['PWD', ...ageCols.map(()=>''), (data.pwd ?? 0)]);
	rows.push(['4Ps', ...ageCols.map(()=>''), (data.fourps ?? 0)]);

	// OSY split by sex where available
	const osyMale = (data.osy_male != null) ? data.osy_male : null;
	const osyFemale = (data.osy_female != null) ? data.osy_female : null;
	const osyTotal = (data.osy != null) ? data.osy : ((osyMale != null && osyFemale != null) ? (osyMale + osyFemale) : 0);
	rows.push(['OSY - Male', ...ageCols.map(()=>''), (osyMale ?? '')]);
	rows.push(['OSY - Female', ...ageCols.map(()=>''), (osyFemale ?? '')]);
	rows.push(['OSY (Total)', ...ageCols.map(()=>''), osyTotal]);

	return { ageCols, rows };
}

document.addEventListener("DOMContentLoaded", async () => {
	// Determine if we're already on the login page (various deploy paths)
	const path = window.location.pathname || '';
	const onLoginPage = path.endsWith('/login/') || path.endsWith('login.html') || path === '/login' || path === '/login/';

	// Check authentication status and redirect unauthenticated users to the login page
	const logged = await checkUserStatus();
	if (!logged && !onLoginPage) {
		window.location.href = '/login/';
		return;
	}

	// Only initialize page-specific UI if elements exist (login page doesn't have dashboard elements)
	if (document.getElementById('barangay-grid') || document.getElementById('youth-data')) {
		fetchBarangays();
		fetchYouths();
	}
	// page-specific UI initialization complete
	updateTabState();
	attachAutoToggles(); // Attach Next/Prev handlers for buttons added in HTML (prevents inline onclick errors)
	document.querySelectorAll('.btn-next').forEach(btn => {
		btn.addEventListener('click', (ev) => {
			const tgt = btn.getAttribute('data-target');
			if (tgt) nextTab(tgt);
		});
	});
	document.querySelectorAll('.btn-prev').forEach(btn => {
		btn.addEventListener('click', (ev) => {
			const tgt = btn.getAttribute('data-target');
			if (tgt) prevTab(tgt);
		});
	});
});

// Attach listeners once to automatically toggle related checkboxes when admin inputs data
function attachAutoToggles() {
	const ids = ['disability_type','specific_needs_condition','scholarship_program','kk_assembly_times','kk_assembly_no_reason','number_of_children', 'tribe_name', 'muslim_group'];
	ids.forEach(id => {
		const el = document.getElementById(id);
		if (!el) return;
		// Attach both input and change where applicable to be responsive across browsers
		el.addEventListener('input', updateAutoTogglesState);
		el.addEventListener('change', updateAutoTogglesState);
	});

	// Also update toggles when the modal is shown, in case listeners were missed
	const modal = document.getElementById('youthModal');
	if (modal) modal.addEventListener('shown.bs.modal', () => setTimeout(updateAutoTogglesState, 10));
}

// Update checkboxes based on current form values
function updateAutoTogglesState() {
	const get = id => document.getElementById(id);
	const disability = get('disability_type');
	const specific = get('specific_needs_condition');
	const scholarProg = get('scholarship_program');
	const kkTimes = get('kk_assembly_times');
	const kkReason = get('kk_assembly_no_reason');
	const numChildren = get('number_of_children');

	if (disability) {
		const pwd = get('is_pwd');
		if (pwd) pwd.checked = String(disability.value || '').trim() !== '';
	}

	if (specific) {
		const specChk = get('has_specific_needs');
		if (specChk) specChk.checked = String(specific.value || '').trim() !== '';
	}

	if (scholarProg) {
		const schChk = get('is_scholar');
		if (schChk) schChk.checked = String(scholarProg.value || '').trim() !== '';
	}

	if (kkTimes || kkReason) {
		const kkChk = get('attended_kk_assembly');
		if (kkChk) {
			const times = parseInt(kkTimes?.value || 0) || 0;
			if (times > 0) kkChk.checked = true;
			else if (kkReason && String(kkReason.value || '').trim() !== '') kkChk.checked = false;
			else kkChk.checked = false;
		}
	}

	if (numChildren) {
		const fourChk = get('is_4ps');
		const n = parseInt(numChildren.value || 0) || 0;
		if (fourChk) fourChk.checked = n > 0;
	}

	// If tribe_name field has a value, mark as IP (indigenous people)
	const tribe = get('tribe_name');
	if (tribe) {
		const ipChk = get('is_ip');
		if (ipChk) ipChk.checked = String(tribe.value || '').trim() !== '';
	}

	// If muslim_group field has a value, mark as Muslim
	const mg = get('muslim_group');
	if (mg) {
		const muslimChk = get('is_muslim');
		if (muslimChk) muslimChk.checked = String(mg.value || '').trim() !== '';
	}
}

function fetchBarangays() {
	fetch('/api/barangays/').then(res => res.json()).then(data => {
		if (Array.isArray(data) && data.length) {
			BARANGAYS = data;
		}
		renderDashboard();
		populateBarangayDropdown();
	}).catch(err => {
		console.warn('Could not fetch barangays, falling back to empty list', err);
		renderDashboard();
		populateBarangayDropdown();
	});
}

function getYouthById(id) {
	return allYouths.find(y => y.id == id);
}

function renderDashboard() {
	const grid = document.getElementById('barangay-grid');
	// compute counts per barangay from allYouths
	const counts = {};
	if (Array.isArray(allYouths)) {
		allYouths.forEach(y => {
			const id = String(y.barangay_id);
			counts[id] = (counts[id] || 0) + 1;
		});
	}

	grid.innerHTML = BARANGAYS.map(b => {
		const cnt = counts[String(b.id)] || 0;
		return `
		<div class="col-lg-3 col-md-4 col-sm-6">
			<div class="card barangay-card shadow-sm" onclick="openBarangay(${b.id}, '${b.name}')">
				<div class="card-body d-flex flex-column align-items-center">
					<div class="mb-2" style="width:56px;height:56px;border-radius:10px;background:#eef6ff;display:flex;align-items:center;justify-content:center;">
						<img src="/static/images/home.svg" class="barangay-icon" alt="icon">
					</div>
					<h5>${b.name}</h5>
					<small>Click to Manage</small>
				</div>
				<div class="barangay-badge"><img src="/static/images/People.png" alt=""> ${cnt} youth</div>
			</div>
		</div>
	`}).join('');
}

// Simple client-side filter for the barangay grid search input
function filterBarangayGrid(term) {
    term = (term || '').toLowerCase();
    const grid = document.getElementById('barangay-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.card')); // cards correspond to BARANGAYS order
    cards.forEach((card, idx) => {
        const name = (BARANGAYS[idx] && BARANGAYS[idx].name || '').toLowerCase();
        card.parentElement.style.display = name.includes(term) ? '' : 'none';
    });
}

function filterBarangays() {
	// No-op: global barangay search was removed from UI.
}

// globalSearch removed from UI; search is handled by local controls

async function fetchBarangaySummary(bid) {
	const res = await fetch(`/api/barangay_summary/${bid}/`);
	if (!res.ok) throw new Error('Failed to fetch summary: ' + res.status);
	return res.json();
}

function viewBarangaySummary() {
	if (!currentBarangayId) return alert('Open a barangay first');
	fetchBarangaySummary(currentBarangayId).then(data => {
		const content = document.getElementById('summary-content');
		const buildRows = (obj, sortNumeric=false) => {
			if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) return '<tr><td class="text-muted">No data</td><td></td></tr>';
			const keys = Object.keys(obj);
			if (sortNumeric) keys.sort((a,b)=>Number(a)-Number(b)); else keys.sort();
			return keys.map(k => `<tr><td>${k}</td><td class="text-end">${obj[k]}</td></tr>`).join('');
		};

		content.innerHTML = `
			<h5>${data.barangay_name} — Summary</h5>
			<p><strong>Total youth:</strong> ${data.total}</p>
			<div class="row">
				<div class="col-md-6">
					<h6 class="mt-3">Sex</h6>
					<table class="table table-sm table-borderless">
						<tbody>${buildRows(data.sex)}</tbody>
					</table>
					<h6 class="mt-3">Civil Status</h6>
					<table class="table table-sm table-borderless">
						<tbody>${buildRows(data.civil_status)}</tbody>
					</table>
				</div>
				<div class="col-md-6">
					<h6 class="mt-3">Ages</h6>
					<table class="table table-sm table-borderless">
						<tbody>${buildRows(data.ages, true)}</tbody>
					</table>
					<h6 class="mt-3">Education</h6>
					<table class="table table-sm table-borderless">
						<tbody>${buildRows(data.education)}</tbody>
					</table>
				</div>
			</div>
			<div class="mt-3">
				<p><strong>Special counts:</strong></p>
				<ul>
					<li>PWD: <strong>${data.pwd ?? 0}</strong></li>
					<li>4Ps: <strong>${data.fourps ?? 0}</strong></li>
					<li>OSY — Male: <strong>${data.osy_male ?? 0}</strong></li>
					<li>OSY — Female: <strong>${data.osy_female ?? 0}</strong></li>
					<li>OSY (Total): <strong>${(data.osy != null) ? data.osy : ((data.osy_male ?? 0) + (data.osy_female ?? 0))}</strong></li>
				</ul>
			</div>
		`;
		new bootstrap.Modal(document.getElementById('summaryModal')).show();
	}).catch(err => alert(err.message));
}

function downloadBarangaySummaryCSV() {
	if (!currentBarangayId) return alert('Open a barangay first');
	fetchBarangaySummary(currentBarangayId).then(data => {
		const { rows } = buildSummaryRows(data);
		const csv = rows.map(r => r.map(cell => '"' + (cell ?? '') + '"').join(',')).join('\n');
		const blob = new Blob([csv], {type: 'text/csv'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url;
		a.download = `${(data.barangay_name||'Barangay').replace(/\s+/g,'_')}_demographics_summary.csv`;
		document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
	}).catch(err => alert(err.message));
}

function downloadBarangaySummaryPDF() {
	if (!currentBarangayId) return alert('Open a barangay first');
	fetchBarangaySummary(currentBarangayId).then(data => {
		try {
			const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
			if (!jsPDF) return alert('PDF library not loaded');

			const { ageCols, rows: body } = buildSummaryRows(data);
			const head = ['DEMOGRAPHICS', ...ageCols, 'TOTAL'];

			// Build PDF with header that resembles the printed form
			const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
			if (typeof doc.autoTable !== 'function') return alert('jsPDF AutoTable plugin not loaded');
			const pageWidth = doc.internal.pageSize.getWidth();
			let startY = 40;

			doc.setFontSize(10);
			doc.text('Republic of the Philippines', pageWidth/2, startY, { align: 'center' }); startY += 14;
			doc.text('Province of Bukidnon', pageWidth/2, startY, { align: 'center' }); startY += 14;
			doc.text('Municipality of Manolo Fortich', pageWidth/2, startY, { align: 'center' }); startY += 28;
			doc.setFontSize(16);
			doc.text((data.barangay_name || 'BARANGAY').toUpperCase(), pageWidth/2, startY, { align: 'center' }); startY += 20;
			doc.setFontSize(12);
			doc.text('OFFICE OF THE SANGGUNIANG KABATAAN', pageWidth/2, startY, { align: 'center' }); startY += 16;
			doc.setFontSize(13);
			doc.text('SUMMARY OF KATIPUNAN NG KABATAAN (KK) PROFILING', pageWidth/2, startY, { align: 'center' }); startY += 18;

			// small descriptive paragraph (shortened) under header
			doc.setFontSize(9);
			const para = 'Section 5(b) of the Implementing Rules and Regulations (IRR) of RA No. 10742 states that the Katipunan ng Kabataan (KK) shall serve as the highest policymaking body to decide on matters affecting the youth in the barangay.';
			const split = doc.splitTextToSize(para, pageWidth - 80);
			doc.text(split, 40, startY); startY += split.length * 10 + 6;

			// Determine colors from CSS variables (fallbacks provided)
			const headerColor = cssVarRgb('--pdf-header', [0,123,67]);
			const rowColor = cssVarRgb('--pdf-row', [240,250,240]);
			const firstColColor = cssVarRgb('--pdf-firstcol', [0,86,63]);
			const borderColor = cssVarRgb('--pdf-border', [150,150,150]);

			// Render autoTable with green styling to resemble the printed form
			doc.autoTable({
				startY: startY,
				head: [head],
				body: body,
				theme: 'grid',
				tableWidth: 'auto',
				headStyles: {
					fillColor: headerColor,
					textColor: 255,
					halign: 'center',
					fontStyle: 'bold'
				},
				styles: {
					fontSize: 9,
					cellPadding: 4,
					textColor: 50,
					valign: 'middle'
				},
				alternateRowStyles: { fillColor: rowColor },
				tableLineColor: borderColor,
				tableLineWidth: 0.4,
				columnStyles: {
					0: { cellWidth: 140, halign: 'left' },
					// make total column narrower
					[head.length-1]: { cellWidth: 60, halign: 'center' }
				},
				didParseCell: function (dataArg) {
					// Bold the first column labels in body
					if (dataArg.cell.section === 'body' && dataArg.column.index === 0) {
						dataArg.cell.styles.fontStyle = 'bold';
						dataArg.cell.styles.textColor = firstColColor;
					}
					// Make header lighter and centered
					if (dataArg.cell.section === 'head') {
						dataArg.cell.styles.cellPadding = 6;
					}
				}
			});

			const filename = `${(data.barangay_name || 'Barangay').replace(/\s+/g,'_')}_demographics_summary.pdf`;
			doc.save(filename);
		} catch (err) {
			console.error('PDF generation error:', err);
			alert('Failed to generate PDF: ' + (err.message || err));
		}
	}).catch(err => alert(err.message));
}

function populateBarangayDropdown() {
	const select = $id('barangay_id');
	if (!select) return;
	select.innerHTML = BARANGAYS.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

function openBarangay(id, name) {
	currentBarangayId = id;
	document.getElementById('current-barangay-title').innerText = `${name} Youth Records`;
	document.getElementById('dashboard-view').style.display = 'none';
	document.getElementById('list-view').style.display = 'block';
	filterTable();

	// Update top stat cards to reflect selected barangay
	fetchBarangaySummary(currentBarangayId).then(data => {
		const youths = Array.isArray(allYouths) ? allYouths.filter(y => String(y.barangay_id) === String(currentBarangayId)) : [];
		const total = (data && data.total != null) ? data.total : youths.length;
		const inSchool = youths.filter(y => y.is_in_school || (y.full_data && y.full_data.is_in_school)).length;
		const osy = (data && data.osy != null) ? data.osy : youths.filter(y => y.is_osy || (y.full_data && y.full_data.is_osy)).length;
		const registered = youths.filter(y => (y.full_data && (y.full_data.registered_voter_national || y.full_data.registered_voter_sk)) || y.registered_voter_national || y.registered_voter_sk).length;

		setStat('stat-total', total);
		setStat('stat-in-school', inSchool);
		setStat('stat-osy', osy);
		setStat('stat-registered', registered);
	}).catch(err => {
		console.warn('Failed fetching barangay summary for top stats:', err);
		// fallback to global stats
		renderTopStats();
	});
}

function showDashboard() {
	currentBarangayId = null;
	document.getElementById('dashboard-view').style.display = 'block';
	document.getElementById('list-view').style.display = 'none';
}

function checkUserStatus() {
	return fetch('/api/user/').then(res => res.ok ? res.json() : null).then(data => {
		const userDisplay = document.getElementById('user-display');
		const usernameSpan = document.getElementById('username-span');
		const loginBtn = document.getElementById('login-btn');
		const logoutBtn = document.getElementById('logout-btn');

		if (data && data.is_authenticated) {
			isLoggedIn = true;
			if (userDisplay) userDisplay.style.display = 'block';
			if (usernameSpan) usernameSpan.innerText = data.username;
			if (loginBtn) loginBtn.style.display = 'none';
			if (logoutBtn) logoutBtn.style.display = 'block';
			document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'inline-block');
			return true;
		} else {
			isLoggedIn = false;
			if (userDisplay) userDisplay.style.display = 'none';
			if (usernameSpan) usernameSpan.innerText = '';
			if (loginBtn) loginBtn.style.display = 'inline-block';
			if (logoutBtn) logoutBtn.style.display = 'none';
			document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
			return false;
		}
	}).catch(err => {
		console.debug('checkUserStatus error:', err);
		isLoggedIn = false;
		return false;
	});
}

function showLoginModal() { new bootstrap.Modal(document.getElementById('authModal')).show(); }

function handleAuth(e) {
	e.preventDefault();
	fetch('/api/login/', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			username: document.getElementById('auth-username').value,
			password: document.getElementById('auth-password').value
		})
	}).then(res => res.json()).then(data => {
		if(data.message) {
			// Redirect to main dashboard (select barangay) after successful login
			window.location.href = '/';
		} else {
			alert(data.error);
		}
	}).catch(err => {
		console.error('Login error:', err);
		alert('Login failed: ' + (err.message || err));
	});
}

function logout() { fetch('/api/logout/').then(() => window.location.reload()); }

function fetchYouths() {
	fetch('/api/youth/').then(res => res.json()).then(data => {
		allYouths = data;
		// Update top-level dashboard stats when youth list changes
		renderTopStats();
		// Update barangay tiles counts when youths load
		renderDashboard();
		if(currentBarangayId) filterTable();
	});
}

function formatNumber(n) { return (typeof n === 'number') ? n.toLocaleString() : n; }

function renderTopStats() {
	// Compute global stats from allYouths
	const total = Array.isArray(allYouths) ? allYouths.length : 0;
	const inSchool = Array.isArray(allYouths) ? allYouths.filter(y => y.is_in_school || (y.full_data && y.full_data.is_in_school)).length : 0;
	const osy = Array.isArray(allYouths) ? allYouths.filter(y => y.is_osy || (y.full_data && y.full_data.is_osy)).length : 0;
	const registered = Array.isArray(allYouths) ? allYouths.filter(y => (y.full_data && (y.full_data.registered_voter_national || y.full_data.registered_voter_sk)) || y.registered_voter_national || y.registered_voter_sk).length : 0;

	const set = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = formatNumber(value); };
	set('stat-total', total);
	set('stat-in-school', inSchool);
	set('stat-osy', osy);
	set('stat-registered', registered);
}

function setStat(id, value) { const el = document.getElementById(id); if (el) el.innerText = formatNumber(value); }

function filterTable() {
	if (!currentBarangayId) return;
	const term = document.getElementById('searchInput').value.toLowerCase();
	const filtered = allYouths.filter(y => 
		String(y.barangay_id) === String(currentBarangayId) && 
		y.name.toLowerCase().includes(term)
	);
	renderRows(filtered);
}

function renderRows(data) {
	const tbody = document.getElementById('youth-data');
	const emptyMsg = document.getElementById('empty-msg');
	if (data.length === 0) {
		tbody.innerHTML = '';
		emptyMsg.style.display = 'block';
		return;
	}
	emptyMsg.style.display = 'none';
    
	tbody.innerHTML = data.map(y => `
		<tr>
			<td>${y.name}</td>
			<td>${y.age}</td>
			<td>${y.sex}</td>
			<td>${y.full_data.purok || '-'}</td>
			<td>${y.education_level}</td>
			<td class="admin-only">
			<div class="btn-group">
				 <button class="btn btn-sm btn-primary" onclick="viewFullSummary(${y.id})">View Summary</button>
				<button class="btn btn-sm btn-info" onclick="editYouth(${y.id})">Edit</button>
				<button class="btn btn-sm btn-danger" onclick="deleteYouth(${y.id})">Delete</button>
				</div>
			</td>
		</tr>
	`).join('');
    
	if(isLoggedIn) document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'table-cell');
}

function openModal() {
	document.getElementById('youthForm').reset();
	document.getElementById('youth-id').value = '';
	if (currentBarangayId) document.getElementById('barangay_id').value = currentBarangayId;
	toggleOSY();
	updateAutoTogglesState(); // Call to update checkboxes after resetting the form
	new bootstrap.Modal(document.getElementById('youthModal')).show();
}

function editYouth(id) {
	const y = getYouthById(id);
	if (!y) return alert("Error: Data not found");
	const d = y.full_data || {};

	// Map of input ids to values (source: either top-level y or y.full_data)
	const mappings = {
		'youth-id': y.id,
		'name': y.name,
		'birthdate': d.birthdate,
		'sex': y.sex || d.sex,
		'civil_status': d.civil_status,
		'religion': d.religion,
		'barangay_id': d.barangay_id,
		'purok': d.purok,
		'email': d.email,
		'contact_number': d.contact_number,
		'osy_program_type': d.osy_program_type,
		'osy_reason_no_enroll': d.osy_reason_no_enroll,
		'disability_type': d.disability_type,
		'specific_needs_condition': d.specific_needs_condition,
		'tribe_name': d.tribe_name,
		'muslim_group': d.muslim_group,
		'education_level': y.education_level,
		'course': d.course,
		'school_name': d.school_name,
		'scholarship_program': d.scholarship_program,
		'work_status': d.work_status,
		'kk_assembly_times': d.kk_assembly_times,
		'kk_assembly_no_reason': d.kk_assembly_no_reason,
		'number_of_children': d.number_of_children
	};

	Object.entries(mappings).forEach(([k,v]) => setVal(k, v));

	// checkboxes
	const checks = ['is_in_school','is_osy','osy_willing_to_enroll','is_working_youth','is_pwd','has_specific_needs','is_ip','is_muslim','is_scholar','registered_voter_sk','registered_voter_national','voted_last_sk','attended_kk_assembly','is_4ps'];
	checks.forEach(id => setChk(id, d[id] || y[id] || false));

	toggleOSY();
	updateAutoTogglesState();
	new bootstrap.Modal($id('youthModal')).show();
}

function saveYouth(e) {
	e.preventDefault();
	// Ensure Civic & Other tab is valid before saving
	if (!validateTab('#tab-civic')) {
		showModalAlert('Please complete Civic & Other before saving the profile.');
		return;
	}
	const getVal = (id) => document.getElementById(id).value;
	const getCheck = (id) => document.getElementById(id).checked;

	let kk_times = parseInt(getVal('kk_assembly_times')) || 0;
	let num_children = parseInt(getVal('number_of_children')) || 0;

	const data = {
		name: getVal('name'),
		birthdate: getVal('birthdate'),
		sex: getVal('sex'),
		civil_status: getVal('civil_status'),
		religion: getVal('religion'),
		barangay_id: parseInt(getVal('barangay_id')) || currentBarangayId,
		purok: getVal('purok'),
		email: getVal('email'),
		contact_number: getVal('contact_number'),
		is_in_school: getCheck('is_in_school'),
		is_osy: getCheck('is_osy'),
		osy_willing_to_enroll: getCheck('osy_willing_to_enroll'),
		osy_program_type: getVal('osy_program_type'),
		osy_reason_no_enroll: getVal('osy_reason_no_enroll'),
		is_working_youth: getCheck('is_working_youth'),
		is_pwd: getCheck('is_pwd'),
		disability_type: getVal('disability_type'),
		has_specific_needs: getCheck('has_specific_needs'),
		specific_needs_condition: getVal('specific_needs_condition'),
		is_ip: getCheck('is_ip'),
		tribe_name: getVal('tribe_name'),
		is_muslim: getCheck('is_muslim'),
		muslim_group: getVal('muslim_group'),
		education_level: getVal('education_level'),
		course: getVal('course'),
		school_name: getVal('school_name'),
		is_scholar: getCheck('is_scholar'),
		scholarship_program: getVal('scholarship_program'),
		work_status: getVal('work_status'),
		registered_voter_sk: getCheck('registered_voter_sk'),
		registered_voter_national: getCheck('registered_voter_national'),
		voted_last_sk: getCheck('voted_last_sk'),
		attended_kk_assembly: getCheck('attended_kk_assembly'),
		kk_assembly_times: Math.max(0, kk_times),
		kk_assembly_no_reason: getVal('kk_assembly_no_reason'),
		is_4ps: getCheck('is_4ps'),
		number_of_children: Math.max(0, num_children)
	};

	// include id only for updates
	const existingId = getVal('youth-id');
	if (existingId) data.id = parseInt(existingId);

	const method = data.id ? 'PUT' : 'POST';
	console.log('POSTing to /api/youth/ — method:', method, 'payload:', data);
	fetch('/api/youth/', {
		method: method,
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(data)
	}).then(res => {
		console.log('Response status:', res.status, res.statusText);
		return res.text().then(text => {
			try {
				const obj = JSON.parse(text);
				if (res.ok) {
					bootstrap.Modal.getInstance(document.getElementById('youthModal')).hide();
					fetchYouths();
				} else {
					console.error('API error JSON:', obj);
					alert(obj.error || JSON.stringify(obj));
				}
			} catch (err) {
				console.error('Non-JSON response:', text);
				if (res.ok) {
					bootstrap.Modal.getInstance(document.getElementById('youthModal')).hide();
					fetchYouths();
				} else {
					alert(text);
				}
			}
		});
	}).catch(err => {
		console.error('Network/fetch error:', err);
		alert('Network error: ' + err.message);
	});
}

function toggleOSY() {
	const isOsy = document.getElementById('is_osy').checked;
	document.getElementById('osy-section').classList.toggle('d-none', !isOsy);
}

// Validate required fields in the Personal tab
function validatePersonalTab() {
	const container = document.getElementById('tab-personal');
	if (!container) return true;
	const requiredElems = container.querySelectorAll('input[required], select[required], textarea[required]');
	for (const el of requiredElems) {
		if (el.disabled) continue;
		if (!el.checkValidity()) {
			try { el.reportValidity(); } catch (e) {}
			el.focus();
			return false;
		}
	}
	return true;
}

// Show temporary alert inside the youth modal (falls back to window.alert)
function showModalAlert(msg) {
	const modalBody = document.querySelector('#youthModal .modal-body');
	if (!modalBody) return alert(msg);
	const existing = modalBody.querySelector('.temp-modal-alert');
	if (existing) existing.remove();
	const el = document.createElement('div');
	el.className = 'alert alert-warning temp-modal-alert';
	el.style.marginBottom = '10px';
	el.textContent = msg;
	modalBody.insertBefore(el, modalBody.firstChild);
	setTimeout(() => el.remove(), 3500);
}

// Enable/disable other tabs depending on validity of Personal tab
function updateTabState() {
	// Determine sequential validity for tabs: personal -> groups -> edu -> civic
	const personalValid = validatePersonalTab();
	const groupsValid = personalValid && isTabValid('#tab-groups');
	const eduValid = personalValid && groupsValid && isTabValid('#tab-edu');
	const civicValid = personalValid && groupsValid && eduValid && isTabValid('#tab-civic');

	const tabLinks = document.querySelectorAll('#formTabs a[data-bs-toggle="tab"]');
	tabLinks.forEach(link => {
		const href = link.getAttribute('href');
		// personal always enabled
		if (href === '#tab-personal') {
			link.classList.remove('disabled');
			link.removeAttribute('aria-disabled');
			link.removeAttribute('data-disabled');
			return;
		}
		// groups enabled only after personal
		if (href === '#tab-groups') {
			if (!personalValid) {
				link.classList.add('disabled'); link.setAttribute('aria-disabled','true'); link.setAttribute('data-disabled','true');
			} else { link.classList.remove('disabled'); link.removeAttribute('aria-disabled'); link.removeAttribute('data-disabled'); }
			return;
		}
		// edu enabled only after groups valid
		if (href === '#tab-edu') {
			if (!groupsValid) { link.classList.add('disabled'); link.setAttribute('aria-disabled','true'); link.setAttribute('data-disabled','true'); }
			else { link.classList.remove('disabled'); link.removeAttribute('aria-disabled'); link.removeAttribute('data-disabled'); }
			return;
		}
		// civic enabled only after edu valid
		if (href === '#tab-civic') {
			if (!eduValid) { link.classList.add('disabled'); link.setAttribute('aria-disabled','true'); link.setAttribute('data-disabled','true'); }
			else { link.classList.remove('disabled'); link.removeAttribute('aria-disabled'); link.removeAttribute('data-disabled'); }
			return;
		}
		// default: enable
		link.classList.remove('disabled'); link.removeAttribute('aria-disabled'); link.removeAttribute('data-disabled');
	});
}

// Non-intrusive validator that checks required fields but does not call reportValidity() or focus()
function isTabValid(tabSelector) {
	if (!tabSelector) return true;
	const sel = tabSelector.startsWith('#') ? tabSelector : ('#' + tabSelector.replace(/^#/, ''));
	const container = document.querySelector(sel);
	if (!container) return true;
	const requiredElems = container.querySelectorAll('input[required], select[required], textarea[required]');
	for (const el of requiredElems) {
		if (el.disabled) continue;
		if (el.tagName.toLowerCase() === 'select' && !el.value) {
			if (el.id === 'barangay_id' && currentBarangayId) {
				try { el.value = currentBarangayId; } catch (e) {}
			}
		}
		if (!el.checkValidity()) return false;
	}
	return true;
}

// Initialize tab guards and bind input listeners (run now or on DOMContentLoaded)
function initFormNavigation() {
	const tabLinks = document.querySelectorAll('#formTabs a[data-bs-toggle="tab"]');
	tabLinks.forEach(link => {
		link.addEventListener('show.bs.tab', (e) => {
			const targetHref = link.getAttribute('href');
			// If nav is disabled, block and show a friendly message depending on target
			if (link.getAttribute('data-disabled') === 'true') {
				e.preventDefault();
				if (targetHref === '#tab-groups') showModalAlert('Please complete Personal information before continuing.');
				else if (targetHref === '#tab-edu') showModalAlert('Please complete Groups/Needs before continuing.');
				else if (targetHref === '#tab-civic') showModalAlert('Please complete Edu & Work before continuing.');
				else showModalAlert('Please complete required fields before continuing.');
				return;
			}

			// Prevent leaving if the source tab is invalid; validateTab will report issues to the user
			const leaving = e.relatedTarget;
			if (leaving && leaving.getAttribute) {
				const leaveHref = leaving.getAttribute('href');
				if (leaveHref === '#tab-personal' && !validatePersonalTab()) { e.preventDefault(); showModalAlert('Please complete required Personal fields.'); return; }
				if (leaveHref === '#tab-groups' && !validateTab('#tab-groups')) { e.preventDefault(); showModalAlert('Please complete required Groups/Needs fields.'); return; }
				if (leaveHref === '#tab-edu' && !validateTab('#tab-edu')) { e.preventDefault(); showModalAlert('Please complete required Edu & Work fields.'); return; }
			}
		});
		link.addEventListener('click', (ev) => {
			if (link.getAttribute('data-disabled') === 'true') {
				ev.preventDefault();
				ev.stopPropagation();
				showModalAlert('Please complete Personal information before continuing.');
			}
		});
	});

	const personalInputs = document.querySelectorAll('#tab-personal input, #tab-personal select, #tab-personal textarea');
	personalInputs.forEach(inp => {
		inp.addEventListener('input', updateTabState);
		inp.addEventListener('change', updateTabState);
	});

	// Also watch Groups, Edu, and Civic panes so tab enabling updates live
	const groupsInputs = document.querySelectorAll('#tab-groups input, #tab-groups select, #tab-groups textarea');
	groupsInputs.forEach(inp => { inp.addEventListener('input', updateTabState); inp.addEventListener('change', updateTabState); });
	const eduInputs = document.querySelectorAll('#tab-edu input, #tab-edu select, #tab-edu textarea');
	eduInputs.forEach(inp => { inp.addEventListener('input', updateTabState); inp.addEventListener('change', updateTabState); });
	const civicInputs = document.querySelectorAll('#tab-civic input, #tab-civic select, #tab-civic textarea');
	civicInputs.forEach(inp => { inp.addEventListener('input', updateTabState); inp.addEventListener('change', updateTabState); });

	const youthModal = document.getElementById('youthModal');
	if (youthModal) youthModal.addEventListener('shown.bs.modal', () => updateTabState());

	// initial evaluation
	updateTabState();

	// Attach Next/Prev handlers for buttons (in case not already attached)
	document.querySelectorAll('.btn-next').forEach(btn => {
		if (!btn._navAttached) {
			btn.addEventListener('click', (ev) => {
				const tgt = btn.getAttribute('data-target');
				if (tgt) nextTab(tgt);
			});
			btn._navAttached = true;
		}
	});
	document.querySelectorAll('.btn-prev').forEach(btn => {
		if (!btn._navAttached) {
			btn.addEventListener('click', (ev) => {
				const tgt = btn.getAttribute('data-target');
				if (tgt) prevTab(tgt);
			});
			btn._navAttached = true;
		}
	});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFormNavigation); else initFormNavigation();

// Generic validator for any tab pane by selector or id (e.g. '#tab-personal')
function validateTab(tabSelector) {
	if (!tabSelector) return true;
	const sel = tabSelector.startsWith('#') ? tabSelector : ('#' + tabSelector.replace(/^#/, ''));
	const container = document.querySelector(sel);
	if (!container) return true;
	const requiredElems = container.querySelectorAll('input[required], select[required], textarea[required]');
	for (const el of requiredElems) {
		if (el.disabled) continue;
		// Auto-fill barangay if select is required but empty and we have a currentBarangayId
		if (el.tagName.toLowerCase() === 'select' && !el.value) {
			if (el.id === 'barangay_id' && currentBarangayId) {
				try { el.value = currentBarangayId; } catch (e) {}
			}
		}

		if (!el.checkValidity()) {
			// Debug: log which element failed and why (useful during testing)
			try {
				console.debug('validateTab failed element:', el.id || el.name || el.tagName, el.checkValidity(), el.validationMessage || 'no message');
			} catch (err) {}
			try { el.reportValidity(); } catch (e) {}
			el.focus();
			return false;
		}
	}

	// Additional custom checks for certain logical groups
	if (sel === '#tab-groups') {
		return validateGroupsTab();
	}
	if (sel === '#tab-edu') {
		return validateEduTab();
	}
	if (sel === '#tab-civic') {
		return validateCivicTab();
	}
	return true;
}

// Civic tab validation: enforce KK assembly and 4Ps logic
function validateCivicTab() {
	const attended = !!document.getElementById('attended_kk_assembly') && document.getElementById('attended_kk_assembly').checked;
	const timesEl = document.getElementById('kk_assembly_times');
	const reasonEl = document.getElementById('kk_assembly_no_reason');
	const is4ps = !!document.getElementById('is_4ps') && document.getElementById('is_4ps').checked;
	const numChildrenEl = document.getElementById('number_of_children');

	// Require either attendance info or a reason why not
	const reasonVal = reasonEl ? String(reasonEl.value || '').trim() : '';
	if (!attended && reasonVal === '') {
		showModalAlert('Please indicate whether the youth attended KK Assembly or provide a reason in Civic & Other.');
		if (reasonEl) reasonEl.focus();
		return false;
	}

	// If attended, require a positive number of times
	if (attended) {
		const times = timesEl ? parseInt(timesEl.value || 0) : 0;
		if (!(times > 0)) {
			showModalAlert('Please enter how many times the youth attended KK Assembly (must be > 0).');
			if (timesEl) timesEl.focus();
			return false;
		}
	}

	// If 4Ps is checked, require number_of_children > 0
	if (is4ps) {
		const n = numChildrenEl ? parseInt(numChildrenEl.value || 0) : 0;
		if (!(n > 0)) {
			showModalAlert('Please provide number of children for 4Ps beneficiary in Civic & Other.');
			if (numChildrenEl) numChildrenEl.focus();
			return false;
		}
	}

	return true;
}

// Require at least one classification in Groups/Needs and basic OSY fields
function validateGroupsTab() {
	const isInSchool = !!document.getElementById('is_in_school') && document.getElementById('is_in_school').checked;
	const isOsy = !!document.getElementById('is_osy') && document.getElementById('is_osy').checked;
	const isWorking = !!document.getElementById('is_working_youth') && document.getElementById('is_working_youth').checked;

	if (!isInSchool && !isOsy && !isWorking) {
		showModalAlert('Please select at least one Youth Classification (In School / OSY / Working) in Groups/Needs.');
		// focus first checkbox
		const first = document.getElementById('is_in_school') || document.getElementById('is_osy') || document.getElementById('is_working_youth');
		if (first) first.focus();
		return false;
	}

	// If OSY is checked and willing/enrollment fields are empty, encourage input but don't block save
	if (isOsy) {
		const prog = document.getElementById('osy_program_type') && document.getElementById('osy_program_type').value;
		const reason = document.getElementById('osy_reason_no_enroll') && document.getElementById('osy_reason_no_enroll').value;
		// not a hard requirement, but if both empty show prompt
		if (!prog && !reason) {
			showModalAlert('OSY selected: consider setting Program or Reason fields in Groups/Needs.');
		}
	}
	return true;
}

// Basic checks for Edu & Work: require education level and work status (non-empty)
function validateEduTab() {
	const edu = document.getElementById('education_level');
	const work = document.getElementById('work_status');
	if (edu && String(edu.value || '').trim() === '') {
		showModalAlert('Please select Highest Education in Edu & Work.');
		try { edu.focus(); } catch (e) {}
		return false;
	}
	if (work && String(work.value || '').trim() === '') {
		showModalAlert('Please provide Work Status in Edu & Work.');
		try { work.focus(); } catch (e) {}
		return false;
	}
	return true;
}

// Move to the next tab if current tab validates
function nextTab(targetSelector) {
	// Re-evaluate tab state first
	updateTabState();
	// Determine the currently active tab (nav link) and its href
	const activeLink = document.querySelector('#formTabs a.active');
	const leaving = activeLink ? (activeLink.getAttribute('href') || '') : '';
	if (leaving && !validateTab(leaving)) {
		if (leaving === '#tab-personal') showModalAlert('Please complete required Personal fields.');
		else if (leaving === '#tab-groups') showModalAlert('Please complete required Groups/Needs fields.');
		else if (leaving === '#tab-edu') showModalAlert('Please complete required Edu & Work fields.');
		else showModalAlert('Please complete required fields before continuing.');
		return;
	}

	const target = document.querySelector(`#formTabs a[href="${targetSelector}"]`);
	if (!target) return console.warn('nextTab: target not found', targetSelector);

	// If the target is marked disabled via our updateTabState guard, show a tailored alert
	if (target.getAttribute('data-disabled') === 'true') {
		const tgt = target.getAttribute('href');
		if (tgt === '#tab-groups') showModalAlert('Please complete Personal information before continuing.');
		else if (tgt === '#tab-edu') showModalAlert('Please complete Groups/Needs before continuing.');
		else if (tgt === '#tab-civic') showModalAlert('Please complete Edu & Work before continuing.');
		else showModalAlert('Please complete required fields before continuing.');
		return;
	}

	try {
		new bootstrap.Tab(target).show();
		updateTabState();
		return;
	} catch (e) {
		// fallback to click if Tab API fails
		try { target.click(); updateTabState(); return; } catch (e2) {}
	}

	// As a last resort, manually activate the tab pane and nav link
	activateTab(targetSelector);
}

function prevTab(targetSelector) {
	const target = document.querySelector(`#formTabs a[href="${targetSelector}"]`);
	if (!target) return console.warn('prevTab: target not found', targetSelector);
	try { new bootstrap.Tab(target).show(); updateTabState(); return; } catch (e) {
		try { target.click(); updateTabState(); return; } catch (e2) {}
	}
	activateTab(targetSelector);
}

// Expose navigation helpers to global scope for onclick handlers
window.nextTab = nextTab;
window.prevTab = prevTab;

// Manually activate a tab/pane without relying on Bootstrap API (robust fallback)
function activateTab(targetSelector) {
	const link = document.querySelector(`#formTabs a[href="${targetSelector}"]`);
	const pane = document.querySelector(targetSelector);
	if (!link || !pane) return console.warn('activateTab: missing link or pane', targetSelector, link, pane);

	// deactivate all nav links
	document.querySelectorAll('#formTabs a[data-bs-toggle="tab"]').forEach(a => {
		a.classList.remove('active');
		a.setAttribute('aria-selected', 'false');
	});

	// hide all panes
	document.querySelectorAll('.tab-pane').forEach(p => {
		p.classList.remove('show');
		p.classList.remove('active');
		p.setAttribute('aria-hidden', 'true');
	});

	// activate requested
	link.classList.add('active');
	link.setAttribute('aria-selected', 'true');
	pane.classList.add('show');
	pane.classList.add('active');
	pane.setAttribute('aria-hidden', 'false');

	// re-evaluate tab guards
	updateTabState();
}

// Sidebar open/close helpers used by the menu button and overlay
function openSidebar() {
	const menu = document.getElementById('side-menu');
	const overlay = document.getElementById('side-overlay');
	if (menu) {
		// Position the menu so it appears to pop out from the menu button
		const btn = document.getElementById('menu-toggle');
		if (btn) {
			const rect = btn.getBoundingClientRect();
			// place left edge of menu at the button's left coordinate (clamped to >= 0)
			const leftPos = Math.max(0, Math.round(rect.left));
			menu.style.left = leftPos + 'px';
		} else {
			menu.style.left = '';
		}
		menu.classList.add('open');
		menu.setAttribute('aria-hidden', 'false');
	}
	if (overlay) {
		overlay.classList.add('show');
		overlay.setAttribute('aria-hidden', 'false');
	}
	document.body.classList.add('side-open');
}

function closeSidebar() {
	const menu = document.getElementById('side-menu');
	const overlay = document.getElementById('side-overlay');
	if (menu) {
		menu.classList.remove('open');
		menu.setAttribute('aria-hidden', 'true');
		// clear any inline positioning applied when opening
		menu.style.left = '';
	}
	if (overlay) {
		overlay.classList.remove('show');
		overlay.setAttribute('aria-hidden', 'true');
	}
	document.body.classList.remove('side-open');
}

function toggleSidebar() {
	const menu = document.getElementById('side-menu');
	if (!menu) return;
	if (menu.classList.contains('open')) closeSidebar(); else openSidebar();
}

// Close sidebar when pressing Escape for improved accessibility
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		const menu = document.getElementById('side-menu');
		if (menu && menu.classList.contains('open')) closeSidebar();
	}
});

// Hover open/close behavior: only enable on non-touch devices that support hover
let sidebarHoverTimer = null;
const HOVER_OPEN_DELAY = 120; // ms
const HOVER_CLOSE_DELAY = 300; // ms
const SUPPORTS_HOVER = (window.matchMedia && window.matchMedia('(hover: hover)').matches) && !('ontouchstart' in window);

function enableSidebarHover() {
	if (!SUPPORTS_HOVER) return;
	const btn = document.getElementById('menu-toggle');
	const menu = document.getElementById('side-menu');
	if (!btn || !menu) return;

	btn.addEventListener('mouseenter', () => {
		if (sidebarHoverTimer) { clearTimeout(sidebarHoverTimer); sidebarHoverTimer = null; }
		sidebarHoverTimer = setTimeout(() => { openSidebar(); sidebarHoverTimer = null; }, HOVER_OPEN_DELAY);
	});

	btn.addEventListener('mouseleave', () => {
		if (sidebarHoverTimer) { clearTimeout(sidebarHoverTimer); sidebarHoverTimer = null; }
		sidebarHoverTimer = setTimeout(() => { closeSidebar(); sidebarHoverTimer = null; }, HOVER_CLOSE_DELAY);
	});

	// Keep menu open while hovering over it
	menu.addEventListener('mouseenter', () => {
		if (sidebarHoverTimer) { clearTimeout(sidebarHoverTimer); sidebarHoverTimer = null; }
	});

	menu.addEventListener('mouseleave', () => {
		if (sidebarHoverTimer) { clearTimeout(sidebarHoverTimer); }
		sidebarHoverTimer = setTimeout(() => { closeSidebar(); sidebarHoverTimer = null; }, HOVER_CLOSE_DELAY);
	});
}

// Enable hover behavior once DOM is ready (safe to add multiple listeners)
document.addEventListener('DOMContentLoaded', enableSidebarHover);

function deleteYouth(id) {
	const y = getYouthById(id);
	if (!y) return;

	if (confirm(`Are you sure you want to delete the record for ${y.name}?`)) {
		fetch('/api/youth/', {
			method: 'DELETE',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({ id: id })
		}).then(res => {
			if(res.ok) {
				alert('Deleted successfully');
				fetchYouths();
			} else {
				res.json().then(e => alert(e.error));
			}
		});
	}
}

function viewFullSummary(id) {
	const y = getYouthById(id);
	if (!y) return alert("Error: Data not found");

	const d = y.full_data;
	const content = document.getElementById('summary-content');
    
	const fmt = (val) => val ? '<span class="text-success fw-bold">Yes</span>' : '<span class="text-danger">No</span>';

	content.innerHTML = `
		<div class="row mb-3">
			<div class="col-md-6 border-end">
				<h6 class="text-primary border-bottom">Personal Information</h6>
				<p><strong>Name:</strong> ${y.name}</p>
				<p><strong>Sex:</strong> ${y.sex} | <strong>Status:</strong> ${d.civil_status}</p>
				<p><strong>Birthdate:</strong> ${d.birthdate || 'N/A'}</p>
				<p><strong>Religion:</strong> ${d.religion || 'N/A'}</p>
				<p><strong>Contact:</strong> ${d.contact_number || 'N/A'}</p>
			</div>
			<div class="col-md-6">
				<h6 class="text-primary border-bottom">Education & Work</h6>
				<p><strong>Level:</strong> ${y.education_level}</p>
				<p><strong>Course:</strong> ${d.course || 'N/A'}</p>
				<p><strong>School:</strong> ${d.school_name || 'N/A'}</p>
				<p><strong>Work Status:</strong> ${d.work_status || 'N/A'}</p>
				<p><strong>Scholar:</strong> ${fmt(d.is_scholar)} (${d.scholarship_program || 'N/A'})</p>
			</div>
		</div>
		<hr>
		<div class="row">
			<div class="col-md-4 border-end">
				<h6 class="text-primary border-bottom">Classifications</h6>
				<p>In School: ${fmt(d.is_in_school)}</p>
				<p>OSY: ${fmt(d.is_osy)}</p>
				<p>4Ps: ${fmt(d.is_4ps)}</p>
			</div>
			<div class="col-md-4 border-end">
				<h6 class="text-primary border-bottom">Special Needs/Group</h6>
				<p>PWD: ${fmt(d.is_pwd)} (${d.disability_type || 'None'})</p>
				<p>IP/7 Tribes: ${fmt(d.is_ip)} (${d.tribe_name || 'N/A'})</p>
				<p>Muslim: ${fmt(d.is_muslim)} (${d.muslim_group || 'N/A'})</p>
			</div>
			<div class="col-md-4">
				<h6 class="text-primary border-bottom">Civic / Others</h6>
				<p>SK Voter: ${fmt(d.registered_voter_sk)}</p>
				<p>National Voter: ${fmt(d.registered_voter_national)}</p>
				<p>Attended KK: ${fmt(d.attended_kk_assembly)} (${d.kk_assembly_times || 0} times)</p>
			</div>
		</div>
	`;
    
	new bootstrap.Modal(document.getElementById('summaryModal')).show();
}

// Sidebar controls
function toggleSidebar() {
	const menu = $id('side-menu');
	const overlay = $id('side-overlay');
	if (!menu || !overlay) return;
	const opening = !menu.classList.contains('open');
	menu.classList.toggle('open', opening);
	overlay.classList.toggle('show', opening);
}

function closeSidebar() {
	const menu = $id('side-menu');
	const overlay = $id('side-overlay');
	if (menu) menu.classList.remove('open');
	if (overlay) overlay.classList.remove('show');
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

// Expose functions used by HTML attributes to the global scope
window.openBarangay = openBarangay;
window.showDashboard = showDashboard;
window.showLoginModal = showLoginModal;
window.handleAuth = handleAuth;
window.logout = logout;
window.openModal = openModal;
window.editYouth = editYouth;
window.deleteYouth = deleteYouth;
window.viewFullSummary = viewFullSummary;
window.saveYouth = saveYouth;
window.toggleOSY = toggleOSY;
window.downloadBarangaySummaryCSV = downloadBarangaySummaryCSV;
window.downloadBarangaySummaryPDF = downloadBarangaySummaryPDF;

