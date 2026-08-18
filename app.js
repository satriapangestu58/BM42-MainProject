(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    evaluatorId: localStorage.getItem('bm42_evaluator_id') || BM42_DEFAULT_EVALUATOR_ID,
    role: localStorage.getItem('bm42_role') || 'SC',
    participant: null,
    camera: null,
    scanning: false,
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

  function jsonp(params, timeoutMs=12000) {
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
      const timer = setTimeout(() => { cleanup(); reject(new Error('Waktu tunggu backend habis.')); }, timeoutMs);
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

  async function refreshState() {
    try {
      const res = await jsonp({action:'state'});
      $('serverClock').textContent = res.serverTime ? res.serverTime.split(' ')[1] : '--:--:--';
      setBackend(true, res.event ? 'TERHUBUNG • KEGIATAN AKTIF' : 'TERHUBUNG');
    } catch (e) {
      setBackend(false, 'BACKEND ERROR');
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
      btn.innerHTML = `<strong>${title}</strong><div class="small muted">${desc}</div>`;
      btn.disabled = !state.participant;
      btn.addEventListener('click', () => openModule(title));
      $('moduleButtons').appendChild(btn);
    });
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
      <div class="list-pills"><span class="pill">Peserta aktif</span></div>`;
    $('searchResults').innerHTML = '';
    renderModules();
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

  async function openCamera() {
    $('cameraModal').classList.remove('hidden');
    $('cameraFeedback').textContent = 'Memulai kamera...';
    if (!window.Html5Qrcode) {
      $('cameraFeedback').textContent = 'Pustaka pemindai QR tidak termuat.';
      return;
    }
    state.camera = new Html5Qrcode('participantReader');
    try {
      await state.camera.start(
        {facingMode:'environment'},
        {fps:10, qrbox:{width:260,height:260}, rememberLastUsedCamera:true},
        async text => {
          const now = Date.now();
          if (text === state.lastToken && now - state.lastScanAt < BM42_SCAN_COOLDOWN_MS) return;
          state.lastToken = text; state.lastScanAt = now;
          try {
            const res = await api('searchParticipant', {q:text});
            if (res.candidates.length === 1) {
              renderParticipant(res.candidates[0]);
              await closeCamera();
            } else if (res.candidates.length === 0) {
              $('cameraFeedback').textContent = 'QR terbaca, tetapi tidak terdaftar.';
            } else {
              $('cameraFeedback').textContent = 'QR terbaca. Pilih peserta dari hasil pencarian.';
              await closeCamera();
              $('searchResults').innerHTML = res.candidates.map(p => `<div class="candidate"><div class="candidate-main"><div class="candidate-name">${escapeHtml(p.id)} • ${escapeHtml(p.name)}</div><div class="candidate-meta">${escapeHtml(p.drug)} • ${escapeHtml(p.group)}</div></div><button class="secondary" data-id="${escapeHtml(p.id)}">Pilih</button></div>`).join('');
              [...$('searchResults').querySelectorAll('button')].forEach(btn => btn.addEventListener('click', async () => {
                const r = await api('searchParticipant', {q:btn.dataset.id});
                if (r.candidates[0]) renderParticipant(r.candidates[0]);
              }));
            }
          } catch(e) { $('cameraFeedback').textContent = e.message; }
        },
        () => {}
      );
      state.scanning = true;
      $('cameraFeedback').textContent = 'Kamera aktif. Arahkan QR peserta ke kotak pemindaian.';
    } catch (e) {
      $('cameraFeedback').textContent = `Kamera gagal dibuka: ${e.name || ''} ${e.message || ''}`;
    }
  }

  async function closeCamera() {
    if (state.camera && state.scanning) {
      try { await state.camera.stop(); state.camera.clear(); } catch (_) {}
    }
    state.scanning = false; state.camera = null; $('cameraModal').classList.add('hidden');
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
      const d=document.createElement('div');d.className='field';d.style.marginBottom='12px';d.innerHTML=`<div class="field-title">${label}</div><div class="radio-grid" id="${key}">${[1,2,3,4].map((n,i)=>`<button type="button" class="radio-btn ${i===0?'active':''}" data-value="${n}">${n}</button>`).join('')}</div><div class="small muted">1 = jauh di bawah harapan • 4 = sangat konsisten</div>`; $('sikapAspects').appendChild(d); bindRadioButtons(key);
    });
    body.appendChild(formActions(async()=>{
      await saveGeneric('saveSikap',{periode:$('sikapPeriode').value,disiplin:getRadioValue('disiplin'),atribut:getRadioValue('atribut'),kesopanan:getRadioValue('kesopanan'),keaktifan:getRadioValue('keaktifan'),catatan:$('sikapNote').value},'Penilaian sikap tersimpan.');
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

  function scaleBlock(key,label){const div=document.createElement('div');div.className='field';div.style.marginBottom='14px';div.innerHTML=`<div class="field-title">${label}</div><div class="scale-row" id="scale-${key}">${[-3,-2,-1,0,1,2,3].map((n,i)=>`<button type="button" class="scale-btn ${i===3?'active':''}" data-value="${n}">${n>0?`+${n}`:n}</button>`).join('')}</div><div class="scale-caption"><span>Sangat di bawah harapan</span><span>0 = sesuai harapan</span><span>Sangat di atas harapan</span></div></div>`;div.querySelectorAll('.scale-btn').forEach(btn=>btn.addEventListener('click',()=>{div.querySelectorAll('.scale-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}));return div;}
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
  $('closeFormBtn').addEventListener('click',()=>$('formSection').classList.add('hidden'));

  ensureIdentity();
  refreshState();
  setInterval(refreshState,BM42_STATE_POLL_MS);
})();
