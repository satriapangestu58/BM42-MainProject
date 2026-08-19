(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    evaluatorId: localStorage.getItem('bm42_evaluator_id') || BM42_DEFAULT_EVALUATOR_ID,
    role: localStorage.getItem('bm42_role') || 'SC',
    participant: null,
    camera: null,
    scanning: false,
    cameras: [],
    selectedCameraId: '',
    cameraAttempt: 0,
    lastToken: '',
    lastScanAt: 0,
    requestSeq: 0
  };

  const modulesByRole = {
    SC: [
      ['Keaktifan Materi', 'Catat peserta yang bertanya, menanggapi, atau menjawab.'],
      ['Post-Test', 'Masukkan nilai post-test Materi I–VI.'],
      ['Sikap Peserta', 'Nilai disiplin, atribut, kesopanan, dan keaktifan.'],
      ['Problem Solving', 'Penilaian sesi problem solving oleh Steering Committee.'],
      ['Tugas', 'Penilaian esai, video, dan unggahan LinkedIn.'],
      ['Catatan Kejadian', 'Catat kejadian yang perlu direkam secara objektif.']
    ],
    RETORIKA: [
      ['Retorika', 'Penilaian perilaku peserta selama sesi retorika.'],
      ['Catatan Kejadian', 'Catat kejadian yang perlu direkam secara objektif.']
    ],
    PERSONALIA: [
      ['Keaktifan Materi', 'Catat aktivitas peserta selama materi.'],
      ['Post-Test', 'Masukkan atau koreksi nilai post-test Materi I–VI.'],
      ['Retorika', 'Penilaian perilaku peserta selama retorika.'],
      ['Sikap Peserta', 'Penilaian sikap selama rangkaian BM.'],
      ['Problem Solving', 'Penilaian problem solving.'],
      ['Tugas', 'Penilaian seluruh tugas.'],
      ['Catatan Kejadian', 'Catat dan tinjau kejadian peserta.']
    ],
    OC: [
      ['Sikap Peserta', 'Penilaian sikap peserta bila ditugaskan.'],
      ['Catatan Kejadian', 'Catat kejadian yang perlu direkam secara objektif.']
    ],
    ADMIN: [
      ['Keaktifan Materi', 'Catat aktivitas peserta selama materi.'],
      ['Post-Test', 'Masukkan nilai post-test.'],
      ['Retorika', 'Penilaian retorika.'],
      ['Sikap Peserta', 'Penilaian sikap.'],
      ['Problem Solving', 'Penilaian problem solving.'],
      ['Tugas', 'Penilaian tugas.'],
      ['Catatan Kejadian', 'Catat kejadian.']
    ]
  };

  const retorikaAspects = [
    ['tegas', 'Tegas'], ['kritis', 'Kritis'], ['percayaDiri', 'Percaya diri'], ['wawasanLuas', 'Wawasan luas'],
    ['ramah', 'Ramah'], ['sopan', 'Sopan'], ['serius', 'Serius'], ['keterbukaanMasukan', 'Keterbukaan terhadap masukan'],
    ['pengendalianDiri', 'Pengendalian diri']
  ];
  const psAspects = [
    ['komunikasi', 'Komunikasi'], ['percayaDiri', 'Percaya diri'], ['pemahamanBahasan', 'Pemahaman bahasan'],
    ['keaktifan', 'Keaktifan'], ['kritis', 'Berpikir kritis'], ['strukturBerpikir', 'Struktur berpikir'],
    ['ketepatanSolusi', 'Ketepatan solusi'], ['kolaborasi', 'Kolaborasi']
  ];

  function setBackend(ok, text) {
    const el = $('backendBadge');
    el.textContent = text;
    el.className = 'badge ' + (ok ? 'ok' : 'bad');
  }

  function showFeedback(kind, text) {
    const el = $('feedback');
    el.className = 'card feedback ' + kind;
    el.textContent = text;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3500);
  }

  function evaluator() {
    return $('evaluatorId').value.trim() || state.evaluatorId || 'UNASSIGNED';
  }

  function ensureIdentity() {
    state.evaluatorId = evaluator();
    state.role = $('roleSelect').value;
    localStorage.setItem('bm42_evaluator_id', state.evaluatorId);
    localStorage.setItem('bm42_role', state.role);
    $('identityInfo').textContent = `Penilai aktif: ${state.evaluatorId} • Peran: ${roleLabel(state.role)}`;
    renderModules();
  }

  function roleLabel(role) {
    return ({SC:'Steering Committee', RETORIKA:'Penilai Retorika', PERSONALIA:'Personalia', OC:'Organizer Committee', ADMIN:'Admin'})[role] || role;
  }

  function jsonp(params, timeoutMs=8000) {
    return new Promise((resolve, reject) => {
      const cb = '__bm42_assess_' + Date.now() + '_' + (++state.requestSeq);
      const url = new URL(BM42_API_URL);
      Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
      url.searchParams.set('prefix', cb);
      const script = document.createElement('script');
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Server membutuhkan waktu terlalu lama. Coba lagi.')); }, timeoutMs);
      window[cb] = payload => { cleanup(); resolve(payload); };
      script.onerror = () => { cleanup(); reject(new Error('Backend tidak dapat dihubungi.')); };
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  async function api(op, params={}) {
    const payload = {action:'assessment', op, evaluatorId:evaluator(), ...params};
    const res = await jsonp(payload);
    if (!res || res.ok === false) throw new Error(res?.message || res?.code || 'Permintaan gagal.');
    return res;
  }

  let lastServerSecond = null;
  let backendCheckInFlight = false;

  function showLocalClock() {
    if (!lastServerSecond) return;
    const t = new Date(lastServerSecond);
    t.setSeconds(t.getSeconds() + 1);
    lastServerSecond = t;
    $('serverClock').textContent = t.toLocaleTimeString('id-ID', {
      hour12:false,
      hour:'2-digit',
      minute:'2-digit',
      second:'2-digit'
    });
  }

  async function refreshState(force=false) {
    if (backendCheckInFlight && !force) return;
    backendCheckInFlight = true;
    try {
      const res = await jsonp({action:'state'}, 8000);
      if (res.serverTime) {
        const parts = res.serverTime.split(' ');
        lastServerSecond = new Date(parts[0] + 'T' + parts[1] + '+07:00');
      }
      $('serverClock').textContent = lastServerSecond
        ? lastServerSecond.toLocaleTimeString('id-ID', {hour12:false})
        : '--:--:--';
      setBackend(true, res.event ? 'TERHUBUNG • KEGIATAN AKTIF' : 'TERHUBUNG');
    } catch (e) {
      setBackend(false, 'BACKEND SULIT DIAKSES');
      console.warn('BM42 state:', e.message);
    } finally {
      backendCheckInFlight = false;
    }
  }

  function renderModules() {
    const list = modulesByRole[state.role] || modulesByRole.SC;
    $('moduleSection').classList.remove('hidden');
    $('moduleTitle').textContent = 'Pilih Penilaian';
    $('moduleSubtitle').textContent = state.participant ? `Peserta aktif: ${state.participant.name} • ${state.participant.drug}` : 'Pilih peserta terlebih dahulu.';
    $('moduleButtons').innerHTML = '';
    list.forEach(([title, desc]) => {
      const btn = document.createElement('button');
      btn.className = 'module-btn';
      btn.innerHTML = `<strong>${title}</strong><div class=\"small muted\">${desc}</div>`;
      btn.disabled = !state.participant;
      btn.addEventListener('click', () => openModule(title));
      $('moduleButtons').appendChild(btn);
    });
    if (state.role === 'PERSONALIA' || state.role === 'ADMIN') {
      const auditBtn = document.createElement('button');
      auditBtn.className = 'module-btn';
      auditBtn.innerHTML = '<strong>Audit Kelengkapan</strong><div class="small muted">Lihat peserta yang belum memiliki nilai.</div>';
      auditBtn.addEventListener('click', openAudit);
      $('moduleButtons').appendChild(auditBtn);
    }
  }

  function renderParticipant(p) {
    state.participant = p;
    $('selectedParticipant').classList.remove('hidden');
    $('selectedParticipant').innerHTML = `
      <div class="selected-grid">
        <div class="selected-item"><div class="k">ID</div><div class="v">${escapeHtml(p.id)}</div></div>
        <div class="selected-item"><div class="k">Nama</div><div class="v">${escapeHtml(p.name)}</div></div>
        <div class="selected-item"><div class="k">Nama obat</div><div class="v">${escapeHtml(p.drug)}</div></div>
        <div class="selected-item"><div class="k">Kelompok</div><div class="v">${escapeHtml(p.group)}</div></div>
      </div>
      <div class="list-pills"><span class="pill">Peserta aktif</span><button type="button" class="secondary" id="auditThisParticipantBtn">Lihat Kelengkapan</button></div>`;
    $('searchResults').innerHTML = '';
    renderModules();
    $('auditThisParticipantBtn')?.addEventListener('click',auditCurrentParticipant);
    window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});
  }

  async function searchParticipant(q) {
    if (!q.trim()) return;
    $('searchResults').innerHTML = '<div class="small muted">Mencari peserta...</div>';
    try {
      const res = await api('searchParticipant', {q});
      if (!res.candidates.length) {
        $('searchResults').innerHTML = '<div class="small muted">Peserta tidak ditemukan.</div>';
        return;
      }
      $('searchResults').innerHTML = '';
      res.candidates.forEach(p => {
        const div = document.createElement('div');
        div.className = 'candidate';
        div.innerHTML = `<div class="candidate-main"><div class="candidate-name">${escapeHtml(p.id)} • ${escapeHtml(p.name)}</div><div class="candidate-meta">${escapeHtml(p.drug)} • ${escapeHtml(p.group)}</div></div><button class="secondary">Pilih</button>`;
        div.querySelector('button').addEventListener('click', () => renderParticipant(p));
        $('searchResults').appendChild(div);
      });
      if (res.candidates.length === 1) renderParticipant(res.candidates[0]);
    } catch (e) {
      $('searchResults').innerHTML = `<div class="small" style="color:#b91c1c">${escapeHtml(e.message)}</div>`;
    }
  }

  function setCameraFeedback(message, tone='neutral') {
    const el = $('cameraFeedback');
    el.textContent = message;
    el.style.color = tone === 'bad' ? '#b91c1c' : tone === 'ok' ? '#166534' : '';
  }

  function cameraName(device, index) {
    const label = String(device?.label || '').trim();
    if (label) return label;
    return `Kamera ${index + 1}`;
  }

  function rankCamera(device) {
    const label = String(device?.label || '').toLowerCase();
    let score = 0;
    if (/back|rear|environment|belakang|utama|world/.test(label)) score += 100;
    if (/front|user|depan|selfie/.test(label)) score -= 20;
    return score;
  }

  async function prepareCameraDevices() {
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      throw new Error('Browser tidak menyediakan akses kamera yang diperlukan.');
    }

    // Meminta akses sekali lebih dulu membuat daftar kamera dan label perangkat
    // menjadi lebih konsisten pada browser mobile setelah izin diberikan.
    let warmupStream = null;
    try {
      warmupStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    } finally {
      if (warmupStream) warmupStream.getTracks().forEach(track => track.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    state.cameras = devices.filter(d => d.kind === 'videoinput').sort((a,b) => rankCamera(b) - rankCamera(a));

    const select = $('cameraSelect');
    select.innerHTML = '';
    state.cameras.forEach((device, index) => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.textContent = cameraName(device, index);
      select.appendChild(opt);
    });

    if (!state.cameras.length) throw new Error('Tidak ada kamera yang terdeteksi pada perangkat.');

    state.selectedCameraId = state.cameras[0].deviceId;
    select.value = state.selectedCameraId;
    select.disabled = false;
    $('switchCameraBtn').disabled = state.cameras.length < 2;
  }

  async function waitForVideoReady(timeoutMs=2500) {
    const video = document.querySelector('#participantReader video');
    if (!video) return false;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        return true;
      }
      await new Promise(r => setTimeout(r, 120));
    }
    return false;
  }

  async function startSelectedCamera() {
    if (!state.camera) state.camera = new Html5Qrcode('participantReader');
    const scanConfig = {
      fps: 10,
      qrbox: { width: 260, height: 260 },
      aspectRatio: 1.333334,
      rememberLastUsedCamera: true,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    const callback = async text => {
      const now = Date.now();
      if (text === state.lastToken && now - state.lastScanAt < BM42_SCAN_COOLDOWN_MS) return;
      state.lastToken = text;
      state.lastScanAt = now;
      try {
        const res = await api('searchParticipant', {q:text});
        if (res.candidates.length === 1) {
          renderParticipant(res.candidates[0]);
          await closeCamera();
        } else if (res.candidates.length === 0) {
          setCameraFeedback('QR terbaca, tetapi peserta tidak ditemukan.', 'bad');
        } else {
          setCameraFeedback('QR terbaca. Pilih peserta dari hasil pencarian.');
          await closeCamera();
          $('searchResults').innerHTML = res.candidates.map(p => `<div class="candidate"><div class="candidate-main"><div class="candidate-name">${escapeHtml(p.id)} • ${escapeHtml(p.name)}</div><div class="candidate-meta">${escapeHtml(p.drug)} • ${escapeHtml(p.group)}</div></div><button class="secondary" data-id="${escapeHtml(p.id)}">Pilih</button></div>`).join('');
          [...$('searchResults').querySelectorAll('button')].forEach(btn => btn.addEventListener('click', async () => {
            const r = await api('searchParticipant', {q:btn.dataset.id});
            if (r.candidates[0]) renderParticipant(r.candidates[0]);
          }));
        }
      } catch(e) { setCameraFeedback(e.message, 'bad'); }
    };

    const qrError = () => {};
    setCameraFeedback('Menyalakan kamera...');

    try {
      // Pilih deviceId yang sudah terdeteksi agar browser tidak perlu menebak kamera.
      if (state.selectedCameraId) {
        await state.camera.start({deviceId:{exact:state.selectedCameraId}}, scanConfig, callback, qrError);
      } else {
        await state.camera.start({facingMode:{ideal:'environment'}}, scanConfig, callback, qrError);
      }

      state.scanning = true;
      const ready = await waitForVideoReady();
      if (!ready) {
        throw new Error('Kamera aktif tetapi gambar video tidak tersedia. Coba Ganti Kamera atau Coba Lagi.');
      }
      $('cameraFeedback').textContent = 'Kamera aktif. Arahkan QR peserta ke kotak pemindaian.';
      $('cameraFeedback').style.color = '#166534';
    } catch (e) {
      try {
        if (state.scanning || state.camera) await state.camera.stop();
      } catch (_) {}
      try { state.camera?.clear(); } catch (_) {}
      state.scanning = false;
      state.camera = null;
      throw e;
    }
  }

  async function openCamera() {
    $('cameraModal').classList.remove('hidden');
    $('cameraSelect').disabled = true;
    $('switchCameraBtn').disabled = true;
    setCameraFeedback('Memeriksa izin dan perangkat kamera...');
    if (!window.Html5Qrcode) {
      setCameraFeedback('Pustaka pemindai QR tidak termuat.', 'bad');
      return;
    }

    try {
      await prepareCameraDevices();

      // Coba kamera yang paling mungkin merupakan kamera belakang terlebih dahulu.
      // Jika preview tidak muncul, coba kamera lain secara otomatis sebelum menyerah.
      let lastError = null;
      for (let i = 0; i < state.cameras.length; i++) {
        state.selectedCameraId = state.cameras[i].deviceId;
        $('cameraSelect').value = state.selectedCameraId;
        try {
          await startSelectedCamera();
          return;
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError || new Error('Tidak ada kamera yang berhasil menampilkan video.');
    } catch (e) {
      const name = e?.name || 'KAMERA_ERROR';
      let hint = e?.message || 'Kamera gagal dibuka.';
      if (name === 'NotAllowedError') hint = 'Izin kamera ditolak. Periksa izin kamera untuk browser dan situs ini.';
      else if (name === 'NotReadableError') hint = 'Kamera sedang digunakan aplikasi lain atau tidak dapat dibaca. Tutup aplikasi kamera lain lalu tekan Coba Lagi.';
      else if (name === 'OverconstrainedError') hint = 'Kamera yang dipilih tidak dapat digunakan. Tekan Ganti Kamera atau Coba Lagi.';
      else if (name === 'SecurityError') hint = 'Browser memblokir akses kamera karena kebijakan keamanan.';
      setCameraFeedback(`${name}: ${hint}`, 'bad');
    }
  }

  async function restartCameraWithSelected() {
    try {
      if (state.scanning && state.camera) {
        await state.camera.stop();
        state.camera.clear();
        state.scanning = false;
      }
      state.camera = new Html5Qrcode('participantReader');
      await startSelectedCamera();
    } catch (e) {
      const name = e?.name || 'KAMERA_ERROR';
      setCameraFeedback(`${name}: ${e?.message || 'Kamera gagal dimulai ulang.'}`, 'bad');
    }
  }

  async function cycleCamera() {
    if (state.cameras.length < 2) {
      setCameraFeedback('Perangkat ini hanya melaporkan satu kamera.', 'neutral');
      return;
    }
    const currentIndex = state.cameras.findIndex(d => d.deviceId === state.selectedCameraId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.cameras.length : 0;
    state.selectedCameraId = state.cameras[nextIndex].deviceId;
    $('cameraSelect').value = state.selectedCameraId;
    await restartCameraWithSelected();
  }

  async function closeCamera() {
    if (state.camera) {
      try { if (state.scanning) await state.camera.stop(); } catch (_) {}
      try { state.camera.clear(); } catch (_) {}
    }
    state.scanning = false;
    state.camera = null;
    $('cameraSelect').disabled = true;
    $('switchCameraBtn').disabled = true;
    $('cameraModal').classList.add('hidden');
  }

  function auditComponentOptions(component){
    const map={
      'Post-Test':['Materi 1','Materi 2','Materi 3','Materi 4','Materi 5','Materi 6'],
      'Sikap Peserta':['Keseluruhan BM','Hari 1','Hari 2'],
      'Tugas':['ESAI','VIDEO','LINKEDIN'],
      'Retorika':Array.from({length:20},(_,i)=>`Post ${String(i+1).padStart(2,'0')}`),
      'Problem Solving':Array.from({length:20},(_,i)=>`Pos ${String(i+1).padStart(2,'0')}`)
    };
    return map[component]||[];
  }

  function openAudit(){
    $('auditSection').classList.remove('hidden');
    $('auditBody').innerHTML=`
      <div class="audit-toolbar">
        <div class="field"><label>Komponen</label><select id="auditComponent" class="input">${['Post-Test','Sikap Peserta','Tugas','Retorika','Problem Solving'].map(x=>`<option>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Bagian</label><select id="auditUnit" class="input"></select></div>
        <div class="field"><label>Kelompok</label><select id="auditGroup" class="input"><option value="">Semua Kelompok</option>${Array.from({length:20},(_,i)=>`<option>G${String(i+1).padStart(2,'0')}</option>`).join('')}</select></div>
        <div class="field" style="align-self:end"><button id="runAuditBtn" class="primary" style="width:100%">Periksa</button></div>
      </div>
      <div class="audit-actions">
        <button id="refreshAuditBtn" class="secondary" type="button">Muat Ulang Status</button>
      </div>
      <div id="auditResult"></div>`;
    const comp=$('auditComponent'), unit=$('auditUnit');
    const refreshUnits=()=>{unit.innerHTML=auditComponentOptions(comp.value).map(x=>`<option>${x}</option>`).join('');};
    comp.addEventListener('change',refreshUnits);
    refreshUnits();
    $('runAuditBtn').addEventListener('click',runAudit);
    $('refreshAuditBtn').addEventListener('click',runAudit);
    window.scrollTo({top:$('auditSection').offsetTop-10,behavior:'smooth'});
  }

  const auditClientCache = new Map();

  async function runAudit(){
    const result=$('auditResult');
    const key = [
      $('auditComponent').value,
      $('auditUnit').value,
      $('auditGroup').value
    ].join('|');

    result.innerHTML='<div class="small muted">Memeriksa status penilaian...</div>';
    try{
      const cached = auditClientCache.get(key);
      const now = Date.now();
      if (cached && (now - cached.at) < 15000) {
        renderAuditResult(result, cached.data);
        return;
      }

      const res=await api('auditAssessment',{component:$('auditComponent').value,unit:$('auditUnit').value,group:$('auditGroup').value});
      auditClientCache.set(key, {at: Date.now(), data: res});
      renderAuditResult(result, res);
    }catch(e){result.innerHTML=`<div class="small" style="color:#b91c1c">${escapeHtml(e.message)}</div>`;}
  }


  function renderAuditResult(result, res){
    result.innerHTML=`
      <div class="audit-summary">
        <div class="audit-metric"><div class="small">Total</div><div class="num">${res.total}</div></div>
        <div class="audit-metric"><div class="small">Sudah dinilai</div><div class="num" style="color:#166534">${res.complete}</div></div>
        <div class="audit-metric"><div class="small">Belum dinilai</div><div class="num" style="color:#b91c1c">${res.missingCount}</div></div>
      </div>
      <div class="actions">
        <button id="auditCopyBtn" class="secondary">Salin Daftar</button>
      </div>
      ${res.missingCount ? `<div style="margin-top:10px"><table class="audit-table"><thead><tr><th>ID</th><th>Nama</th><th>Nama Obat</th><th>Kelompok</th><th>Aksi</th></tr></thead><tbody>${res.missing.map(p=>`<tr><td>${escapeHtml(p.id)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.drug)}</td><td>${escapeHtml(p.group)}</td><td><button class="secondary audit-select" data-id="${escapeHtml(p.id)}">Nilai</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="audit-participant-card"><strong>Semua peserta sudah memiliki data untuk komponen ini.</strong></div>'}`;

    $('auditCopyBtn')?.addEventListener('click',async()=>{
      const text=res.missing.map(p=>`${p.id}\t${p.name}\t${p.drug}\t${p.group}`).join('\n');
      try{await navigator.clipboard.writeText(text);showFeedback('ok','Daftar peserta berhasil disalin.');}
      catch(_){showFeedback('bad','Daftar tidak dapat disalin otomatis.');}
    });

    result.querySelectorAll('.audit-select').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        try{
          const r=await api('searchParticipant',{q:btn.dataset.id});
          if(r.candidates[0]){
            renderParticipant(r.candidates[0]);
            $('auditSection').classList.add('hidden');
            openModule($('auditComponent').value);
          }
        }catch(e){
          showFeedback('bad',e.message);
        }
      });
    });
  }

  async function auditCurrentParticipant(){
    if(!state.participant){showFeedback('bad','Pilih peserta terlebih dahulu.');return;}
    try{
      const res=await api('auditParticipant',{participantId:state.participant.id});
      const lines=res.items.map(x=>`<div class="audit-row ${x.status==='LENGKAP'||x.status==='ADA DATA'?'ok':'bad'}"><div class="component">${escapeHtml(x.component)}</div><div class="unit">${escapeHtml(x.unit)}</div><div class="${x.status==='LENGKAP'||x.status==='ADA DATA'?'status-complete':'status-missing'}">${escapeHtml(x.status)}</div></div>`).join('');
      $('auditSection').classList.remove('hidden');
      $('auditBody').innerHTML=`<div class="audit-participant-card"><div class="candidate-name">${escapeHtml(res.participant.id)} • ${escapeHtml(res.participant.name)}</div><div class="candidate-meta">${escapeHtml(res.participant.drug)} • ${escapeHtml(res.participant.group)}</div><div class="audit-checklist">${lines}</div></div>`;
      window.scrollTo({top:$('auditSection').offsetTop-10,behavior:'smooth'});
    }catch(e){showFeedback('bad',e.message);}
  }

  function openModule(title) {
    if (!state.participant) { showFeedback('bad','Pilih peserta terlebih dahulu.'); return; }
    $('formSection').classList.remove('hidden');
    $('formTitle').textContent = title;
    $('formSubtitle').textContent = `${state.participant.id} • ${state.participant.name} • ${state.participant.drug}`;
    if (title === 'Keaktifan Materi') renderParticipationForm();
    else if (title === 'Post-Test') renderPosttestForm();
    else if (title === 'Retorika') renderRetorikaForm();
    else if (title === 'Sikap Peserta') renderSikapForm();
    else if (title === 'Problem Solving') renderPSForm();
    else if (title === 'Tugas') renderTaskForm();
    else renderIncidentForm();
    window.scrollTo({top: $('formSection').offsetTop - 10, behavior:'smooth'});
  }

  function formActions(onSave, label='Simpan') {
    const wrap = document.createElement('div'); wrap.className='actions';
    const btn = document.createElement('button'); btn.className='primary'; btn.textContent=label;
    btn.addEventListener('click', onSave); wrap.appendChild(btn); return wrap;
  }

  function renderParticipationForm() {
    const body = $('formBody');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Materi</label><select id="partActivity" class="input">${['Materi I','Materi II','Materi III','Materi IV','Materi V','Materi VI'].map(x=>`<option>${x}</option>`).join('')}</select></div>
        <div class="field"><label>Jenis aktivitas</label><div class="radio-grid" id="partType">${['BERTANYA','MENANGGAPI','MENJAWAB'].map((x,i)=>`<button type="button" class="radio-btn ${i===0?'active':''}" data-value="${x}">${x[0]+x.slice(1).toLowerCase()}</button>`).join('')}</div></div>
        <div class="field form-full"><label>Catatan singkat (opsional)</label><textarea id="partNote" class="input textarea" placeholder="Misalnya: pertanyaan terkait pembagian peran organisasi"></textarea></div>
      </div>`;
    bindRadioButtons('partType');
    body.appendChild(formActions(async()=>{
      const selected = getRadioValue('partType');
      await saveGeneric('saveParticipation',{aktivitas:$('partActivity').value,jenis:selected,catatan:$('partNote').value},'Aktivitas peserta tersimpan.');
    },'Catat Aktivitas'));
  }

  function renderPosttestForm() {
    const body = $('formBody');
    body.innerHTML = `<div class="form-grid"><div class="field"><label>Materi</label><select id="postMateri" class="input">${[1,2,3,4,5,6].map(x=>`<option>Materi ${x}</option>`).join('')}</select></div><div class="field"><label>Nilai</label><input id="postScore" class="score-input" type="number" min="0" max="100" placeholder="0–100"></div><div class="field form-full"><label>Catatan (opsional)</label><textarea id="postNote" class="input textarea"></textarea></div></div>`;
    body.appendChild(formActions(async()=>{
      await saveGeneric('savePosttest',{materi:$('postMateri').value,nilai:$('postScore').value,catatan:$('postNote').value},'Nilai post-test tersimpan.');
    }));
  }

  function renderRetorikaForm() {
    const body = $('formBody');
    body.innerHTML = `<div class="form-grid"><div class="field"><label>Post</label><select id="retPost" class="input">${Array.from({length:20},(_,i)=>`<option>Post ${String(i+1).padStart(2,'0')}</option>`).join('')}</select></div></div><div style="margin-top:14px" id="retAspects"></div><div class="field" style="margin-top:14px"><label>Catatan umum</label><textarea id="retNote" class="input textarea" placeholder="Catatan perilaku yang paling menonjol"></textarea></div>`;
    const wrap = $('retAspects');
    retorikaAspects.forEach(([key,label]) => wrap.appendChild(scaleBlock(key,label)));
    body.appendChild(formActions(async()=>{
      const params = {post:$('retPost').value,catatan:$('retNote').value};
      retorikaAspects.forEach(([key])=>params[key]=getScaleValue(key));
      await saveGeneric('saveRetorika',params,'Penilaian retorika tersimpan.');
    }));
  }

  function renderSikapForm() {
    const body = $('formBody');
    body.innerHTML = `<div class="form-grid"><div class="field"><label>Periode</label><select id="sikapPeriode" class="input"><option>Keseluruhan BM</option><option>Hari 1</option><option>Hari 2</option></select></div></div><div style="margin-top:14px" id="sikapAspects"></div><div class="field" style="margin-top:14px"><label>Catatan</label><textarea id="sikapNote" class="input textarea"></textarea></div>`;
    [['disiplin','Disiplin'],['atribut','Atribut'],['kesopanan','Kesopanan'],['keaktifan','Keaktifan']].forEach(([key,label])=>{
      $('sikapAspects').appendChild(scaleBlock(key,label));
    });
    body.appendChild(formActions(async()=>{
      await saveGeneric('saveSikap',{
        periode:$('sikapPeriode').value,
        disiplin:getScaleValue('disiplin'),
        atribut:getScaleValue('atribut'),
        kesopanan:getScaleValue('kesopanan'),
        keaktifan:getScaleValue('keaktifan'),
        catatan:$('sikapNote').value
      },'Penilaian sikap tersimpan.');
    }));
  }

  function renderPSForm() {
    const body=$('formBody');
    body.innerHTML=`<div class="form-grid"><div class="field"><label>Pos problem solving</label><select id="psPos" class="input">${Array.from({length:20},(_,i)=>`<option>Pos ${String(i+1).padStart(2,'0')}</option>`).join('')}</select></div></div><div style="margin-top:14px" id="psAspects"></div><div class="field" style="margin-top:14px"><label>Catatan umum</label><textarea id="psNote" class="input textarea"></textarea></div>`;
    psAspects.forEach(([key,label])=>$('psAspects').appendChild(scaleBlock(key,label)));
    body.appendChild(formActions(async()=>{const params={pos:$('psPos').value,catatan:$('psNote').value};psAspects.forEach(([key])=>params[key]=getScaleValue(key));await saveGeneric('saveProblemSolving',params,'Penilaian problem solving tersimpan.');}));
  }

  function renderTaskForm() {
    const body=$('formBody');
    body.innerHTML=`<div class="form-grid"><div class="field"><label>Jenis tugas</label><select id="taskType" class="input"><option value="ESAI">Esai</option><option value="VIDEO">Video</option><option value="LINKEDIN">Post blog LinkedIn</option></select></div><div class="field"><label>Status pengumpulan</label><select id="taskStatus" class="input"><option>Sudah dikumpulkan</option><option>Dikumpulkan terlambat</option><option>Belum dikumpulkan</option><option>Tidak dinilai</option></select></div></div><div id="taskScores" style="margin-top:14px"></div><div class="actions"><button id="saveTaskBtn" class="primary">Simpan Penilaian Tugas</button></div>`;
    renderTaskFields();
    $('taskType').addEventListener('change',renderTaskFields);
    $('saveTaskBtn').addEventListener('click',async()=>{const type=$('taskType').value;const payload={jenisTugas:type,statusPengumpulan:$('taskStatus').value,skor1:$('task1').value,skor2:$('task2').value,skor3:$('task3').value,dataMentah1:$('raw1')?.value||'',dataMentah2:$('raw2')?.value||'',catatan:$('taskNote').value};await saveGeneric('saveTask',payload,'Penilaian tugas tersimpan.');});
  }

  function renderTaskFields(){const type=$('taskType').value;const def={ESAI:[['Kelengkapan materi',40],['Kejelasan tulisan / keterbacaan',30],['Kelengkapan jumlah kata',30]],VIDEO:[['Kreativitas',50],['Isi materi',50]],LINKEDIN:[['Kesesuaian materi',50],['Kesesuaian jumlah kata',10],['Kesesuaian jumlah akun terhubung',40]]}[type];$('taskScores').innerHTML=def.map((x,i)=>`<div class="field" style="margin-bottom:10px"><label>${x[0]} (maks. ${x[1]})</label><input id="task${i+1}" class="score-input" type="number" min="0" max="${x[1]}" value="0"></div>`).join('')+((type==='LINKEDIN')?`<div class="form-grid"><div class="field"><label>Jumlah kata aktual (opsional)</label><input id="raw1" class="score-input" type="number" min="0"></div><div class="field"><label>Jumlah akun terhubung (opsional)</label><input id="raw2" class="score-input" type="number" min="0"></div></div>`:`<div class="field"><label>Data mentah / catatan (opsional)</label><input id="raw1" class="input"><input id="raw2" style="display:none"></div>`)+`<div class="field"><label>Catatan</label><textarea id="taskNote" class="input textarea"></textarea></div><div class="task-total">Total: <span id="taskTotal">0</span> / 100</div>`;[1,2,3].forEach(i=>{const el=$(`task${i}`);if(el)el.addEventListener('input',()=>{$('taskTotal').textContent=[1,2,3].reduce((s,n)=>s+Number($(`task${n}`)?.value||0),0);});});}

  function renderIncidentForm(){const body=$('formBody');body.innerHTML=`<div class="form-grid"><div class="field"><label>Aktivitas</label><input id="incActivity" class="input" placeholder="Contoh: Retorika • Post 04"></div><div class="field"><label>Kategori</label><select id="incCategory" class="input"><option>Disiplin</option><option>Atribut</option><option>Kesopanan</option><option>Tanggung jawab</option><option>Kepatuhan instruksi</option><option>Profesionalisme</option><option>Lainnya</option></select></div><div class="field"><label>Tingkat</label><div class="radio-grid" id="incSeverity">${['Ringan','Sedang','Berat'].map((x,i)=>`<button type="button" class="radio-btn ${i===0?'active':''}" data-value="${x}">${x}</button>`).join('')}</div></div><div class="field form-full"><label>Uraian kejadian</label><textarea id="incText" class="input textarea" placeholder="Tuliskan kejadian secara faktual, singkat, dan spesifik."></textarea></div><div class="field form-full"><label>Tautan bukti (opsional)</label><input id="incEvidence" class="input" placeholder="Tautan Drive / bukti"></div></div>`;bindRadioButtons('incSeverity');body.appendChild(formActions(async()=>{await saveGeneric('saveIncident',{aktivitas:$('incActivity').value,kategori:$('incCategory').value,tingkat:getRadioValue('incSeverity'),uraian:$('incText').value,tautanBukti:$('incEvidence').value},'Catatan kejadian tersimpan.');}));}

  function scaleBlock(key,label){
    const div=document.createElement('div');
    div.className='field scale-block';
    div.innerHTML=`
      <div class="field-title">${label}</div>
      <div class="scale-scroll">
        <div class="scale-grid scale-labels">
          <span>-3<br><small>Sangat di bawah</small></span>
          <span>-2<br><small>Di bawah</small></span>
          <span>-1<br><small>Sedikit di bawah</small></span>
          <span>0<br><small>Sesuai</small></span>
          <span>+1<br><small>Sedikit di atas</small></span>
          <span>+2<br><small>Di atas</small></span>
          <span>+3<br><small>Sangat di atas</small></span>
        </div>
        <div class="scale-grid scale-row" id="scale-${key}">
          ${[-3,-2,-1,0,1,2,3].map((n,i)=>`<button type="button" class="scale-btn ${i===3?'active':''}" data-value="${n}">${n>0?`+${n}`:n}</button>`).join('')}
        </div>
      </div>`;
    div.querySelectorAll('.scale-btn').forEach(btn=>btn.addEventListener('click',()=>{
      div.querySelectorAll('.scale-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    }));
    return div;
  }
  function getScaleValue(key){return document.querySelector(`#scale-${key} .scale-btn.active`)?.dataset.value || '0';}
  function bindRadioButtons(id){const wrap=$(id);wrap.querySelectorAll('.radio-btn').forEach(btn=>btn.addEventListener('click',()=>{wrap.querySelectorAll('.radio-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}));}
  function getRadioValue(id){return $(id).querySelector('.radio-btn.active')?.dataset.value || ''}

  async function saveGeneric(op, params, okMsg){
    try { await api(op,{participantId:state.participant.id,...params}); showFeedback('ok',okMsg); $('formSection').classList.add('hidden'); }
    catch(e){ showFeedback('bad',e.message); }
  }

  function escapeHtml(str){return String(str??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}

  $('evaluatorId').value = state.evaluatorId;
  $('roleSelect').value = state.role;
  $('saveIdentity').addEventListener('click',ensureIdentity);
  $('roleSelect').addEventListener('change',()=>{state.role=$('roleSelect').value;renderModules();});
  $('participantQuery').addEventListener('keydown',e=>{if(e.key==='Enter')searchParticipant(e.target.value)});
  $('searchParticipantBtn').addEventListener('click',()=>searchParticipant($('participantQuery').value));
  $('scanParticipantBtn').addEventListener('click',openCamera);
  $('closeCameraBtn').addEventListener('click',closeCamera);
  $('cameraSelect').addEventListener('change', async e => { state.selectedCameraId = e.target.value; await restartCameraWithSelected(); });
  $('switchCameraBtn').addEventListener('click',cycleCamera);
  $('retryCameraBtn').addEventListener('click',async () => { await restartCameraWithSelected(); });
  $('closeFormBtn').addEventListener('click',()=>$('formSection').classList.add('hidden'));
  $('closeAuditBtn').addEventListener('click',()=>$('auditSection').classList.add('hidden'));

  ensureIdentity();
  refreshState(true);
  setInterval(showLocalClock, 1000);
})();
